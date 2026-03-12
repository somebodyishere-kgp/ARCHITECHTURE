import React, { useState, useCallback, useRef, useEffect, lazy, Suspense } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { save, open } from '@tauri-apps/plugin-dialog';
import { Layers, Box, FileText, Cpu, Save, FilePlus, Keyboard } from 'lucide-react';
import { ADFProject, ProjectPresetLibrary, TimelineTrack, createProject, uid } from './lib/adf';
import { CURRENT_PROJECT_SCHEMA, migrateProjectData } from './lib/migrations';
import { propagateFloorDependencies } from './lib/systemGraph';
import { captureBranchSnapshot, compareBranches, createBranchFromActive, ensureGraph, switchToBranch } from './lib/branchGraph';
import { evaluateConstraintRuleGraph } from './lib/constraintRules';
import AIChat from './components/AIChat';
import './App.css';

const PlansTab = lazy(() => import('./tabs/PlansTab'));
const ThreeDTab = lazy(() => import('./tabs/ThreeDTab'));
const DocsTab = lazy(() => import('./tabs/DocsTab'));
const KeybindingsTab = lazy(() => import('./tabs/KeybindingsTab'));

type TabId = 'plans' | '3d' | 'docs' | 'keys';

interface Tab { id: TabId; label: string; icon: React.ReactNode; shortcut: string; }

const AUTOSAVE_KEY = 'archflow.autosave.project.v1';
const UI_STATE_KEY = 'archflow.ui-state.v1';

const TABS: Tab[] = [
  { id: 'plans', label: '2D Plans',      icon: <Layers size={14}/>,   shortcut: '1' },
  { id: '3d',    label: '3D / Render',   icon: <Box size={14}/>,      shortcut: '2' },
  { id: 'docs',  label: 'Documentation', icon: <FileText size={14}/>, shortcut: '3' },
  { id: 'keys',  label: 'Keybindings',   icon: <Keyboard size={14}/>, shortcut: '4' },
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
    updateProject(prev => {
      const result = createBranchFromActive(prev, branchName);
      return result.project;
    });
    setStatusMsg(`Created branch: ${branchName}`);
  }, [project.branchGraph?.nodes.length, updateProject]);

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
      };
    });
    setActiveTab('plans');
    setStatusMsg('AI floor plan applied — review and approve in Plans tab');
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
            { label: 'View', items: ['Plans (1)', '3D / Render (2)', 'Documentation (3)', 'Keybindings (4)', '---', 'Toggle AI Panel', 'Zoom Fit'] },
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
                  const { floor: propagatedFloor, report, graph } = propagateFloorDependencies(prevFloor, updated);
                  const constraintReport = evaluateConstraintRuleGraph(propagatedFloor, project.constraintRules);
                  if (report.adjustedCount > 0 || report.warnings.length > 0 || constraintReport.warningCount > 0) {
                    const base = report.adjustedCount > 0
                      ? `Living graph propagated ${report.adjustedCount} dependent update${report.adjustedCount === 1 ? '' : 's'}`
                      : 'Living graph diagnostics updated';
                    const warn = report.warnings.length > 0 ? ` (${report.warnings.length} warning${report.warnings.length === 1 ? '' : 's'})` : '';
                    const constraintWarn = constraintReport.warningCount > 0
                      ? ` + ${constraintReport.warningCount} constraint warning${constraintReport.warningCount === 1 ? '' : 's'}`
                      : '';
                    setStatusMsg(`${base}${warn}${constraintWarn}`);
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
                      ...propagatedFloor,
                      dependencyMetadata: {
                        lastReport: recentReports[recentReports.length - 1],
                        recentReports,
                        lastConstraintReport: recentConstraintReports[recentConstraintReports.length - 1],
                        recentConstraintReports,
                      },
                    };
                    return { ...p, floors };
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
                  const { floor: propagatedFloor, report, graph } = propagateFloorDependencies(prevFloor, nextFloor);
                  const constraintReport = evaluateConstraintRuleGraph(propagatedFloor, project.constraintRules);
                  if (report.adjustedCount > 0 || report.warnings.length > 0 || constraintReport.warningCount > 0) {
                    const base = report.adjustedCount > 0
                      ? `Living graph propagated ${report.adjustedCount} dependent update${report.adjustedCount === 1 ? '' : 's'}`
                      : 'Living graph diagnostics updated';
                    const warn = report.warnings.length > 0 ? ` (${report.warnings.length} warning${report.warnings.length === 1 ? '' : 's'})` : '';
                    const constraintWarn = constraintReport.warningCount > 0
                      ? ` + ${constraintReport.warningCount} constraint warning${constraintReport.warningCount === 1 ? '' : 's'}`
                      : '';
                    setStatusMsg(`${base}${warn}${constraintWarn}`);
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
                      ...propagatedFloor,
                      dependencyMetadata: {
                        lastReport: recentReports[recentReports.length - 1],
                        recentReports,
                        lastConstraintReport: recentConstraintReports[recentConstraintReports.length - 1],
                        recentConstraintReports,
                      },
                    };
                    return { ...p, floors };
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
          </Suspense>
        </div>

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
