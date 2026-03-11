import React, { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Layers, Box, FileText, Cpu, FolderOpen, Save, FilePlus, Settings, HelpCircle, ChevronDown } from 'lucide-react';
import { ADFProject, createProject } from './lib/adf';
import PlansTab from './tabs/PlansTab';
import ThreeDTab from './tabs/ThreeDTab';
import DocsTab from './tabs/DocsTab';
import AIChat from './components/AIChat';
import './App.css';

type TabId = 'plans' | '3d' | 'docs';

interface Tab { id: TabId; label: string; icon: React.ReactNode; shortcut: string; }

const TABS: Tab[] = [
  { id: 'plans', label: '2D Plans',      icon: <Layers size={14}/>,   shortcut: '1' },
  { id: '3d',    label: '3D / Render',   icon: <Box size={14}/>,      shortcut: '2' },
  { id: 'docs',  label: 'Documentation', icon: <FileText size={14}/>, shortcut: '3' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('plans');
  const [project, setProject] = useState<ADFProject>(createProject('Untitled Project'));
  const [showAI, setShowAI] = useState(false);
  const [activeFloorIndex, setActiveFloorIndex] = useState(0);
  const [statusMsg, setStatusMsg] = useState('Ready');
  const [isDragging, setIsDragging] = useState(false);

  const activeFloor = project.floors[activeFloorIndex];

  const updateProject = useCallback((updater: (p: ADFProject) => ADFProject) => {
    setProject(prev => ({ ...updater(prev), modifiedAt: new Date().toISOString() }));
  }, []);

  const handleNewProject = () => {
    if (confirm('Create a new project? Unsaved changes will be lost.')) {
      setProject(createProject('Untitled Project'));
      setActiveFloorIndex(0);
      setStatusMsg('New project created');
    }
  };

  const handleSave = async () => {
    try {
      setStatusMsg('Saving…');
      // In Tauri: use dialog to pick path
      const path = `${project.projectName.replace(/\s+/g, '_')}.adf.json`;
      await invoke('save_project', { path, data: project });
      setStatusMsg(`Saved to ${path}`);
    } catch (err) {
      setStatusMsg(`Error saving: ${err}`);
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
            { label: 'View', items: ['Plans (1)', '3D / Render (2)', 'Documentation (3)', '---', 'Toggle AI Panel', 'Zoom Fit'] },
            { label: 'Help', items: ['Documentation', 'About ArchFlow'] },
          ].map(menu => (
            <MenuDropdown key={menu.label} label={menu.label} items={menu.items}
              onSelect={(item) => {
                if (item === 'New Project') handleNewProject();
                if (item === 'Save') handleSave();
                if (item === 'Toggle AI Panel') setShowAI(v => !v);
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
                floorHeight: 3000, entities: []
              }]
            }));
          }}>+</button>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        {/* Tab Views */}
        <div className="tab-content">
          <div style={{ display: activeTab === 'plans' ? 'flex' : 'none', width: '100%', height: '100%' }}>
            <PlansTab
              floor={activeFloor}
              layers={project.layers}
              onFloorChange={(updated) => {
                updateProject(p => {
                  const floors = [...p.floors];
                  floors[activeFloorIndex] = updated;
                  return { ...p, floors };
                });
              }}
              onLayersChange={(layers) => updateProject(p => ({ ...p, layers }))}
              onStatusChange={setStatusMsg}
            />
          </div>
          <div style={{ display: activeTab === '3d' ? 'flex' : 'none', width: '100%', height: '100%' }}>
            <ThreeDTab floor={activeFloor} project={project} onStatusChange={setStatusMsg} />
          </div>
          <div style={{ display: activeTab === 'docs' ? 'flex' : 'none', width: '100%', height: '100%' }}>
            <DocsTab project={project} onProjectChange={setProject} onStatusChange={setStatusMsg} />
          </div>
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
