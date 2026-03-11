/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-nocheck
import React, { useState } from 'react';

import { invoke } from '@tauri-apps/api/core';
import { FileText, Download, Table, BarChart2, BookOpen, MapPin, AlertTriangle } from 'lucide-react';
import { ADFProject, WallEntity, AnyEntity } from '../lib/adf';
import './DocsTab.css';

interface Props {
  project: ADFProject;
  onProjectChange: (p: ADFProject) => void;
  onStatusChange: (s: string) => void;
}

type DocView = 'sheets' | 'schedules' | 'boq' | 'codes';

function calcArea(entities: AnyEntity[]): number {
  const walls = entities.filter(e => e.type === 'wall') as WallEntity[];
  if (walls.length === 0) return 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const w of walls) {
    minX = Math.min(minX, w.x1, w.x2); minY = Math.min(minY, w.y1, w.y2);
    maxX = Math.max(maxX, w.x1, w.x2); maxY = Math.max(maxY, w.y1, w.y2);
  }
  return ((maxX - minX) * (maxY - minY)) / 1_000_000; // sqm
}

function calcWallLength(entities: AnyEntity[]): number {
  return entities.filter(e => e.type === 'wall').reduce((sum, e) => {
    const w = e as WallEntity;
    return sum + Math.hypot(w.x2 - w.x1, w.y2 - w.y1) / 1000;
  }, 0);
}

export default function DocsTab({ project, onProjectChange, onStatusChange }: Props) {
  const [activeView, setActiveView] = useState<DocView>('sheets');
  const [buildingCodes, setBuildingCodes] = useState<Record<string, unknown> | null>(null);
  const [loadingCodes, setLoadingCodes] = useState(false);

  const allEntities = project.floors.flatMap(f => f.entities);
  const doors   = allEntities.filter(e => e.type === 'door');
  const windows = allEntities.filter(e => e.type === 'window');
  const walls   = allEntities.filter(e => e.type === 'wall') as WallEntity[];
  const totalArea   = project.floors.reduce((s, f) => s + calcArea(f.entities), 0);
  const totalWallLen = calcWallLength(allEntities);

  const fetchCodes = async () => {
    if (!project.location) { onStatusChange('Set project location first'); return; }
    setLoadingCodes(true);
    onStatusChange(`Fetching building codes for ${project.location}…`);
    try {
      const codes = await invoke<Record<string, unknown>>('get_building_codes', { location: project.location });
      setBuildingCodes(codes);
      onProjectChange({ ...project, buildingCodes: codes });
      onStatusChange('Building codes loaded');
    } catch (err) { onStatusChange(`Error: ${err}`); }
    setLoadingCodes(false);
  };

  const views: { id: DocView; label: string; icon: React.ReactNode }[] = [
    { id: 'sheets',    label: 'Sheets',         icon: <FileText size={13}/> },
    { id: 'schedules', label: 'Schedules',       icon: <Table size={13}/> },
    { id: 'boq',       label: 'Bill of Qtys.',   icon: <BarChart2 size={13}/> },
    { id: 'codes',     label: 'Building Codes',  icon: <BookOpen size={13}/> },
  ];

  return (
    <div className="docs-tab">
      {/* Sub-nav */}
      <div className="docs-subnav">
        {views.map(v => (
          <button key={v.id} className={`docs-nav-btn${activeView === v.id ? ' active' : ''}`}
            onClick={() => setActiveView(v.id)}>
            {v.icon} {v.label}
          </button>
        ))}
      </div>

      <div className="docs-content">
        {/* ─ Sheets ─ */}
        {activeView === 'sheets' && (
          <div className="docs-section">
            <div className="docs-section-header">
              <h2>Drawing Sheets</h2>
              <button className="btn primary" onClick={() => onStatusChange('Sheet creation coming soon!')}><FileText size={12}/> New Sheet</button>
            </div>
            {project.sheets.length === 0 ? (
              <div className="docs-empty">
                <FileText size={32} color="var(--text-muted)"/>
                <p>No sheets created yet.</p>
                <p style={{ fontSize: 12 }}>Sheets are printable layouts containing plan views, sections, elevations, and title blocks.</p>
                <button className="btn" onClick={() => onStatusChange('Sheet creation — coming in next phase!')}>+ Add Sheet</button>
              </div>
            ) : (
              <div className="sheets-grid">
                {project.sheets.map(s => <div key={s.id} className="sheet-card">{s.name}</div>)}
              </div>
            )}
            <div className="docs-info-cards">
              <div className="info-card">
                <div className="info-card-label">Total Floors</div>
                <div className="info-card-value">{project.floors.length}</div>
              </div>
              <div className="info-card">
                <div className="info-card-label">Total Built Area</div>
                <div className="info-card-value">{totalArea.toFixed(0)} m²</div>
              </div>
              <div className="info-card">
                <div className="info-card-label">Total Wall Length</div>
                <div className="info-card-value">{totalWallLen.toFixed(1)} m</div>
              </div>
              <div className="info-card">
                <div className="info-card-label">Building Type</div>
                <div className="info-card-value" style={{ textTransform: 'capitalize' }}>{project.buildingType || '—'}</div>
              </div>
            </div>
          </div>
        )}

        {/* ─ Schedules ─ */}
        {activeView === 'schedules' && (
          <div className="docs-section">
            <div className="docs-section-header"><h2>Auto-Generated Schedules</h2></div>

            <div className="schedule-card">
              <div className="schedule-title">Door Schedule</div>
              <table className="schedule-table">
                <thead>
                  <tr><th>#</th><th>ID</th><th>Width</th><th>Swing</th><th>Layer</th><th>Type</th></tr>
                </thead>
                <tbody>
                  {doors.length === 0
                    ? <tr><td colSpan={6} style={{ textAlign:'center', color:'var(--text-muted)' }}>No doors in plan</td></tr>
                    : doors.map((d, i) => (
                      <tr key={d.id}>
                        <td>{i + 1}</td>
                        <td style={{ fontFamily:'var(--font-mono)', fontSize:10 }}>{d.id}</td>
                        <td>{(d as Record<string, number>).width ?? 900} mm</td>
                        <td>{(d as Record<string, number>).swing ?? 90}°</td>
                        <td>{d.layer}</td>
                        <td>Hinged</td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
              <div className="schedule-total">Total: {doors.length} door{doors.length !== 1 ? 's' : ''}</div>
            </div>

            <div className="schedule-card">
              <div className="schedule-title">Window Schedule</div>
              <table className="schedule-table">
                <thead>
                  <tr><th>#</th><th>ID</th><th>Width</th><th>Height</th><th>Sill</th><th>Layer</th></tr>
                </thead>
                <tbody>
                  {windows.length === 0
                    ? <tr><td colSpan={6} style={{ textAlign:'center', color:'var(--text-muted)' }}>No windows in plan</td></tr>
                    : windows.map((w, i) => (
                      <tr key={w.id}>
                        <td>{i + 1}</td>
                        <td style={{ fontFamily:'var(--font-mono)', fontSize:10 }}>{w.id}</td>
                        <td>{(w as Record<string, number>).width ?? 1200} mm</td>
                        <td>{(w as Record<string, number>).height ?? 1200} mm</td>
                        <td>{(w as Record<string, number>).sillHeight ?? 900} mm</td>
                        <td>{w.layer}</td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
              <div className="schedule-total">Total: {windows.length} window{windows.length !== 1 ? 's' : ''}</div>
            </div>

            <div className="schedule-card">
              <div className="schedule-title">Floor Summary</div>
              <table className="schedule-table">
                <thead>
                  <tr><th>Floor</th><th>Level</th><th>Height</th><th>Entities</th><th>Area (approx.)</th></tr>
                </thead>
                <tbody>
                  {project.floors.map(f => (
                    <tr key={f.id}>
                      <td>{f.name}</td>
                      <td>{f.level}</td>
                      <td>{(f.floorHeight / 1000).toFixed(2)} m</td>
                      <td>{f.entities.length}</td>
                      <td>{calcArea(f.entities).toFixed(0)} m²</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ─ BOQ ─ */}
        {activeView === 'boq' && (
          <div className="docs-section">
            <div className="docs-section-header">
              <h2>Bill of Quantities</h2>
              <button className="btn" onClick={() => onStatusChange('PDF export coming soon!')}><Download size={12}/> Export PDF</button>
            </div>
            <table className="schedule-table" style={{ width: '100%' }}>
              <thead>
                <tr><th>Item</th><th>Description</th><th>Qty</th><th>Unit</th><th>Notes</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>1.0</td><td>External Walls (Brick/Block)</td>
                  <td style={{ fontWeight: 600, color: 'var(--accent)' }}>{totalWallLen.toFixed(1)}</td>
                  <td>m (run)</td>
                  <td>Measured from plan centreline</td>
                </tr>
                <tr>
                  <td>2.0</td><td>Floor Slab / Flooring</td>
                  <td style={{ fontWeight: 600, color: 'var(--accent)' }}>{totalArea.toFixed(0)}</td>
                  <td>m²</td>
                  <td>Approximate bounding box</td>
                </tr>
                <tr>
                  <td>3.0</td><td>Doors (Supply & Fix)</td>
                  <td style={{ fontWeight: 600, color: 'var(--accent)' }}>{doors.length}</td>
                  <td>No.</td>
                  <td>As per door schedule</td>
                </tr>
                <tr>
                  <td>4.0</td><td>Windows (Supply & Fix)</td>
                  <td style={{ fontWeight: 600, color: 'var(--accent)' }}>{windows.length}</td>
                  <td>No.</td>
                  <td>As per window schedule</td>
                </tr>
                <tr>
                  <td>5.0</td><td>Roof / Slab (Upper)</td>
                  <td style={{ fontWeight: 600, color: 'var(--accent)' }}>{totalArea.toFixed(0)}</td>
                  <td>m²</td>
                  <td>Flat slab, all floors</td>
                </tr>
                <tr>
                  <td>6.0</td><td>Internal Partitions</td>
                  <td style={{ fontWeight: 600, color: 'var(--accent)' }}>—</td>
                  <td>m (run)</td>
                  <td>Requires room layout annotation</td>
                </tr>
                <tr style={{ fontWeight: 700, background: 'var(--bg-hover)' }}>
                  <td colSpan={2}>TOTAL FLOORS</td>
                  <td>{project.floors.length}</td>
                  <td colSpan={2}>Total approx. area: {(totalArea * project.floors.length).toFixed(0)} m²</td>
                </tr>
              </tbody>
            </table>
            <div style={{ marginTop: 12, padding: 8, background: 'var(--amber-dim)', border: '1px solid var(--amber)', borderRadius: 6, fontSize: 11, color: 'var(--amber)' }}>
              <AlertTriangle size={12} style={{ display:'inline', marginRight: 4 }}/>
              This BOQ is automatically generated from your 2D plans. Always verify with a qualified QS before tendering.
            </div>
          </div>
        )}

        {/* ─ Building Codes ─ */}
        {activeView === 'codes' && (
          <div className="docs-section">
            <div className="docs-section-header">
              <h2>Building Codes & Bylaws</h2>
              <button className="btn primary" onClick={fetchCodes} disabled={loadingCodes}>
                <MapPin size={12}/> {loadingCodes ? 'Fetching…' : 'Fetch Codes'}
              </button>
            </div>

            <div className="codes-location">
              <div className="label">Project Location</div>
              <input type="text" placeholder="e.g. Goa, India / Mumbai / Delhi"
                defaultValue={project.location}
                onChange={e => onProjectChange({ ...project, location: e.target.value })}
              />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                Supported: Goa, Mumbai, Delhi (all other locations use NBC 2016 general guidelines)
              </div>
            </div>

            {buildingCodes && (
              <div className="codes-result slide-in">
                <div className="codes-authority">
                  <MapPin size={12}/>
                  <strong>{buildingCodes.location as string}</strong>
                  <span style={{ color: 'var(--text-muted)' }}> — {buildingCodes.authority as string}</span>
                </div>
                <div className="codes-grid">
                  {Object.entries((buildingCodes.codes as Record<string, unknown>) || {}).map(([key, val]) => {
                    if (key === 'special_notes') return null;
                    return (
                      <div key={key} className="code-item">
                        <div className="code-key">{key.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</div>
                        <div className="code-val">
                          {typeof val === 'object' ? Object.entries(val as Record<string,string>).map(([k,v]) => (
                            <div key={k}><span style={{ color:'var(--text-muted)' }}>{k}: </span>{v}</div>
                          )) : String(val)}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {((buildingCodes.codes as Record<string,string[]>)?.special_notes)?.length > 0 && (
                  <div className="codes-notes">
                    <div className="label">Special Notes / Restrictions</div>
                    {((buildingCodes.codes as Record<string,string[]>).special_notes).map((n: string) => (
                      <div key={n} className="code-note"><AlertTriangle size={10}/>{n}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {!buildingCodes && (
              <div className="docs-empty">
                <BookOpen size={32} color="var(--text-muted)"/>
                <p>Enter your project location and click "Fetch Codes" to retrieve local building regulations, FAR limits, setback requirements, and special zone restrictions.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
