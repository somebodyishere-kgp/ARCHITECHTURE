import React, { useState, useCallback, useRef, useEffect, lazy, Suspense } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { save, open } from '@tauri-apps/plugin-dialog';
import { Layers, Box, FileText, Cpu, Save, FilePlus, Keyboard } from 'lucide-react';
import { ADFProject, ProjectPresetLibrary, createProject } from './lib/adf';
import { CURRENT_PROJECT_SCHEMA, migrateProjectData } from './lib/migrations';
import { propagateFloorDependencies } from './lib/systemGraph';
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
                floorHeight: 3000, entities: [], dependencyMetadata: { recentReports: [] }
              }]
            }));
          }}>+</button>
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
                onFloorChange={(updated) => {
                  const prevFloor = project.floors[activeFloorIndex];
                  const { floor: propagatedFloor, report, graph } = propagateFloorDependencies(prevFloor, updated);
                  if (report.adjustedCount > 0 || report.warnings.length > 0) {
                    const base = report.adjustedCount > 0
                      ? `Living graph propagated ${report.adjustedCount} dependent update${report.adjustedCount === 1 ? '' : 's'}`
                      : 'Living graph diagnostics updated';
                    const warn = report.warnings.length > 0 ? ` (${report.warnings.length} warning${report.warnings.length === 1 ? '' : 's'})` : '';
                    setStatusMsg(`${base}${warn}`);
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
                    floors[activeFloorIndex] = {
                      ...propagatedFloor,
                      dependencyMetadata: {
                        lastReport: recentReports[recentReports.length - 1],
                        recentReports,
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
                onEntityUpdate={(entities) => {
                  const prevFloor = project.floors[activeFloorIndex];
                  const nextFloor = { ...prevFloor, entities };
                  const { floor: propagatedFloor, report, graph } = propagateFloorDependencies(prevFloor, nextFloor);
                  if (report.adjustedCount > 0 || report.warnings.length > 0) {
                    const base = report.adjustedCount > 0
                      ? `Living graph propagated ${report.adjustedCount} dependent update${report.adjustedCount === 1 ? '' : 's'}`
                      : 'Living graph diagnostics updated';
                    const warn = report.warnings.length > 0 ? ` (${report.warnings.length} warning${report.warnings.length === 1 ? '' : 's'})` : '';
                    setStatusMsg(`${base}${warn}`);
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
                    floors[activeFloorIndex] = {
                      ...propagatedFloor,
                      dependencyMetadata: {
                        lastReport: recentReports[recentReports.length - 1],
                        recentReports,
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
