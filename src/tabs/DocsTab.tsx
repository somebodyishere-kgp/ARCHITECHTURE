/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-nocheck
import React, { useState, useRef, useEffect, useCallback } from 'react';

import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { FileText, Download, Table, BarChart2, BookOpen, MapPin, AlertTriangle, Plus, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import { ADFProject, WallEntity, AnyEntity, Sheet, Viewport, TitleBlock, PAPER_SIZES, uid } from '../lib/adf';
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
  const [selectedSheetId, setSelectedSheetId] = useState<string | null>(null);
  const [sheetZoom, setSheetZoom] = useState(0.5);
  const [scheduleQuery, setScheduleQuery] = useState('');
  const [scheduleTypeFilter, setScheduleTypeFilter] = useState<'all' | 'door' | 'window'>('all');
  const sheetCanvasRef = useRef<HTMLCanvasElement>(null);

  const allEntities = project.floors.flatMap(f => f.entities);
  const doors   = allEntities.filter(e => e.type === 'door');
  const windows = allEntities.filter(e => e.type === 'window');
  const walls   = allEntities.filter(e => e.type === 'wall') as WallEntity[];
  const totalArea   = project.floors.reduce((s, f) => s + calcArea(f.entities), 0);
  const totalWallLen = calcWallLength(allEntities);

  const selectedSheet = project.sheets.find(s => s.id === selectedSheetId) || null;

  const filteredDoors = doors.filter(d => {
    if (scheduleTypeFilter !== 'all' && scheduleTypeFilter !== 'door') return false;
    const q = scheduleQuery.trim().toLowerCase();
    if (!q) return true;
    return d.id.toLowerCase().includes(q) || d.layer.toLowerCase().includes(q);
  });

  const filteredWindows = windows.filter(w => {
    if (scheduleTypeFilter !== 'all' && scheduleTypeFilter !== 'window') return false;
    const q = scheduleQuery.trim().toLowerCase();
    if (!q) return true;
    return w.id.toLowerCase().includes(q) || w.layer.toLowerCase().includes(q);
  });

  // ─── Sheet creation ────────────────────────────────────────────
  const createSheet = (paperSize: string) => {
    const ps = PAPER_SIZES[paperSize] || PAPER_SIZES['A3'];
    const sheet: Sheet = {
      id: uid(),
      name: `Sheet ${project.sheets.length + 1} - ${paperSize}`,
      titleBlock: {
        template: paperSize,
        width: ps.width,
        height: ps.height,
        projectName: project.projectName,
        drawnBy: '',
        checkedBy: '',
        date: new Date().toISOString().split('T')[0],
        revision: 'A',
        sheetNumber: `S${String(project.sheets.length + 1).padStart(2, '0')}`,
        sheetTitle: 'Plan View',
        scale: '1:100',
      },
      viewports: [],
      annotations: [],
    };
    onProjectChange({ ...project, sheets: [...project.sheets, sheet] });
    setSelectedSheetId(sheet.id);
    onStatusChange(`Created ${paperSize} sheet`);
  };

  const deleteSheet = (id: string) => {
    onProjectChange({ ...project, sheets: project.sheets.filter(s => s.id !== id) });
    if (selectedSheetId === id) setSelectedSheetId(null);
  };

  const duplicateSheet = (id: string) => {
    const source = project.sheets.find(s => s.id === id);
    if (!source) return;
    const nextIndex = project.sheets.length + 1;
    const duplicate: Sheet = {
      ...JSON.parse(JSON.stringify(source)),
      id: uid(),
      name: `${source.name} Copy`,
      titleBlock: {
        ...source.titleBlock,
        sheetNumber: `S${String(nextIndex).padStart(2, '0')}`,
        date: new Date().toISOString().split('T')[0],
      },
    };
    onProjectChange({ ...project, sheets: [...project.sheets, duplicate] });
    setSelectedSheetId(duplicate.id);
    onStatusChange(`Duplicated sheet: ${source.name}`);
  };

  const updateSelectedSheetTitleBlock = (updates: Partial<TitleBlock>) => {
    if (!selectedSheet) return;
    const updatedSheets = project.sheets.map(s => s.id === selectedSheet.id
      ? { ...s, titleBlock: { ...s.titleBlock, ...updates } }
      : s
    );
    onProjectChange({ ...project, sheets: updatedSheets });
  };

  const downloadCsv = (filename: string, headers: string[], rows: (string | number)[][]) => {
    const esc = (v: string | number) => {
      const text = String(v ?? '');
      if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
      return text;
    };
    const content = [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\n');
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const addViewportToSheet = (sheetId: string, floorIdx: number) => {
    const sh = project.sheets.find(s => s.id === sheetId);
    if (!sh) return;
    const vp: Viewport = {
      id: uid(), x: 20, y: 20, width: sh.titleBlock.width - 60, height: sh.titleBlock.height - 60,
      centerX: 0, centerY: 0, scale: 0.01, locked: false,
    };
    const updated = project.sheets.map(s => s.id === sheetId ? { ...s, viewports: [...s.viewports, vp] } : s);
    onProjectChange({ ...project, sheets: updated });
    onStatusChange('Viewport added');
  };

  // ─── Sheet canvas rendering ────────────────────────────────────
  const renderSheet = useCallback(() => {
    const cvs = sheetCanvasRef.current;
    if (!cvs || !selectedSheet) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;
    const tb = selectedSheet.titleBlock;
    const w = tb.width * sheetZoom, h = tb.height * sheetZoom;
    cvs.width = w + 40;
    cvs.height = h + 40;
    ctx.fillStyle = '#2a2a2e';
    ctx.fillRect(0, 0, cvs.width, cvs.height);
    // Paper
    ctx.fillStyle = '#fff';
    ctx.fillRect(20, 20, w, h);
    // Border
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 20, w, h);
    // Inner border (5mm margin)
    const m = 5 * sheetZoom;
    ctx.lineWidth = 0.5;
    ctx.strokeRect(20 + m, 20 + m, w - 2 * m, h - 2 * m);
    // Title block (bottom-right, 180x40mm)
    const tbW = 180 * sheetZoom, tbH = 40 * sheetZoom;
    const tbX = 20 + w - m - tbW, tbY = 20 + h - m - tbH;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(tbX, tbY, tbW, tbH);
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(tbX, tbY, tbW, tbH);
    // Title block text
    ctx.fillStyle = '#000';
    ctx.font = `bold ${10 * sheetZoom}px sans-serif`;
    ctx.fillText(tb.projectName, tbX + 4 * sheetZoom, tbY + 12 * sheetZoom);
    ctx.font = `${7 * sheetZoom}px sans-serif`;
    ctx.fillText(`Sheet: ${tb.sheetNumber}`, tbX + 4 * sheetZoom, tbY + 22 * sheetZoom);
    ctx.fillText(`${tb.sheetTitle} | ${tb.scale}`, tbX + 4 * sheetZoom, tbY + 30 * sheetZoom);
    ctx.fillText(`Date: ${tb.date} | Rev: ${tb.revision}`, tbX + 4 * sheetZoom, tbY + 38 * sheetZoom);
    // Viewports — draw entity previews
    for (const vp of selectedSheet.viewports) {
      const vpX = 20 + vp.x * sheetZoom, vpY = 20 + vp.y * sheetZoom;
      const vpW = vp.width * sheetZoom, vpH = vp.height * sheetZoom;
      ctx.strokeStyle = '#0066cc';
      ctx.lineWidth = 0.5;
      ctx.setLineDash([4, 2]);
      ctx.strokeRect(vpX, vpY, vpW, vpH);
      ctx.setLineDash([]);
      // Draw entities in viewport
      ctx.save();
      ctx.beginPath();
      ctx.rect(vpX, vpY, vpW, vpH);
      ctx.clip();
      const entities = allEntities;
      if (entities.length > 0) {
        // Find entity bounds
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const e of entities) {
          if ('x1' in e && 'y1' in e && 'x2' in e && 'y2' in e) {
            const en = e as any;
            minX = Math.min(minX, en.x1, en.x2); minY = Math.min(minY, en.y1, en.y2);
            maxX = Math.max(maxX, en.x1, en.x2); maxY = Math.max(maxY, en.y1, en.y2);
          }
        }
        if (maxX > minX && maxY > minY) {
          const scX = vpW / (maxX - minX), scY = vpH / (maxY - minY);
          const sc = Math.min(scX, scY) * 0.9;
          const ox = vpX + vpW / 2 - (minX + maxX) / 2 * sc;
          const oy = vpY + vpH / 2 - (minY + maxY) / 2 * sc;
          ctx.strokeStyle = '#333';
          ctx.lineWidth = Math.max(0.5, 1 * sheetZoom);
          for (const e of entities) {
            if ('x1' in e && 'y1' in e && 'x2' in e && 'y2' in e) {
              const en = e as any;
              ctx.beginPath();
              ctx.moveTo(ox + en.x1 * sc, oy + en.y1 * sc);
              ctx.lineTo(ox + en.x2 * sc, oy + en.y2 * sc);
              if (e.type === 'wall') { ctx.lineWidth = Math.max(1, 2 * sheetZoom); ctx.strokeStyle = '#000'; }
              else { ctx.lineWidth = Math.max(0.5, 1 * sheetZoom); ctx.strokeStyle = '#555'; }
              ctx.stroke();
            }
          }
        }
      }
      ctx.restore();
      // Viewport label
      ctx.fillStyle = '#0066cc';
      ctx.font = `${8 * sheetZoom}px sans-serif`;
      ctx.fillText(`VP ${selectedSheet.viewports.indexOf(vp) + 1}`, vpX + 2, vpY + 10 * sheetZoom);
    }
  }, [selectedSheet, sheetZoom, allEntities]);

  useEffect(() => { renderSheet(); }, [renderSheet]);

  const handleExportSheetPDF = async () => {
    if (!selectedSheet) return;
    try {
      const filePath = await save({ filters: [{ name: 'PDF', extensions: ['pdf'] }], defaultPath: `${selectedSheet.name}.pdf` });
      if (!filePath) return;
      onStatusChange('Exporting sheet PDF…');
      await invoke('export_pdf', { floor: { entities: allEntities }, outPath: filePath, paperSize: selectedSheet.titleBlock.template, title: selectedSheet.titleBlock.sheetTitle });
      onStatusChange(`Sheet exported to ${filePath}`);
    } catch (err) {
      onStatusChange(`PDF export: ${err}`);
    }
  };

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
          <div className="docs-section" style={{ display: 'flex', gap: 12, height: '100%' }}>
            {/* Sheet list sidebar */}
            <div style={{ width: 220, flexShrink: 0, borderRight: '1px solid var(--border)', paddingRight: 12 }}>
              <div className="docs-section-header" style={{ marginBottom: 8 }}>
                <h2 style={{ fontSize: 13 }}>Sheets</h2>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                {['A4', 'A3', 'A2', 'A1', 'ARCH-D'].map(ps => (
                  <button key={ps} className="btn" style={{ fontSize: 10, padding: '2px 6px' }} onClick={() => createSheet(ps)}>
                    <Plus size={10}/> {ps}
                  </button>
                ))}
              </div>
              {project.sheets.map(s => (
                <div key={s.id}
                  className={`sheet-list-item${selectedSheetId === s.id ? ' active' : ''}`}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', cursor: 'pointer', borderRadius: 4, marginBottom: 2, background: selectedSheetId === s.id ? 'var(--bg-active)' : 'transparent' }}
                  onClick={() => setSelectedSheetId(s.id)}>
                  <span style={{ fontSize: 11 }}>{s.name}</span>
                  <button className="btn ghost icon-only" style={{ padding: 2 }} onClick={(e) => { e.stopPropagation(); deleteSheet(s.id); }}><Trash2 size={11}/></button>
                </div>
              ))}
              {project.sheets.length === 0 && (
                <div style={{ color: 'var(--text-muted)', fontSize: 11, padding: 8, textAlign: 'center' }}>
                  Click a paper size above to create your first sheet.
                </div>
              )}
            </div>
            {/* Sheet preview */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              {selectedSheet ? (
                <>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{selectedSheet.name}</span>
                    <button className="btn" style={{ fontSize: 10 }} onClick={() => addViewportToSheet(selectedSheet.id, 0)}>
                      <Plus size={10}/> Add Viewport
                    </button>
                    <button className="btn" style={{ fontSize: 10 }} onClick={() => duplicateSheet(selectedSheet.id)}>
                      <Plus size={10}/> Duplicate
                    </button>
                    <button className="btn" onClick={handleExportSheetPDF}><Download size={10}/> Export PDF</button>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
                      <button className="btn ghost icon-only" onClick={() => setSheetZoom(z => Math.max(0.2, z - 0.1))}><ZoomOut size={12}/></button>
                      <span style={{ fontSize: 10, minWidth: 40, textAlign: 'center' }}>{Math.round(sheetZoom * 100)}%</span>
                      <button className="btn ghost icon-only" onClick={() => setSheetZoom(z => Math.min(2, z + 0.1))}><ZoomIn size={12}/></button>
                    </div>
                  </div>
                  <div style={{ flex: 1, overflow: 'auto', background: '#2a2a2e', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <canvas ref={sheetCanvasRef} />
                  </div>
                  <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                    <input
                      value={selectedSheet.titleBlock.sheetTitle}
                      onChange={e => updateSelectedSheetTitleBlock({ sheetTitle: e.target.value })}
                      placeholder="Sheet title"
                    />
                    <input
                      value={selectedSheet.titleBlock.sheetNumber}
                      onChange={e => updateSelectedSheetTitleBlock({ sheetNumber: e.target.value })}
                      placeholder="Sheet number"
                    />
                    <input
                      value={selectedSheet.titleBlock.scale}
                      onChange={e => updateSelectedSheetTitleBlock({ scale: e.target.value })}
                      placeholder="Scale"
                    />
                    <input
                      value={selectedSheet.titleBlock.drawnBy}
                      onChange={e => updateSelectedSheetTitleBlock({ drawnBy: e.target.value })}
                      placeholder="Drawn by"
                    />
                    <input
                      value={selectedSheet.titleBlock.checkedBy}
                      onChange={e => updateSelectedSheetTitleBlock({ checkedBy: e.target.value })}
                      placeholder="Checked by"
                    />
                    <input
                      value={selectedSheet.titleBlock.revision}
                      onChange={e => updateSelectedSheetTitleBlock({ revision: e.target.value })}
                      placeholder="Revision"
                    />
                  </div>
                </>
              ) : (
                <div className="docs-empty">
                  <FileText size={32} color="var(--text-muted)"/>
                  <p>Select or create a sheet to preview.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─ Schedules ─ */}
        {activeView === 'schedules' && (
          <div className="docs-section">
            <div className="docs-section-header">
              <h2>Auto-Generated Schedules</h2>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={scheduleQuery}
                  onChange={e => setScheduleQuery(e.target.value)}
                  placeholder="Filter by ID/layer"
                />
                <select value={scheduleTypeFilter} onChange={e => setScheduleTypeFilter(e.target.value as 'all' | 'door' | 'window')}>
                  <option value="all">All</option>
                  <option value="door">Doors</option>
                  <option value="window">Windows</option>
                </select>
                <button
                  className="btn"
                  onClick={() => downloadCsv(
                    `${project.projectName}_schedules.csv`,
                    ['Type', 'ID', 'Width_mm', 'Height_mm', 'Sill_mm', 'Swing_deg', 'Layer'],
                    [
                      ...filteredDoors.map(d => ['Door', d.id, (d as any).width ?? 900, (d as any).height ?? 2100, '', (d as any).swing ?? 90, d.layer]),
                      ...filteredWindows.map(w => ['Window', w.id, (w as any).width ?? 1200, (w as any).height ?? 1200, (w as any).sillHeight ?? 900, '', w.layer]),
                    ]
                  )}
                >
                  <Download size={12}/> Export CSV
                </button>
              </div>
            </div>

            <div className="schedule-card">
              <div className="schedule-title">Door Schedule</div>
              <table className="schedule-table">
                <thead>
                  <tr><th>#</th><th>ID</th><th>Width</th><th>Swing</th><th>Layer</th><th>Type</th></tr>
                </thead>
                <tbody>
                  {filteredDoors.length === 0
                    ? <tr><td colSpan={6} style={{ textAlign:'center', color:'var(--text-muted)' }}>No doors in plan</td></tr>
                    : filteredDoors.map((d, i) => (
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
              <div className="schedule-total">Total: {filteredDoors.length} door{filteredDoors.length !== 1 ? 's' : ''}</div>
            </div>

            <div className="schedule-card">
              <div className="schedule-title">Window Schedule</div>
              <table className="schedule-table">
                <thead>
                  <tr><th>#</th><th>ID</th><th>Width</th><th>Height</th><th>Sill</th><th>Layer</th></tr>
                </thead>
                <tbody>
                  {filteredWindows.length === 0
                    ? <tr><td colSpan={6} style={{ textAlign:'center', color:'var(--text-muted)' }}>No windows in plan</td></tr>
                    : filteredWindows.map((w, i) => (
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
              <div className="schedule-total">Total: {filteredWindows.length} window{filteredWindows.length !== 1 ? 's' : ''}</div>
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
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" onClick={async () => {
                  try {
                    const filePath = await save({ filters: [{ name: 'PDF', extensions: ['pdf'] }], defaultPath: `${project.projectName}_BOQ.pdf` });
                    if (!filePath) return;
                    onStatusChange('Exporting BOQ PDF…');
                    await invoke('export_pdf', { floor: { entities: allEntities }, outPath: filePath, title: 'Bill of Quantities' });
                    onStatusChange(`BOQ exported to ${filePath}`);
                  } catch (err) { onStatusChange(`PDF export: ${err}`); }
                }}><Download size={12}/> Export PDF</button>
                <button className="btn" onClick={() => downloadCsv(
                  `${project.projectName}_boq.csv`,
                  ['Item', 'Description', 'Qty', 'Unit', 'Notes'],
                  [
                    ['1.0', 'External Walls (Brick/Block)', totalWallLen.toFixed(1), 'm (run)', 'Measured from plan centreline'],
                    ['2.0', 'Floor Slab / Flooring', totalArea.toFixed(0), 'm2', 'Approximate bounding box'],
                    ['3.0', 'Doors (Supply & Fix)', doors.length, 'No.', 'As per door schedule'],
                    ['4.0', 'Windows (Supply & Fix)', windows.length, 'No.', 'As per window schedule'],
                    ['5.0', 'Roof / Slab (Upper)', totalArea.toFixed(0), 'm2', 'Flat slab, all floors'],
                  ]
                )}><Download size={12}/> Export CSV</button>
              </div>
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
