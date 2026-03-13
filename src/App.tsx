import React, { useState, useCallback, useRef, useEffect, lazy, Suspense } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { save, open } from '@tauri-apps/plugin-dialog';
import { Layers, Box, FileText, Cpu, Save, FilePlus, Keyboard } from 'lucide-react';
import { ADFProject, ProjectPresetLibrary, TimelineTrack, createProject, uid } from './lib/adf';
import { CURRENT_PROJECT_SCHEMA, migrateProjectData } from './lib/migrations';
import { applyBranchMerge, applyBranchMergeResolutions, BranchMergePreview, captureBranchSnapshot, compareBranches, createBranchFromActive, ensureGraph, previewBranchMerge, switchToBranch } from './lib/branchGraph';
import { activateDesignNode, createDesignVariant, promoteDesignNode, recordActiveNodeMetrics, syncDesignGraph, updateDesignNodeObjective } from './lib/designGraph';
import { runLivingBuildingSolver } from './lib/livingSolver';
import AIChat from './components/AIChat';
import './App.css';

const PlansTab = lazy(() => import('./tabs/PlansTab'));
const ThreeDTab = lazy(() => import('./tabs/ThreeDTab'));
const DocsTab = lazy(() => import('./tabs/DocsTab'));
const KeybindingsTab = lazy(() => import('./tabs/KeybindingsTab'));
const GraphTab = lazy(() => import('./tabs/GraphTab'));

type TabId = 'plans' | '3d' | 'docs' | 'keys' | 'graph';

interface Tab { id: TabId; label: string; icon: React.ReactNode; shortcut: string; }

const AUTOSAVE_KEY = 'archflow.autosave.project.v1';
const UI_STATE_KEY = 'archflow.ui-state.v1';

const TABS: Tab[] = [
  { id: 'plans', label: '2D Plans',      icon: <Layers size={14}/>,   shortcut: '1' },
  { id: '3d',    label: '3D / Render',   icon: <Box size={14}/>,      shortcut: '2' },
  { id: 'docs',  label: 'Documentation', icon: <FileText size={14}/>, shortcut: '3' },
  { id: 'keys',  label: 'Keybindings',   icon: <Keyboard size={14}/>, shortcut: '4' },
  { id: 'graph', label: 'Design Graph',  icon: <Cpu size={14}/>,      shortcut: '5' },
];

export default function App() {
  const hydratedRef = useRef(false);
  const [activeTab, setActiveTab] = useState<TabId>('plans');
  const [project, setProject] = useState<ADFProject>(createProject('Untitled Project'));
  const [showAI, setShowAI] = useState(false);
  const [activeFloorIndex, setActiveFloorIndex] = useState(0);
  const [statusMsg, setStatusMsg] = useState('Ready');
  const [isTimelinePlaying, setIsTimelinePlaying] = useState(false);
  const [timelineSpeed, setTimelineSpeed] = useState(1);
  const [selectedTrackId, setSelectedTrackId] = useState('');
  const [compareBaseBranchId, setCompareBaseBranchId] = useState('');
  const [mergeSourceBranchId, setMergeSourceBranchId] = useState('');
  const [mergePreview, setMergePreview] = useState<BranchMergePreview | null>(null);
  const [mergeConflictResolutions, setMergeConflictResolutions] = useState<Record<string, 'prefer_source' | 'prefer_target'>>({});
  const [showTimelineEditor, setShowTimelineEditor] = useState(false);
  const trackImportRef = useRef<HTMLInputElement>(null);
  const lastPlaybackEventRef = useRef<string | null>(null);

  const activeFloor = project.floors[activeFloorIndex];

  useEffect(() => {
    try {
      const savedProject = window.localStorage.getItem(AUTOSAVE_KEY);
      if (savedProject) {
        const parsed = JSON.parse(savedProject) as unknown;
        const { project: migrated, report } = migrateProjectData(parsed);
        if (migrated && Array.isArray(migrated.floors) && Array.isArray(migrated.layers)) {
          setProject(migrated);
          setStatusMsg(
            report.applied.length > 0
              ? `Recovered autosaved project (migrated ${report.from} -> ${report.to})`
              : 'Recovered autosaved project'
          );
        }
      }

      const savedUi = window.localStorage.getItem(UI_STATE_KEY);
      if (savedUi) {
        const parsedUi = JSON.parse(savedUi) as { activeTab?: TabId; activeFloorIndex?: number };
        if (parsedUi.activeTab && TABS.some(tab => tab.id === parsedUi.activeTab)) {
          setActiveTab(parsedUi.activeTab);
        }
        if (typeof parsedUi.activeFloorIndex === 'number') {
          setActiveFloorIndex(Math.max(0, parsedUi.activeFloorIndex));
        }
      }
    } catch {
      setStatusMsg('Autosave recovery failed, starting clean');
    } finally {
      hydratedRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    const timeoutId = window.setTimeout(() => {
      window.localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(project));
    }, 300);
    return () => window.clearTimeout(timeoutId);
  }, [project]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    window.localStorage.setItem(UI_STATE_KEY, JSON.stringify({ activeTab, activeFloorIndex }));
  }, [activeTab, activeFloorIndex]);

  useEffect(() => {
    if (!project.floors[activeFloorIndex]) {
      setActiveFloorIndex(0);
    }
  }, [project.floors, activeFloorIndex]);

  useEffect(() => {
    const onWindowKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) {
        return;
      }

      if (event.ctrlKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void handleSave();
        return;
      }
      if (event.ctrlKey && event.key.toLowerCase() === 'o') {
        event.preventDefault();
        void handleOpen();
        return;
      }
      if (event.ctrlKey && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        handleNewProject();
        return;
      }

      if (!event.ctrlKey && !event.altKey) {
        if (event.key === '1') setActiveTab('plans');
        else if (event.key === '2') setActiveTab('3d');
        else if (event.key === '3') setActiveTab('docs');
        else if (event.key === '4') setActiveTab('keys');
        else if (event.key === '5') setActiveTab('graph');
      }
    };

    window.addEventListener('keydown', onWindowKeyDown);
    return () => window.removeEventListener('keydown', onWindowKeyDown);
  });

  const updateProject = useCallback((updater: (p: ADFProject) => ADFProject) => {
    setProject(prev => ({ ...updater(prev), modifiedAt: new Date().toISOString() }));
  }, []);

  useEffect(() => {
    if (!isTimelinePlaying) return;
    const intervalId = window.setInterval(() => {
      updateProject(prev => {
        const currentTimeline = prev.timeline || { activeTime: 0, tracks: [] };
        return {
          ...prev,
          timeline: {
            ...currentTimeline,
            activeTime: currentTimeline.activeTime + 0.1 * timelineSpeed,
          },
        };
      });
    }, 100);
    return () => window.clearInterval(intervalId);
  }, [isTimelinePlaying, timelineSpeed, updateProject]);

  useEffect(() => {
    const tracks = project.timeline?.tracks || [];
    if (tracks.length === 0) {
      if (selectedTrackId) setSelectedTrackId('');
      return;
    }
    if (!selectedTrackId || !tracks.some(track => track.id === selectedTrackId)) {
      setSelectedTrackId(tracks[0].id);
    }
  }, [project.timeline?.tracks, selectedTrackId]);

  useEffect(() => {
    const graph = ensureGraph(project);
    const activeId = graph.activeBranchId;
    const candidates = graph.nodes.filter(node => node.id !== activeId);
    if (candidates.length === 0) {
      if (compareBaseBranchId) setCompareBaseBranchId('');
      return;
    }
    if (!compareBaseBranchId || !candidates.some(node => node.id === compareBaseBranchId)) {
      setCompareBaseBranchId(candidates[0].id);
    }
  }, [project, compareBaseBranchId]);

  useEffect(() => {
    const graph = ensureGraph(project);
    const activeId = graph.activeBranchId;
    const candidates = graph.nodes.filter(node => node.id !== activeId);
    if (candidates.length === 0) {
      if (mergeSourceBranchId) setMergeSourceBranchId('');
      return;
    }
    if (!mergeSourceBranchId || !candidates.some(node => node.id === mergeSourceBranchId)) {
      setMergeSourceBranchId(candidates[0].id);
    }
  }, [project, mergeSourceBranchId]);

  useEffect(() => {
    const activeTime = project.timeline?.activeTime || 0;
    const tracks = project.timeline?.tracks || [];
    const elapsed = tracks
      .flatMap(track => track.events)
      .filter(event => event.time <= activeTime)
      .sort((a, b) => b.time - a.time);

    const latest = elapsed[0];
    if (latest && latest.id !== lastPlaybackEventRef.current) {
      lastPlaybackEventRef.current = latest.id;
      if (isTimelinePlaying) {
        setStatusMsg(`Timeline event: ${latest.type} @ T${latest.time.toFixed(1)} d`);
      }
    }
  }, [project.timeline?.activeTime, project.timeline?.tracks, isTimelinePlaying]);

  const handleNewProject = useCallback(() => {
    if (confirm('Create a new project? Unsaved changes will be lost.')) {
      setProject(createProject('Untitled Project'));
      setActiveFloorIndex(0);
      setStatusMsg('New project created');
    }
  }, []);

  const handleSave = useCallback(async () => {
    try {
      setStatusMsg('Saving…');
      const filePath = await save({ filters: [{ name: 'ADF Project', extensions: ['adf.json'] }], defaultPath: `${project.projectName}.adf.json` });
      if (!filePath) return;
      await invoke('save_project', { path: filePath, data: project });
      setStatusMsg(`Saved to ${filePath}`);
    } catch (err) {
      setStatusMsg(`Error saving: ${err}`);
    }
  }, [project]);

  const handleOpen = useCallback(async () => {
    try {
      const filePath = await open({ filters: [{ name: 'ADF Project', extensions: ['adf.json', 'json'] }] });
      if (!filePath) return;
      setStatusMsg('Opening project…');
      const result = await invoke<ADFProject>('load_project', { path: filePath });
      if (result) {
        const { project: migrated, report } = migrateProjectData(result);
        setProject(migrated);
        setActiveFloorIndex(0);
        if (report.applied.length > 0) {
          setStatusMsg(`Opened: ${(migrated as any).projectName || 'project'} (migrated to schema ${CURRENT_PROJECT_SCHEMA})`);
        } else {
          setStatusMsg(`Opened: ${(migrated as any).projectName || 'project'}`);
        }
      }
    } catch (err) {
      setStatusMsg(`Open failed: ${err}`);
    }
  }, []);

  const handleCreateBranch = useCallback(() => {
    const branchName = prompt('Branch name', `Branch ${Math.max(1, (project.branchGraph?.nodes.length || 1))}`);
    if (!branchName) return;
    const objective = prompt('Design objective', 'Explore alternative massing') || undefined;
    updateProject(prev => {
      const result = createDesignVariant(prev, branchName, objective);
      return syncDesignGraph(result.project);
    });
    setStatusMsg(`Created design variant: ${branchName}`);
  }, [project.branchGraph?.nodes.length, updateProject]);

  const handleActivateGraphNode = useCallback((nodeId: string) => {
    try {
      updateProject(prev => syncDesignGraph(activateDesignNode(prev, nodeId)));
      setStatusMsg('Activated design node');
    } catch (err) {
      setStatusMsg(`Graph activation failed: ${err}`);
    }
  }, [updateProject]);

  const handlePromoteGraphNode = useCallback((nodeId: string) => {
    updateProject(prev => syncDesignGraph(promoteDesignNode(prev, nodeId)));
    setStatusMsg('Design node promoted');
  }, [updateProject]);

  const handleEditGraphObjective = useCallback((nodeId: string) => {
    const objective = prompt('Objective for this design node', 'Improve daylight and reduce embodied carbon');
    if (!objective) return;
    updateProject(prev => syncDesignGraph(updateDesignNodeObjective(prev, nodeId, objective)));
    setStatusMsg('Design objective updated');
  }, [updateProject]);

  const handleSwitchBranch = useCallback((branchId: string) => {
    try {
      updateProject(prev => switchToBranch(prev, branchId));
      const branchName = project.branchGraph?.nodes.find(node => node.id === branchId)?.name || branchId;
      setStatusMsg(`Switched to branch: ${branchName}`);
    } catch (err) {
      setStatusMsg(`Branch switch failed: ${err}`);
    }
  }, [project.branchGraph?.nodes, updateProject]);

  const handleCompareActiveBranch = useCallback(() => {
    const graph = ensureGraph(project);
    const activeId = graph.activeBranchId;
    const baseline = graph.nodes.find(node => node.id === compareBaseBranchId) || graph.nodes.find(node => node.id !== activeId);
    if (!baseline) {
      setStatusMsg('Need at least two branches to compare');
      return;
    }

    try {
      const comparison = compareBranches(project, baseline.id, activeId);
      const topDelta = comparison.floors
        .slice()
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
      setStatusMsg(
        `Branch delta vs ${baseline.name}: ${comparison.totalDelta >= 0 ? '+' : ''}${comparison.totalDelta} entities${topDelta ? `, max on ${topDelta.floorName}: ${topDelta.delta >= 0 ? '+' : ''}${topDelta.delta}` : ''}`
      );
    } catch (err) {
      setStatusMsg(`Branch compare failed: ${err}`);
    }
  }, [project, compareBaseBranchId]);

  const handleCaptureActiveBranchSnapshot = useCallback(() => {
    updateProject(prev => {
      const graph = ensureGraph(prev);
      const activeId = graph.activeBranchId;
      const snapshot = captureBranchSnapshot(prev);
      return {
        ...prev,
        branchGraph: {
          ...graph,
          nodes: graph.nodes.map(node => (
            node.id === activeId
              ? { ...node, snapshot }
              : node
          )),
        },
      };
    });
    setStatusMsg('Captured snapshot for active branch');
  }, [updateProject]);

  const handlePreviewMerge = useCallback(() => {
    const graph = ensureGraph(project);
    const targetBranchId = graph.activeBranchId;
    if (!mergeSourceBranchId) {
      setStatusMsg('Select a source branch for merge preview');
      return;
    }
    if (mergeSourceBranchId === targetBranchId) {
      setStatusMsg('Source and target branches must be different');
      return;
    }

    try {
      const preview = previewBranchMerge(project, mergeSourceBranchId, targetBranchId);
      setMergePreview(preview);
      const defaults: Record<string, 'prefer_source' | 'prefer_target'> = {};
      preview.conflicts.forEach(conflict => {
        defaults[`${conflict.floorId}::${conflict.entityId}`] = 'prefer_target';
      });
      setMergeConflictResolutions(defaults);
      setStatusMsg(`Merge preview: +${preview.addedCount}, ~${preview.updatedCount}, conflicts ${preview.conflictCount}`);
    } catch (err) {
      setStatusMsg(`Merge preview failed: ${err}`);
    }
  }, [mergeSourceBranchId, project]);

  const handleApplyMerge = useCallback((strategy: 'prefer_source' | 'prefer_target') => {
    const graph = ensureGraph(project);
    const targetBranchId = graph.activeBranchId;
    if (!mergeSourceBranchId) {
      setStatusMsg('Select a source branch for merge apply');
      return;
    }

    try {
      let appliedPreview: BranchMergePreview | null = null;
      updateProject(prev => {
        const result = applyBranchMerge(prev, mergeSourceBranchId, targetBranchId, strategy);
        appliedPreview = result.preview;
        return result.project;
      });
      if (appliedPreview) {
        setMergePreview(appliedPreview);
        setStatusMsg(`Merge applied (${strategy}): ${appliedPreview.conflictCount} conflict(s)`);
      } else {
        setStatusMsg(`Merge applied (${strategy})`);
      }
    } catch (err) {
      setStatusMsg(`Merge apply failed: ${err}`);
    }
  }, [mergeSourceBranchId, project, updateProject]);

  const handleApplyMergePerEntity = useCallback(() => {
    const graph = ensureGraph(project);
    const targetBranchId = graph.activeBranchId;
    if (!mergeSourceBranchId) {
      setStatusMsg('Select a source branch for merge apply');
      return;
    }
    if (!mergePreview) {
      setStatusMsg('Run merge preview first');
      return;
    }

    try {
      const resolutions = mergePreview.conflicts.map(conflict => {
        const key = `${conflict.floorId}::${conflict.entityId}`;
        return {
          floorId: conflict.floorId,
          entityId: conflict.entityId,
          action: mergeConflictResolutions[key] || 'prefer_target',
        };
      });

      updateProject(prev => applyBranchMergeResolutions(prev, mergeSourceBranchId, targetBranchId, resolutions).project);
      setStatusMsg(`Per-entity merge applied with ${resolutions.length} conflict decisions`);
    } catch (err) {
      setStatusMsg(`Per-entity merge failed: ${err}`);
    }
  }, [mergeConflictResolutions, mergePreview, mergeSourceBranchId, project, updateProject]);

  const handleAddTimelineTrack = useCallback(() => {
    const rawName = prompt('Timeline track name', `Track ${Math.max(1, (project.timeline?.tracks.length || 0) + 1)}`);
    if (!rawName) return;
    const name = rawName.trim();
    if (!name) return;

    const rawKind = prompt('Track kind (construction, aging, sun, occupancy, maintenance, custom)', 'construction');
    const allowedKinds: TimelineTrack['kind'][] = ['construction', 'aging', 'sun', 'occupancy', 'maintenance', 'custom'];
    const kind = (rawKind || 'construction').trim() as TimelineTrack['kind'];
    const safeKind = allowedKinds.includes(kind) ? kind : 'custom';

    const nextTrackId = uid();
    updateProject(prev => {
      const timeline = prev.timeline || { activeTime: 0, tracks: [] };
      return {
        ...prev,
        timeline: {
          ...timeline,
          tracks: [...timeline.tracks, { id: nextTrackId, name, kind: safeKind, events: [] }],
        },
      };
    });
    setSelectedTrackId(nextTrackId);
    setStatusMsg(`Timeline track added: ${name}`);
  }, [project.timeline?.tracks.length, updateProject]);

  const handleAddTimelineEvent = useCallback(() => {
    if (!selectedTrackId) {
      setStatusMsg('Select or create a timeline track first');
      return;
    }

    const eventType = (prompt('Event type', 'snapshot') || '').trim();
    if (!eventType) return;

    const activeTime = project.timeline?.activeTime || 0;
    const rawTime = prompt('Event time (days)', activeTime.toFixed(1));
    if (!rawTime) return;
    const parsedTime = Number(rawTime);
    if (!Number.isFinite(parsedTime) || parsedTime < 0) {
      setStatusMsg('Invalid event time');
      return;
    }

    updateProject(prev => {
      const timeline = prev.timeline || { activeTime: 0, tracks: [] };
      return {
        ...prev,
        timeline: {
          ...timeline,
          tracks: timeline.tracks.map(track => (
            track.id !== selectedTrackId
              ? track
              : {
                  ...track,
                  events: [
                    ...track.events,
                    {
                      id: uid(),
                      time: parsedTime,
                      type: eventType,
                      entityId: activeFloor?.id,
                      payload: { entityCount: activeFloor?.entities.length || 0 },
                    },
                  ].sort((a, b) => a.time - b.time),
                }
          )),
        },
      };
    });
    setStatusMsg(`Timeline event added: ${eventType} @ T${parsedTime.toFixed(1)} d`);
  }, [activeFloor, project.timeline?.activeTime, selectedTrackId, updateProject]);

  const handleDeleteTimelineEvent = useCallback((eventId: string) => {
    if (!selectedTrackId) return;
    updateProject(prev => {
      const timeline = prev.timeline || { activeTime: 0, tracks: [] };
      return {
        ...prev,
        timeline: {
          ...timeline,
          tracks: timeline.tracks.map(track => (
            track.id !== selectedTrackId
              ? track
              : { ...track, events: track.events.filter(event => event.id !== eventId) }
          )),
        },
      };
    });
    setStatusMsg('Timeline event deleted');
  }, [selectedTrackId, updateProject]);

  const handleEditTimelineEvent = useCallback((eventId: string) => {
    if (!selectedTrackId) return;
    const selectedTrack = (project.timeline?.tracks || []).find(track => track.id === selectedTrackId);
    const target = selectedTrack?.events.find(event => event.id === eventId);
    if (!target) return;

    const nextType = (prompt('Event type', target.type) || '').trim();
    if (!nextType) return;
    const nextTimeRaw = prompt('Event time (days)', target.time.toFixed(1));
    if (!nextTimeRaw) return;
    const nextTime = Number(nextTimeRaw);
    if (!Number.isFinite(nextTime) || nextTime < 0) {
      setStatusMsg('Invalid event time');
      return;
    }

    updateProject(prev => {
      const timeline = prev.timeline || { activeTime: 0, tracks: [] };
      return {
        ...prev,
        timeline: {
          ...timeline,
          tracks: timeline.tracks.map(track => (
            track.id !== selectedTrackId
              ? track
              : {
                  ...track,
                  events: track.events
                    .map(event => event.id === eventId ? { ...event, type: nextType, time: nextTime } : event)
                    .sort((a, b) => a.time - b.time),
                }
          )),
        },
      };
    });
    setStatusMsg(`Timeline event updated: ${nextType}`);
  }, [project.timeline?.tracks, selectedTrackId, updateProject]);

  const handleJumpToTimelineEvent = useCallback((time: number) => {
    updateProject(prev => ({
      ...prev,
      timeline: {
        ...(prev.timeline || { activeTime: 0, tracks: [] }),
        activeTime: time,
      },
    }));
    setIsTimelinePlaying(false);
    setStatusMsg(`Jumped to T${time.toFixed(1)} d`);
  }, [updateProject]);

  const handleDuplicateTimelineRange = useCallback(() => {
    if (!selectedTrackId) {
      setStatusMsg('Select a track first');
      return;
    }
    const startRaw = prompt('Duplicate range start time (days)', '0');
    const endRaw = prompt('Duplicate range end time (days)', '30');
    const offsetRaw = prompt('Duplicate offset (days)', '30');
    if (!startRaw || !endRaw || !offsetRaw) return;
    const start = Number(startRaw);
    const end = Number(endRaw);
    const offset = Number(offsetRaw);
    if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(offset) || end < start) {
      setStatusMsg('Invalid duplicate range');
      return;
    }

    updateProject(prev => {
      const timeline = prev.timeline || { activeTime: 0, tracks: [] };
      return {
        ...prev,
        timeline: {
          ...timeline,
          tracks: timeline.tracks.map(track => {
            if (track.id !== selectedTrackId) return track;
            const clones = track.events
              .filter(event => event.time >= start && event.time <= end)
              .map(event => ({ ...event, id: uid(), time: event.time + offset }));
            return { ...track, events: [...track.events, ...clones].sort((a, b) => a.time - b.time) };
          }),
        },
      };
    });
    setStatusMsg('Timeline range duplicated');
  }, [selectedTrackId, updateProject]);

  const handleShiftTimelineRange = useCallback(() => {
    if (!selectedTrackId) {
      setStatusMsg('Select a track first');
      return;
    }
    const startRaw = prompt('Shift range start time (days)', '0');
    const endRaw = prompt('Shift range end time (days)', '30');
    const deltaRaw = prompt('Shift delta (days, can be negative)', '7');
    if (!startRaw || !endRaw || !deltaRaw) return;
    const start = Number(startRaw);
    const end = Number(endRaw);
    const delta = Number(deltaRaw);
    if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(delta) || end < start) {
      setStatusMsg('Invalid shift range');
      return;
    }

    updateProject(prev => {
      const timeline = prev.timeline || { activeTime: 0, tracks: [] };
      return {
        ...prev,
        timeline: {
          ...timeline,
          tracks: timeline.tracks.map(track => {
            if (track.id !== selectedTrackId) return track;
            return {
              ...track,
              events: track.events
                .map(event => (
                  event.time >= start && event.time <= end
                    ? { ...event, time: Math.max(0, event.time + delta) }
                    : event
                ))
                .sort((a, b) => a.time - b.time),
            };
          }),
        },
      };
    });
    setStatusMsg('Timeline range shifted');
  }, [selectedTrackId, updateProject]);

  const handleExportTimelineTrack = useCallback(() => {
    const track = (project.timeline?.tracks || []).find(t => t.id === selectedTrackId);
    if (!track) {
      setStatusMsg('Select a track first');
      return;
    }
    const payload = {
      format: 'archflow.timeline.track.v1',
      exportedAt: new Date().toISOString(),
      track,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${track.name.replace(/\s+/g, '_').toLowerCase()}_track.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatusMsg(`Exported track: ${track.name}`);
  }, [project.timeline?.tracks, selectedTrackId]);

  const handleImportTimelineTrackClick = useCallback(() => {
    trackImportRef.current?.click();
  }, []);

  const handleImportTimelineTrackFile = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(String(reader.result)) as { track?: TimelineTrack; format?: string };
        if (!payload.track) {
          setStatusMsg('Invalid timeline track file');
          return;
        }

        const imported: TimelineTrack = {
          ...payload.track,
          id: uid(),
          name: `${payload.track.name} (Imported)`,
          events: (payload.track.events || []).map(ev => ({ ...ev, id: uid() })),
        };

        updateProject(prev => {
          const timeline = prev.timeline || { activeTime: 0, tracks: [] };
          return {
            ...prev,
            timeline: {
              ...timeline,
              tracks: [...timeline.tracks, imported],
            },
          };
        });
        setSelectedTrackId(imported.id);
        setStatusMsg(`Imported track: ${imported.name}`);
      } catch {
        setStatusMsg('Failed to parse timeline track file');
      }
    };
    reader.readAsText(file);
  }, [updateProject]);

  const selectedTrack = (project.timeline?.tracks || []).find(track => track.id === selectedTrackId) || null;
  const selectedTrackEvents = selectedTrack ? [...selectedTrack.events].sort((a, b) => a.time - b.time) : [];
  const sortedConstraintRules = (project.constraintRules || []).slice().sort((a, b) => a.name.localeCompare(b.name));

  const handleUpdateConstraintRule = useCallback((
    ruleId: string,
    updates: Partial<{ enabled: boolean; weight: number; threshold: number | undefined }>
  ) => {
    updateProject(prev => ({
      ...prev,
      constraintRules: (prev.constraintRules || []).map(rule => {
        if (rule.id !== ruleId) return rule;
        return {
          ...rule,
          ...updates,
          weight: typeof updates.weight === 'number' && Number.isFinite(updates.weight)
            ? Math.max(0, updates.weight)
            : rule.weight,
        };
      }),
    }));
  }, [updateProject]);

  const handleExportDXF = async () => {
    try {
      const filePath = await save({ filters: [{ name: 'DXF', extensions: ['dxf'] }], defaultPath: `${project.projectName}.dxf` });
      if (!filePath) return;
      setStatusMsg('Exporting DXF…');
      await invoke('export_dxf', { path: filePath, floorData: activeFloor });
      setStatusMsg(`DXF exported to ${filePath}`);
    } catch (err) {
      setStatusMsg(`DXF export: ${err}`);
    }
  };

  const handleExportPDF = async () => {
    try {
      const filePath = await save({ filters: [{ name: 'PDF', extensions: ['pdf'] }], defaultPath: `${project.projectName}.pdf` });
      if (!filePath) return;
      setStatusMsg('Exporting PDF…');
      await invoke('export_pdf', { floor: activeFloor, outPath: filePath });
      setStatusMsg(`PDF exported to ${filePath}`);
    } catch (err) {
      setStatusMsg(`PDF export: ${err}`);
    }
  };

  const handleApplyAILayout = (layoutData: Record<string, unknown>) => {
    const pipeline = layoutData.ai_pipeline as Record<string, unknown> | undefined;
    const designSpec = (pipeline?.design_spec as Record<string, unknown> | undefined) || undefined;
    updateProject(p => {
      const updatedFloors = [...p.floors];
      if (updatedFloors[0]) {
        updatedFloors[0] = {
          ...updatedFloors[0],
          entities: (layoutData.entities as Record<string, unknown>[]).map(e => e as never) || [],
        };
      }
      return {
        ...p,
        generatedFromPrompt: layoutData.generated_from_prompt as string,
        buildingType: layoutData.building_type as string,
        layers: (layoutData.layers as never[]) || p.layers,
        floors: updatedFloors,
        aiPipelineReport: pipeline,
        designSpecification: designSpec,
      };
    });
    setActiveTab('plans');
    setStatusMsg('AI floor plan applied — pipeline audit saved to project metadata');
  };

  return (
    <div className="app-root">
      {/* Custom Titlebar */}
      <div className="titlebar" data-tauri-drag-region>
        <div className="titlebar-left">
          <div className="app-logo">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M3 21L12 3L21 21H3Z" stroke="var(--accent)" strokeWidth="1.5" strokeLinejoin="round"/>
              <path d="M7 21L12 11L17 21" stroke="var(--accent)" strokeWidth="1" strokeLinejoin="round" opacity="0.5"/>
            </svg>
          </div>
          <span className="app-title">ArchFlow</span>
          <span className="project-name">{project.projectName}</span>
        </div>

        <div className="titlebar-menu">
          {[
            { label: 'File', items: ['New Project', 'Open…', 'Save', 'Save As…', '---', 'Export DXF', 'Export PDF', '---', 'Exit'] },
            { label: 'Edit', items: ['Undo', 'Redo', '---', 'Select All', 'Delete Selected'] },
            { label: 'View', items: ['Plans (1)', '3D / Render (2)', 'Documentation (3)', 'Keybindings (4)', 'Design Graph (5)', '---', 'Toggle AI Panel', 'Zoom Fit'] },
            { label: 'Help', items: ['Documentation', 'About ArchFlow'] },
          ].map(menu => (
            <MenuDropdown key={menu.label} label={menu.label} items={menu.items}
              onSelect={(item) => {
                if (item === 'New Project') handleNewProject();
                else if (item === 'Open…') handleOpen();
                else if (item === 'Save') handleSave();
                else if (item === 'Save As…') handleSave();
                else if (item === 'Export DXF') handleExportDXF();
                else if (item === 'Export PDF') handleExportPDF();
                else if (item === 'Exit') invoke('plugin:window|close');
                else if (item === 'Undo') window.dispatchEvent(new CustomEvent('archflow:undo'));
                else if (item === 'Redo') window.dispatchEvent(new CustomEvent('archflow:redo'));
                else if (item === 'Select All') window.dispatchEvent(new CustomEvent('archflow:selectall'));
                else if (item === 'Delete Selected') window.dispatchEvent(new CustomEvent('archflow:delete'));
                else if (item === 'Plans (1)') setActiveTab('plans');
                else if (item === '3D / Render (2)') setActiveTab('3d');
                else if (item === 'Documentation (3)') setActiveTab('docs');
                else if (item === 'Keybindings (4)') setActiveTab('keys');
                else if (item === 'Design Graph (5)') setActiveTab('graph');
                else if (item === 'Toggle AI Panel') setShowAI(v => !v);
                else if (item === 'Zoom Fit') window.dispatchEvent(new CustomEvent('archflow:zoomfit'));
              }}
            />
          ))}
        </div>

        <div className="titlebar-actions">
          <button className="btn ghost icon-only" onClick={() => setShowAI(v => !v)} title="AI Assistant (⌘K)" style={showAI ? { color: 'var(--accent)' } : {}}>
            <Cpu size={14}/>
          </button>
          <button className="btn ghost icon-only" onClick={handleNewProject} title="New Project"><FilePlus size={13}/></button>
          <button className="btn ghost icon-only" onClick={handleSave} title="Save"><Save size={13}/></button>
        </div>

        <div className="titlebar-controls">
          <button className="win-btn minimize" onClick={() => invoke('plugin:window|minimize')} />
          <button className="win-btn maximize"  onClick={() => invoke('plugin:window|toggle_maximize')} />
          <button className="win-btn close"     onClick={() => invoke('plugin:window|close')} />
        </div>
      </div>

      {/* Tab Bar */}
      <div className="tab-bar">
        {TABS.map(tab => (
          <button key={tab.id}
            className={`tab-btn${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon}
            <span>{tab.label}</span>
            <kbd className="tab-shortcut">{tab.shortcut}</kbd>
          </button>
        ))}

        <div className="tab-bar-sep" />

        {/* Floor selector */}
        <div className="floor-selector">
          <select value={activeFloorIndex}
            onChange={e => setActiveFloorIndex(Number(e.target.value))}
            style={{ width: 'auto', padding: '3px 6px', fontSize: 11 }}>
            {project.floors.map((fl, i) => (
              <option key={fl.id} value={i}>{fl.name}</option>
            ))}
          </select>
          <button className="btn ghost icon-only" title="Add Floor" style={{ padding: '3px 6px' }} onClick={() => {
            updateProject(p => ({
              ...p,
              floors: [...p.floors, {
                id: crypto.randomUUID(), name: `Floor ${p.floors.length}`,
                level: p.floors.length, elevation: p.floors.length * 3000,
                floorHeight: 3000, entities: [], dependencyMetadata: { recentReports: [], recentConstraintReports: [] }
              }]
            }));
          }}>+</button>
        </div>

        <div className="branch-controls">
          <select
            value={project.branchGraph?.activeBranchId || ''}
            onChange={e => handleSwitchBranch(e.target.value)}
            title="Active branch"
          >
            {(project.branchGraph?.nodes || []).map(node => (
              <option key={node.id} value={node.id}>{node.name}</option>
            ))}
          </select>
          <select
            value={compareBaseBranchId}
            onChange={e => setCompareBaseBranchId(e.target.value)}
            title="Compare baseline"
          >
            {(project.branchGraph?.nodes || [])
              .filter(node => node.id !== project.branchGraph?.activeBranchId)
              .map(node => (
                <option key={node.id} value={node.id}>{node.name}</option>
              ))}
          </select>
          <button className="btn ghost" onClick={handleCreateBranch} title="Create branch snapshot">Branch+</button>
          <button className="btn ghost" onClick={handleCaptureActiveBranchSnapshot} title="Capture snapshot">Snapshot</button>
          <button className="btn ghost" onClick={handleCompareActiveBranch} title="Compare active branch">Compare</button>
          <select
            value={mergeSourceBranchId}
            onChange={e => setMergeSourceBranchId(e.target.value)}
            title="Merge source"
          >
            {(project.branchGraph?.nodes || [])
              .filter(node => node.id !== project.branchGraph?.activeBranchId)
              .map(node => (
                <option key={node.id} value={node.id}>{node.name}</option>
              ))}
          </select>
          <button className="btn ghost" onClick={handlePreviewMerge} title="Preview merge">Merge Preview</button>
          <button className="btn ghost" onClick={() => handleApplyMerge('prefer_source')} title="Apply merge preferring source">Apply Src</button>
          <button className="btn ghost" onClick={() => handleApplyMerge('prefer_target')} title="Apply merge preferring target">Apply Tgt</button>
        </div>

        <div className="timeline-controls">
          <button className="btn ghost" onClick={() => setIsTimelinePlaying(v => !v)}>
            {isTimelinePlaying ? 'Pause' : 'Play'}
          </button>
          <input
            type="range"
            min={0}
            max={365}
            step={0.1}
            value={project.timeline?.activeTime || 0}
            onChange={e => {
              const next = Number(e.target.value);
              updateProject(prev => ({
                ...prev,
                timeline: {
                  ...(prev.timeline || { activeTime: 0, tracks: [] }),
                  activeTime: next,
                },
              }));
            }}
          />
          <select value={timelineSpeed} onChange={e => setTimelineSpeed(Number(e.target.value))}>
            <option value={0.5}>0.5x</option>
            <option value={1}>1x</option>
            <option value={2}>2x</option>
            <option value={4}>4x</option>
          </select>
          <select
            value={selectedTrackId}
            onChange={e => setSelectedTrackId(e.target.value)}
            title="Timeline track"
          >
            {(project.timeline?.tracks || []).map(track => (
              <option key={track.id} value={track.id}>{track.name}</option>
            ))}
          </select>
          <button className="btn ghost" onClick={handleAddTimelineTrack} title="Create track">Track+</button>
          <button className="btn ghost" onClick={handleAddTimelineEvent} title="Add event">Event+</button>
          <button className="btn ghost" onClick={() => setShowTimelineEditor(v => !v)} title="Toggle timeline editor">Editor</button>
          <span className="timeline-time">T {Number(project.timeline?.activeTime || 0).toFixed(1)} d</span>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        {/* Tab Views */}
        <div className="tab-content">
          <Suspense fallback={<div style={{ padding: 16, color: 'var(--text-muted)' }}>Loading module...</div>}>
            {activeTab === 'plans' && (
              <PlansTab
                floor={activeFloor}
                layers={project.layers}
                activeTime={project.timeline?.activeTime || 0}
                isTimelinePlaying={isTimelinePlaying}
                onFloorChange={(updated) => {
                  const prevFloor = project.floors[activeFloorIndex];
                  const solved = runLivingBuildingSolver(prevFloor, updated, project.constraintRules, { maxIterations: 8 });
                  const report = solved.dependencyReport;
                  const graph = solved.graph;
                  const constraintReport = solved.constraintReport;
                  const autoCount = Math.max(0, solved.convergence.totalAdjustments - report.adjustedCount);
                  const convergeFlags = [
                    solved.convergence.cycleBroken ? 'cycle-break' : '',
                    solved.convergence.guardTriggered ? 'guard' : '',
                    solved.convergence.capped ? 'cap' : '',
                  ].filter(Boolean).join(', ');
                  if (report.adjustedCount > 0 || report.warnings.length > 0 || constraintReport.warningCount > 0 || autoCount > 0 || solved.convergence.iterations > 1) {
                    const base = report.adjustedCount > 0
                      ? `Living graph propagated ${report.adjustedCount} dependent update${report.adjustedCount === 1 ? '' : 's'}`
                      : 'Living graph diagnostics updated';
                    const warn = report.warnings.length > 0 ? ` (${report.warnings.length} warning${report.warnings.length === 1 ? '' : 's'})` : '';
                    const constraintWarn = constraintReport.warningCount > 0
                      ? ` + ${constraintReport.warningCount} constraint warning${constraintReport.warningCount === 1 ? '' : 's'}`
                      : '';
                    const auto = autoCount > 0
                      ? ` + ${autoCount} auto-adjustment${autoCount === 1 ? '' : 's'}`
                      : '';
                    const iter = solved.convergence.iterations > 1 ? ` [${solved.convergence.iterations} iters${convergeFlags ? `, ${convergeFlags}` : ''}]` : '';
                    setStatusMsg(`${base}${warn}${constraintWarn}${auto}${iter}`);
                  }
                  updateProject(p => {
                    const floors = [...p.floors];
                    const currentFloor = floors[activeFloorIndex];
                    const recentReports = [
                      ...(currentFloor.dependencyMetadata?.recentReports || []),
                      {
                        timestamp: new Date().toISOString(),
                        adjustedCount: report.adjustedCount,
                        edgeCount: graph.edges.length,
                        changedRoots: report.changedRoots,
                        impactedIds: report.impactedIds,
                        impactReasons: report.impactReasons,
                        warnings: report.warnings,
                      },
                    ].slice(-20);
                    const recentConstraintReports = [
                      ...(currentFloor.dependencyMetadata?.recentConstraintReports || []),
                      constraintReport,
                    ].slice(-20);
                    floors[activeFloorIndex] = {
                      ...solved.floor,
                      dependencyMetadata: {
                        lastReport: recentReports[recentReports.length - 1],
                        recentReports,
                        lastConstraintReport: recentConstraintReports[recentConstraintReports.length - 1],
                        recentConstraintReports,
                      },
                    };
                    const withFloors = { ...p, floors };
                    return syncDesignGraph(recordActiveNodeMetrics(withFloors, {
                      constraintWarnings: solved.constraintReport.warningCount,
                      adjustments: solved.convergence.totalAdjustments,
                      iterations: solved.convergence.iterations,
                    }));
                  });
                }}
                onLayersChange={(layers) => updateProject(p => ({ ...p, layers }))}
                onStatusChange={setStatusMsg}
              />
            )}
            {activeTab === '3d' && (
              <ThreeDTab floor={activeFloor} project={project} onStatusChange={setStatusMsg}
                activeTime={project.timeline?.activeTime || 0}
                isTimelinePlaying={isTimelinePlaying}
                onEntityUpdate={(entities) => {
                  const prevFloor = project.floors[activeFloorIndex];
                  const nextFloor = { ...prevFloor, entities };
                  const solved = runLivingBuildingSolver(prevFloor, nextFloor, project.constraintRules, { maxIterations: 8 });
                  const report = solved.dependencyReport;
                  const graph = solved.graph;
                  const constraintReport = solved.constraintReport;
                  const autoCount = Math.max(0, solved.convergence.totalAdjustments - report.adjustedCount);
                  const convergeFlags = [
                    solved.convergence.cycleBroken ? 'cycle-break' : '',
                    solved.convergence.guardTriggered ? 'guard' : '',
                    solved.convergence.capped ? 'cap' : '',
                  ].filter(Boolean).join(', ');
                  if (report.adjustedCount > 0 || report.warnings.length > 0 || constraintReport.warningCount > 0 || autoCount > 0 || solved.convergence.iterations > 1) {
                    const base = report.adjustedCount > 0
                      ? `Living graph propagated ${report.adjustedCount} dependent update${report.adjustedCount === 1 ? '' : 's'}`
                      : 'Living graph diagnostics updated';
                    const warn = report.warnings.length > 0 ? ` (${report.warnings.length} warning${report.warnings.length === 1 ? '' : 's'})` : '';
                    const constraintWarn = constraintReport.warningCount > 0
                      ? ` + ${constraintReport.warningCount} constraint warning${constraintReport.warningCount === 1 ? '' : 's'}`
                      : '';
                    const auto = autoCount > 0
                      ? ` + ${autoCount} auto-adjustment${autoCount === 1 ? '' : 's'}`
                      : '';
                    const iter = solved.convergence.iterations > 1 ? ` [${solved.convergence.iterations} iters${convergeFlags ? `, ${convergeFlags}` : ''}]` : '';
                    setStatusMsg(`${base}${warn}${constraintWarn}${auto}${iter}`);
                  }
                  updateProject(p => {
                    const floors = [...p.floors];
                    const currentFloor = floors[activeFloorIndex];
                    const recentReports = [
                      ...(currentFloor.dependencyMetadata?.recentReports || []),
                      {
                        timestamp: new Date().toISOString(),
                        adjustedCount: report.adjustedCount,
                        edgeCount: graph.edges.length,
                        changedRoots: report.changedRoots,
                        impactedIds: report.impactedIds,
                        impactReasons: report.impactReasons,
                        warnings: report.warnings,
                      },
                    ].slice(-20);
                    const recentConstraintReports = [
                      ...(currentFloor.dependencyMetadata?.recentConstraintReports || []),
                      constraintReport,
                    ].slice(-20);
                    floors[activeFloorIndex] = {
                      ...solved.floor,
                      dependencyMetadata: {
                        lastReport: recentReports[recentReports.length - 1],
                        recentReports,
                        lastConstraintReport: recentConstraintReports[recentConstraintReports.length - 1],
                        recentConstraintReports,
                      },
                    };
                    const withFloors = { ...p, floors };
                    return syncDesignGraph(recordActiveNodeMetrics(withFloors, {
                      constraintWarnings: solved.constraintReport.warningCount,
                      adjustments: solved.convergence.totalAdjustments,
                      iterations: solved.convergence.iterations,
                    }));
                  });
                }}
                onPresetLibraryChange={(library: ProjectPresetLibrary) => {
                  updateProject(p => ({ ...p, presetLibrary: library }));
                }} />
            )}
            {activeTab === 'docs' && (
              <DocsTab project={project} onProjectChange={setProject} onStatusChange={setStatusMsg} />
            )}
            {activeTab === 'keys' && <KeybindingsTab />}
            {activeTab === 'graph' && (
              <GraphTab
                project={project}
                onActivateNode={handleActivateGraphNode}
                onCreateVariant={handleCreateBranch}
                onPromoteNode={handlePromoteGraphNode}
                onEditObjective={handleEditGraphObjective}
              />
            )}
          </Suspense>
        </div>

        {showTimelineEditor && (
          <div className="timeline-editor-panel">
            <div className="timeline-editor-header">
              <strong>Timeline Editor</strong>
              <button className="btn ghost" onClick={() => setShowTimelineEditor(false)}>Close</button>
            </div>

            <div className="timeline-editor-controls">
              <label>Track</label>
              <select value={selectedTrackId} onChange={e => setSelectedTrackId(e.target.value)}>
                {(project.timeline?.tracks || []).map(track => (
                  <option key={track.id} value={track.id}>{track.name} ({track.kind})</option>
                ))}
              </select>
              <div className="timeline-editor-actions">
                <button className="btn ghost" onClick={handleAddTimelineTrack}>Add Track</button>
                <button className="btn ghost" onClick={handleAddTimelineEvent}>Add Event</button>
                <button className="btn ghost" onClick={handleDuplicateTimelineRange}>Duplicate Range</button>
                <button className="btn ghost" onClick={handleShiftTimelineRange}>Shift Range</button>
                <button className="btn ghost" onClick={handleExportTimelineTrack}>Export Track</button>
                <button className="btn ghost" onClick={handleImportTimelineTrackClick}>Import Track</button>
              </div>
              <input
                ref={trackImportRef}
                type="file"
                accept="application/json"
                style={{ display: 'none' }}
                onChange={handleImportTimelineTrackFile}
              />
            </div>

            {mergePreview && (
              <div className="merge-preview-box">
                Merge Preview: +{mergePreview.addedCount}, ~{mergePreview.updatedCount}, conflicts {mergePreview.conflictCount}
                {mergePreview.conflicts.length > 0 && (
                  <div className="merge-conflict-list">
                    {mergePreview.conflicts.slice(0, 20).map(conflict => {
                      const key = `${conflict.floorId}::${conflict.entityId}`;
                      return (
                        <div key={key} className="merge-conflict-row">
                          <span>{conflict.floorName}: {conflict.entityId}</span>
                          <select
                            value={mergeConflictResolutions[key] || 'prefer_target'}
                            onChange={e => setMergeConflictResolutions(prev => ({
                              ...prev,
                              [key]: e.target.value as 'prefer_source' | 'prefer_target',
                            }))}
                          >
                            <option value="prefer_target">Keep target</option>
                            <option value="prefer_source">Use source</option>
                          </select>
                        </div>
                      );
                    })}
                    <button className="btn ghost" onClick={handleApplyMergePerEntity}>Apply Per-Entity Merge</button>
                  </div>
                )}
              </div>
            )}

            <div className="rule-tuning-panel">
              <div className="rule-tuning-header">Living Rules</div>
              <div className="rule-tuning-list">
                {sortedConstraintRules.map(rule => (
                  <div key={rule.id} className="rule-tuning-row">
                    <label className="rule-tuning-name">
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={e => handleUpdateConstraintRule(rule.id, { enabled: e.target.checked })}
                      />
                      <span>{rule.name}</span>
                    </label>
                    <div className="rule-tuning-controls">
                      <label>
                        W
                        <input
                          type="number"
                          min={0}
                          step={0.1}
                          value={rule.weight}
                          onChange={e => handleUpdateConstraintRule(rule.id, { weight: Number(e.target.value) })}
                        />
                      </label>
                      <label>
                        T
                        <input
                          type="number"
                          step={1}
                          value={typeof rule.threshold === 'number' ? rule.threshold : ''}
                          onChange={e => {
                            const v = e.target.value;
                            handleUpdateConstraintRule(rule.id, { threshold: v === '' ? undefined : Number(v) });
                          }}
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="timeline-event-list">
              {selectedTrackEvents.length === 0 ? (
                <div className="timeline-empty">No events on this track.</div>
              ) : (
                selectedTrackEvents.map(event => (
                  <div key={event.id} className="timeline-event-row">
                    <div className="timeline-event-main">
                      <span className="timeline-event-time">T {event.time.toFixed(1)}</span>
                      <span className="timeline-event-type">{event.type}</span>
                    </div>
                    <div className="timeline-event-actions">
                      <button className="btn ghost" onClick={() => handleJumpToTimelineEvent(event.time)}>Jump</button>
                      <button className="btn ghost" onClick={() => handleEditTimelineEvent(event.id)}>Edit</button>
                      <button className="btn ghost" onClick={() => handleDeleteTimelineEvent(event.id)}>Delete</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* AI Chat Panel */}
        {showAI && (
          <AIChat
            project={project}
            onApplyLayout={handleApplyAILayout}
            onClose={() => setShowAI(false)}
            onStatusChange={setStatusMsg}
          />
        )}
      </div>

      {/* Status Bar */}
      <div className="status-bar">
        <span className="status-ready">●</span>
        <span>{statusMsg}</span>
        <div className="status-right">
          <span>{project.floors[activeFloorIndex]?.entities.length ?? 0} entities</span>
          <span>·</span>
          <span>{project.floors.length} floor{project.floors.length !== 1 ? 's' : ''}</span>
          <span>·</span>
          <span>T {Number(project.timeline?.activeTime || 0).toFixed(1)} d</span>
          <span>·</span>
          <span className="badge blue">ADF {project.version}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Menu Dropdown component ──────────────────────────────────────────────────
function MenuDropdown({ label, items, onSelect }: {
  label: string;
  items: string[];
  onSelect: (item: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="menu-item" onMouseLeave={() => setOpen(false)}>
      <button className="menu-btn" onClick={() => setOpen(v => !v)}>
        {label}
      </button>
      {open && (
        <div className="menu-dropdown">
          {items.map((item, i) => item === '---'
            ? <div key={i} className="menu-divider" />
            : <button key={item} className="menu-option"
                onClick={() => { onSelect(item); setOpen(false); }}>
                {item}
              </button>
          )}
        </div>
      )}
    </div>
  );
}
