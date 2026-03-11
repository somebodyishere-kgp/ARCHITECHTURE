import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  MousePointer2, Pencil, Square, Circle, Minus, RotateCw,
  Move, Copy, Scissors, Ruler, Type,
  ZoomIn, ZoomOut, Maximize2, Layers as LayersIcon, Download
} from 'lucide-react';
import { FloorPlan, Layer, AnyEntity, WallEntity, uid } from '../lib/adf';
import { invoke } from '@tauri-apps/api/core';
import LayerManager from '../components/LayerManager';
import './PlansTab.css';

type Tool =
  'select' | 'pan' |
  'wall' | 'line' | 'arc' | 'circle' | 'polyline' | 'rectangle' | 'spline' | 'ellipse' | 'hatch' |
  'door' | 'window' | 'stair' | 'column' | 'slab' | 'roof' |
  'dimension' | 'dim_align' | 'dim_rad' | 'text' | 'leader' |
  'move' | 'copy' | 'rotate' | 'offset' | 'trim' | 'extend' | 'mirror' | 'scale' | 'fillet' | 'array' | 'explode';

interface ToolGroup { label: string; tools: ToolDef[]; }
interface ToolDef  { id: Tool; icon: React.ReactNode; label: string; shortcut?: string; }

const TOOL_GROUPS: ToolGroup[] = [
  { label: 'Select', tools: [
    { id: 'select', icon: <MousePointer2 size={15}/>, label: 'Select', shortcut: 'S' },
    { id: 'pan',    icon: <Move size={15}/>,          label: 'Pan',    shortcut: 'H' },
  ]},
  { label: 'Draw', tools: [
    { id: 'line',      icon: <Minus size={15}/>,   label: 'Line',      shortcut: 'L' },
    { id: 'polyline',  icon: <Pencil size={15}/>,  label: 'Polyline',  shortcut: 'PL' },
    { id: 'rectangle', icon: <Square size={15}/>,  label: 'Rectangle', shortcut: 'REC' },
    { id: 'circle',    icon: <Circle size={15}/>,  label: 'Circle',    shortcut: 'C' },
    { id: 'arc',       icon: <RotateCw size={15}/>,label: 'Arc',       shortcut: 'A' },
    { id: 'spline',    icon: <Pencil size={15}/>,  label: 'Spline',    shortcut: 'SPL' },
    { id: 'ellipse',   icon: <Circle size={15} style={{transform:'scaleY(0.7)'}}/>, label: 'Ellipse', shortcut: 'EL' },
    { id: 'hatch',     icon: <LayersIcon size={15}/>, label: 'Hatch', shortcut: 'H' },
  ]},
  { label: 'Modify', tools: [
    { id: 'move',    icon: <Move size={15}/>,      label: 'Move',     shortcut: 'M' },
    { id: 'copy',    icon: <Copy size={15}/>,      label: 'Copy',     shortcut: 'CO' },
    { id: 'rotate',  icon: <RotateCw size={15}/>,  label: 'Rotate',   shortcut: 'RO' },
    { id: 'mirror',  icon: <span style={{fontSize:10,fontWeight:700}}>MI</span>, label: 'Mirror', shortcut: 'MI' },
    { id: 'scale',   icon: <Maximize2 size={15}/>, label: 'Scale',    shortcut: 'SC' },
    { id: 'trim',    icon: <Scissors size={15}/>,  label: 'Trim',     shortcut: 'TR' },
    { id: 'extend',  icon: <span style={{fontSize:10,fontWeight:700}}>EX</span>, label: 'Extend', shortcut: 'EX' },
    { id: 'offset',  icon: <span style={{fontSize:10,fontWeight:700}}>O</span>,  label: 'Offset', shortcut: 'O' },
    { id: 'fillet',  icon: <span style={{fontSize:10,fontWeight:700}}>F</span>,  label: 'Fillet', shortcut: 'F' },
    { id: 'array',   icon: <span style={{fontSize:10,fontWeight:700}}>AR</span>, label: 'Array',  shortcut: 'AR' },
    { id: 'explode', icon: <span style={{fontSize:10,fontWeight:700}}>X</span>,  label: 'Explode',shortcut: 'X' },
  ]},
  { label: 'Arch.', tools: [
    { id: 'wall',   icon: <Square size={15}/>, label: 'Wall',   shortcut: 'W' },
    { id: 'door',   icon: <span style={{fontSize:12,fontWeight:700}}>D</span>, label: 'Door',   shortcut: 'O' },
    { id: 'window', icon: <span style={{fontSize:12,fontWeight:700}}>W</span>, label: 'Window', shortcut: 'I' },
    { id: 'stair',  icon: <span style={{fontSize:10,fontWeight:700}}>ST</span>, label: 'Stair' },
    { id: 'column', icon: <span style={{fontSize:10,fontWeight:700}}>CO</span>, label: 'Column' },
    { id: 'slab',   icon: <Square size={15} style={{transform:'scaleY(0.2)'}}/>, label: 'Slab/Floor' },
    { id: 'roof',   icon: <span style={{fontSize:10,fontWeight:700}}>RF</span>, label: 'Roof' },
  ]},
  { label: 'Annot.', tools: [
    { id: 'dimension', icon: <Ruler size={15}/>, label: 'Linear Dim', shortcut: 'DLI' },
    { id: 'dim_align', icon: <Ruler size={15} style={{transform:'rotate(-15deg)'}}/>, label: 'Aligned', shortcut: 'DAL' },
    { id: 'dim_rad',   icon: <Circle size={15}/>, label: 'Radius', shortcut: 'DRA' },
    { id: 'text',      icon: <Type size={15}/>,  label: 'Text',      shortcut: 'T' },
    { id: 'leader',    icon: <span style={{fontSize:10,fontWeight:700}}>LE</span>, label: 'Leader', shortcut: 'LE' },
  ]},
];

interface Transform { x: number; y: number; scale: number; }
interface DrawingPoint { x: number; y: number; }

interface Props {
  floor: FloorPlan;
  layers: Layer[];
  onFloorChange: (f: FloorPlan) => void;
  onLayersChange: (l: Layer[]) => void;
  onStatusChange: (s: string) => void;
}

// Canvas coordinate helpers
const GRID_SIZE_MM = 100; // 100mm grid
const MM_PER_PX_DEFAULT = 5; // at scale=1, 1px = 5mm → 200px = 1m

export default function PlansTab({ floor, layers, onFloorChange, onLayersChange, onStatusChange }: Props) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const [activeTool, setActiveTool]     = useState<Tool>('select');
  const [activeLayer, setActiveLayer]   = useState('Walls');
  const [transform, setTransform]       = useState<Transform>({ x: 0, y: 0, scale: 1 });
  const [cursor, setCursor]             = useState<DrawingPoint | null>(null);
  const [drawStart, setDrawStart]       = useState<DrawingPoint | null>(null);
  const [isPanning, setIsPanning]       = useState(false);
  const [panStart, setPanStart]         = useState<{ mx: number; my: number; tx: number; ty: number } | null>(null);
  const [showLayers, setShowLayers]     = useState(true);
  const [snapGuide, setSnapGuide]       = useState<DrawingPoint | null>(null);
  const [wallThickness, setWallThickness] = useState(200);
  const [wallHeight, setWallHeight]     = useState(3000);
  const [selectedIds, setSelectedIds]   = useState<string[]>([]);
  const [zoom, setZoom]                 = useState(100); // percentage
  
  // AutoCAD style command line state
  const [commandText, setCommandText]   = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>(['ArchFlow Command Line initialized. Type a command (e.g. line, l, wall, trim)']);

  // Convert screen → world coordinates (mm)
  const screenToWorld = useCallback((sx: number, sy: number, t: Transform): DrawingPoint => {
    return {
      x: (sx - t.x) / t.scale * MM_PER_PX_DEFAULT,
      y: (sy - t.y) / t.scale * MM_PER_PX_DEFAULT,
    };
  }, []);

  // Snap to grid
  const snapToGrid = useCallback((pt: DrawingPoint): DrawingPoint => ({
    x: Math.round(pt.x / GRID_SIZE_MM) * GRID_SIZE_MM,
    y: Math.round(pt.y / GRID_SIZE_MM) * GRID_SIZE_MM,
  }), []);

  // Snap to endpoints of existing entities
  const snapToEndpoints = useCallback((pt: DrawingPoint, threshold = 200): DrawingPoint | null => {
    for (const e of floor.entities) {
      if ('x1' in e) {
        const pts = [{ x: (e as WallEntity).x1, y: (e as WallEntity).y1 }, { x: (e as WallEntity).x2, y: (e as WallEntity).y2 }];
        for (const ep of pts) {
          const dist = Math.hypot(pt.x - ep.x, pt.y - ep.y);
          if (dist < threshold) return ep;
        }
      }
    }
    return null;
  }, [floor.entities]);

  // Draw the canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width, H = canvas.height;
    const t = transform;
    const pxPerMm = t.scale / MM_PER_PX_DEFAULT;

    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(t.x, t.y);

    // ── Grid ──────────────────────────────────────────────────────────────
    const gridLayer = layers.find(l => l.name === 'Grid');
    if (!gridLayer || gridLayer.visible) {
      const gridPx = GRID_SIZE_MM * pxPerMm;
      const startX = -Math.ceil(t.x / gridPx) * gridPx;
      const startY = -Math.ceil(t.y / gridPx) * gridPx;

      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 0.5;
      for (let x = startX; x < W; x += gridPx) {
        ctx.beginPath(); ctx.moveTo(x, -t.y); ctx.lineTo(x, H - t.y); ctx.stroke();
      }
      for (let y = startY; y < H; y += gridPx) {
        ctx.beginPath(); ctx.moveTo(-t.x, y); ctx.lineTo(W - t.x, y); ctx.stroke();
      }

      // Major grid (every 1000mm)
      const majorGridPx = 1000 * pxPerMm;
      if (majorGridPx > 10) {
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        const mStartX = -Math.ceil(t.x / majorGridPx) * majorGridPx;
        const mStartY = -Math.ceil(t.y / majorGridPx) * majorGridPx;
        for (let x = mStartX; x < W; x += majorGridPx) {
          ctx.beginPath(); ctx.moveTo(x, -t.y); ctx.lineTo(x, H - t.y); ctx.stroke();
        }
        for (let y = mStartY; y < H; y += majorGridPx) {
          ctx.beginPath(); ctx.moveTo(-t.x, y); ctx.lineTo(W - t.x, y); ctx.stroke();
        }
      }
    }

    // ── Origin crosshair ─────────────────────────────────────────────────
    ctx.strokeStyle = 'rgba(255,0,0,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, 8); ctx.stroke();

    // ── Entities ─────────────────────────────────────────────────────────
    for (const entity of floor.entities) {
      const layer = layers.find(l => l.name === entity.layer);
      if (layer && !layer.visible) continue;

      const color = entity.color || layer?.color || '#e6edf3';
      const lw = Math.max(0.5, (layer?.lineweight || 0.25) * 2 * t.scale);
      ctx.strokeStyle = selectedIds.includes(entity.id) ? '#58a6ff' : color;
      ctx.lineWidth = selectedIds.includes(entity.id) ? lw * 1.8 : lw;

      switch (entity.type) {
        case 'wall': {
          const w = entity as WallEntity;
          const x1px = w.x1 * pxPerMm, y1px = w.y1 * pxPerMm;
          const x2px = w.x2 * pxPerMm, y2px = w.y2 * pxPerMm;
          const len = Math.hypot(x2px - x1px, y2px - y1px);
          if (len < 0.5) break;
          const nx = (y2px - y1px) / len, ny = -(x2px - x1px) / len;
          const halfT = (w.thickness * pxPerMm) / 2;

          ctx.fillStyle = 'rgba(120,110,100,0.15)';
          ctx.beginPath();
          ctx.moveTo(x1px + nx * halfT, y1px + ny * halfT);
          ctx.lineTo(x2px + nx * halfT, y2px + ny * halfT);
          ctx.lineTo(x2px - nx * halfT, y2px - ny * halfT);
          ctx.lineTo(x1px - nx * halfT, y1px - ny * halfT);
          ctx.closePath();
          ctx.fill();

          // Draw both wall faces
          ctx.lineWidth = selectedIds.includes(entity.id) ? 2 : Math.max(0.7, t.scale * 0.7);
          [[halfT, -halfT]].forEach(([f1, f2]) => {
            ctx.beginPath();
            ctx.moveTo(x1px + nx * f1, y1px + ny * f1);
            ctx.lineTo(x2px + nx * f1, y2px + ny * f1);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x1px + nx * f2, y1px + ny * f2);
            ctx.lineTo(x2px + nx * f2, y2px + ny * f2);
            ctx.stroke();
          });
          break;
        }
        case 'line': {
          const l = entity as { x1:number; y1:number; x2:number; y2:number };
          ctx.beginPath();
          ctx.moveTo(l.x1 * pxPerMm, l.y1 * pxPerMm);
          ctx.lineTo(l.x2 * pxPerMm, l.y2 * pxPerMm);
          ctx.stroke();
          break;
        }
        case 'door': {
          const d = entity as { x:number; y:number; width:number; swing:number };
          const dx = d.x * pxPerMm, dy = d.y * pxPerMm;
          const dw = d.width * pxPerMm;
          ctx.strokeStyle = color;
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(dx, dy); ctx.lineTo(dx + dw, dy); ctx.stroke();
          ctx.beginPath();
          ctx.arc(dx, dy, dw, 0, (d.swing * Math.PI) / 180);
          ctx.stroke();
          break;
        }
        case 'window': {
          const win = entity as { x:number; y:number; width:number };
          const wx = win.x * pxPerMm, wy = win.y * pxPerMm;
          const ww = win.width * pxPerMm;
          ctx.strokeStyle = color;
          ctx.lineWidth = 1;
          // Window symbol: double line
          ctx.beginPath(); ctx.moveTo(wx, wy - 4); ctx.lineTo(wx + ww, wy - 4); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(wx, wy);     ctx.lineTo(wx + ww, wy);     ctx.stroke();
          ctx.beginPath(); ctx.moveTo(wx, wy + 4); ctx.lineTo(wx + ww, wy + 4); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(wx, wy - 4); ctx.lineTo(wx, wy + 4); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(wx + ww, wy - 4); ctx.lineTo(wx + ww, wy + 4); ctx.stroke();
          break;
        }
        case 'text': {
          const te = entity as { x:number; y:number; text:string; fontSize:number };
          ctx.fillStyle = color;
          ctx.font = `${te.fontSize * pxPerMm}px Inter, sans-serif`;
          ctx.fillText(te.text, te.x * pxPerMm, te.y * pxPerMm);
          break;
        }
        case 'circle': {
          const ci = entity as { cx:number; cy:number; radius:number };
          ctx.beginPath();
          ctx.arc(ci.cx * pxPerMm, ci.cy * pxPerMm, ci.radius * pxPerMm, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
      }
    }

    // ── Preview of current drawing action ────────────────────────────────
    if (drawStart && cursor) {
      ctx.strokeStyle = 'rgba(88,166,255,0.8)';
      ctx.lineWidth   = 1.5;
      ctx.setLineDash([5, 3]);

      const x1 = drawStart.x * pxPerMm, y1 = drawStart.y * pxPerMm;
      const x2 = cursor.x  * pxPerMm, y2 = cursor.y  * pxPerMm;

      if (activeTool === 'wall') {
        const len = Math.hypot(x2 - x1, y2 - y1);
        if (len > 0) {
          const nx = (y2 - y1) / len, ny = -(x2 - x1) / len;
          const halfT = (wallThickness * pxPerMm) / 2;
          ctx.strokeStyle = '#58a6ff';
          ctx.beginPath();
          ctx.moveTo(x1 + nx * halfT, y1 + ny * halfT);
          ctx.lineTo(x2 + nx * halfT, y2 + ny * halfT);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x1 - nx * halfT, y1 - ny * halfT);
          ctx.lineTo(x2 - nx * halfT, y2 - ny * halfT);
          ctx.stroke();
        }
      } else if (activeTool === 'line') {
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      } else if (activeTool === 'circle') {
        const r = Math.hypot(x2 - x1, y2 - y1);
        ctx.beginPath(); ctx.arc(x1, y1, r, 0, Math.PI * 2); ctx.stroke();
      } else if (activeTool === 'rectangle') {
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      }

      ctx.setLineDash([]);

      // Length label
      const dist = Math.hypot(cursor.x - drawStart.x, cursor.y - drawStart.y);
      if (dist > 10) {
        const midX = (x1 + x2) / 2, midY = (y1 + y2) / 2;
        ctx.fillStyle = '#58a6ff';
        ctx.font = '11px JetBrains Mono';
        ctx.fillText(`${(dist / 1000).toFixed(2)} m`, midX + 4, midY - 4);
      }
    }

    // ── Snap indicator ────────────────────────────────────────────────────
    if (snapGuide) {
      const sx = snapGuide.x * pxPerMm, sy = snapGuide.y * pxPerMm;
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(sx, sy, 5, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();

    // ── Cursor crosshair (screen space) ──────────────────────────────────
    if (cursor && activeTool !== 'pan' && activeTool !== 'select') {
      const canvas2 = canvasRef.current;
      if (!canvas2) return;
      const rect = canvas2.getBoundingClientRect();
      const sx = cursor.x / MM_PER_PX_DEFAULT * t.scale + t.x;
      const sy = cursor.y / MM_PER_PX_DEFAULT * t.scale + t.y;

      ctx.strokeStyle = 'rgba(88,166,255,0.5)';
      ctx.lineWidth = 0.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(W, sy); ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [transform, floor.entities, layers, drawStart, cursor, snapGuide, activeTool, selectedIds, wallThickness]);

  // Re-draw on any change
  useEffect(() => { draw(); }, [draw]);

  // Resize observer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const obs = new ResizeObserver(() => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      draw();
    });
    obs.observe(canvas);
    return () => obs.disconnect();
  }, [draw]);

  // Center view on load
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setTransform({ x: canvas.offsetWidth / 2, y: canvas.offsetHeight / 2, scale: 1 });
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;

    if (isPanning && panStart) {
      setTransform(t => ({ ...t, x: panStart.tx + sx - panStart.mx, y: panStart.ty + sy - panStart.my }));
      return;
    }

    const world = screenToWorld(sx, sy, transform);
    const snapped = snapToGrid(world);
    const endpoint = snapToEndpoints(snapped);
    const finalPt = endpoint || snapped;

    setSnapGuide(endpoint);
    setCursor(finalPt);

    const dist = drawStart ? Math.round(Math.hypot(finalPt.x - drawStart.x, finalPt.y - drawStart.y)) : 0;
    onStatusChange(
      `X: ${(finalPt.x / 1000).toFixed(3)}m  Y: ${(finalPt.y / 1000).toFixed(3)}m` +
      (drawStart ? `  |  Length: ${(dist / 1000).toFixed(3)}m` : '')
    );
  }, [isPanning, panStart, transform, screenToWorld, snapToGrid, snapToEndpoints, drawStart, onStatusChange]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (activeTool === 'pan' || e.button === 1) {
      const rect = canvasRef.current!.getBoundingClientRect();
      setIsPanning(true);
      setPanStart({ mx: e.clientX - rect.left, my: e.clientY - rect.top, tx: transform.x, ty: transform.y });
      return;
    }

    if (!cursor) return;

    switch (activeTool) {
      case 'select': {
        // Find clicked entity
        const tolerance = 200; // mm
        const clicked = [...floor.entities].reverse().find(en => {
          if ('x1' in en) {
            const w = en as WallEntity;
            const dx = w.x2 - w.x1, dy = w.y2 - w.y1;
            const len = Math.hypot(dx, dy);
            if (len === 0) return false;
            const t2 = ((cursor.x - w.x1) * dx + (cursor.y - w.y1) * dy) / (len * len);
            const tc = Math.max(0, Math.min(1, t2));
            const px = w.x1 + tc * dx, py = w.y1 + tc * dy;
            return Math.hypot(cursor.x - px, cursor.y - py) < tolerance;
          }
          return false;
        });
        if (clicked) {
          setSelectedIds(e.shiftKey ? ids => ids.includes(clicked.id) ? ids.filter(i => i !== clicked.id) : [...ids, clicked.id] : [clicked.id]);
        } else {
          setSelectedIds([]);
        }
        break;
      }
      case 'wall': case 'line': case 'circle': case 'rectangle': case 'arc': {
        if (!drawStart) {
          setDrawStart(cursor);
        } else {
          const newEntity: AnyEntity = activeTool === 'wall'
            ? { id: uid(), type: 'wall', layer: activeLayer, x1: drawStart.x, y1: drawStart.y, x2: cursor.x, y2: cursor.y, thickness: wallThickness, height: wallHeight }
            : activeTool === 'circle'
              ? { id: uid(), type: 'circle', layer: activeLayer, cx: drawStart.x, cy: drawStart.y, radius: Math.hypot(cursor.x - drawStart.x, cursor.y - drawStart.y) }
              : { id: uid(), type: 'line', layer: activeLayer, x1: drawStart.x, y1: drawStart.y, x2: cursor.x, y2: cursor.y };

          onFloorChange({ ...floor, entities: [...floor.entities, newEntity] });
          setDrawStart(null);
          onStatusChange('Entity added.');
        }
        break;
      }
      case 'door': {
        const door: AnyEntity = { id: uid(), type: 'door', layer: 'Doors', x: cursor.x, y: cursor.y, width: 900, swing: 90 };
        onFloorChange({ ...floor, entities: [...floor.entities, door] });
        onStatusChange('Door placed.');
        break;
      }
      case 'window': {
        const win: AnyEntity = { id: uid(), type: 'window', layer: 'Windows', x: cursor.x, y: cursor.y, width: 1200, height: 1200, sillHeight: 900 };
        onFloorChange({ ...floor, entities: [...floor.entities, win] });
        onStatusChange('Window placed.');
        break;
      }
      case 'text': {
        const txt = prompt('Enter text:');
        if (txt) {
          const te: AnyEntity = { id: uid(), type: 'text', layer: 'Annotation', x: cursor.x, y: cursor.y, text: txt, fontSize: 200 };
          onFloorChange({ ...floor, entities: [...floor.entities, te] });
        }
        break;
      }
    }
  }, [activeTool, cursor, drawStart, floor, onFloorChange, transform, activeLayer, wallThickness, wallHeight]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    setPanStart(null);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setTransform(t => {
      const newScale = Math.max(0.05, Math.min(20, t.scale * factor));
      return {
        scale: newScale,
        x: mx - (mx - t.x) * (newScale / t.scale),
        y: my - (my - t.y) * (newScale / t.scale),
      };
    });
    setZoom(Math.round(transform.scale * factor * 100));
  }, [transform.scale]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (k === 'escape') { setDrawStart(null); setSelectedIds([]); }
    if (k === 'delete' || k === 'backspace') {
      if (selectedIds.length > 0) {
        onFloorChange({ ...floor, entities: floor.entities.filter(en => !selectedIds.includes(en.id)) });
        setSelectedIds([]);
        onStatusChange(`Deleted ${selectedIds.length} entity(ies)`);
      }
    }
    const toolMap: Record<string, Tool> = { s:'select', h:'pan', w:'wall', l:'line', a:'arc', c:'circle', r:'rectangle', p:'polyline', n:'dimension', t:'text', m:'move', o:'door', i:'window' };
    if (toolMap[k]) setActiveTool(toolMap[k]);
  }, [selectedIds, floor, onFloorChange, onStatusChange]);

  const fitToScreen = () => {
    const canvas = canvasRef.current;
    if (!canvas || floor.entities.length === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const e of floor.entities) {
      if ('x1' in e) {
        const w = e as WallEntity;
        minX = Math.min(minX, w.x1, w.x2); minY = Math.min(minY, w.y1, w.y2);
        maxX = Math.max(maxX, w.x1, w.x2); maxY = Math.max(maxY, w.y1, w.y2);
      }
    }
    if (!isFinite(minX)) return;
    const pad = 2000;
    const W = canvas.width, H = canvas.height;
    const cW = (maxX - minX + pad * 2), cH = (maxY - minY + pad * 2);
    const s = Math.min(W / cW, H / cH) * MM_PER_PX_DEFAULT;
    const tx = W / 2 - ((minX + maxX) / 2) / MM_PER_PX_DEFAULT * s;
    const ty = H / 2 - ((minY + maxY) / 2) / MM_PER_PX_DEFAULT * s;
    setTransform({ x: tx, y: ty, scale: s });
    setZoom(Math.round(s * 100));
  };

  const handleExportDXF = async () => {
    try {
      onStatusChange('Exporting DXF…');
      const result = await invoke('export_dxf', { path: `${floor.name.replace(/\s+/g,'_')}.dxf`, floorData: { entities: floor.entities } });
      onStatusChange(String(result));
    } catch (err) { onStatusChange(`DXF export error: ${err}`); }
  };

  const handleCommandSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && commandText.trim()) {
      const cmd = commandText.trim().toLowerCase();
      setCommandHistory(prev => [...prev.slice(-4), `Command: ${cmd}`]);
      
      const toolMap: Record<string, Tool> = {
        'l': 'line', 'line': 'line',
        'w': 'wall', 'wall': 'wall',
        'c': 'circle', 'circle': 'circle',
        'a': 'arc', 'arc': 'arc',
        'm': 'move', 'move': 'move',
        'co': 'copy', 'cp': 'copy', 'copy': 'copy',
        'ro': 'rotate', 'rotate': 'rotate',
        'tr': 'trim', 'trim': 'trim',
        'ex': 'extend', 'extend': 'extend',
        'o': 'offset', 'offset': 'offset',
        'rect': 'rectangle', 'rec': 'rectangle', 'rectangle': 'rectangle',
        'pl': 'polyline', 'polyline': 'polyline',
        't': 'text', 'text': 'text',
        'd': 'dimension', 'dim': 'dimension', 'dimension': 'dimension',
        'door': 'door', 'window': 'window'
      };
      
      if (toolMap[cmd]) {
        setActiveTool(toolMap[cmd]);
        setDrawStart(null);
        setCommandHistory(prev => [...prev.slice(-4), `Switched to tool: ${toolMap[cmd]}`]);
      } else {
        setCommandHistory(prev => [...prev.slice(-4), `Unknown command: ${cmd}. Available: line, wall, circle, move, copy, trim, etc.`]);
      }
      setCommandText('');
    }
  };

  return (
    <div className="plans-tab" tabIndex={0} onKeyDown={handleKeyDown} style={{ outline: 'none' }}>
      {/* Left toolbar */}
      <div className="draft-toolbar">
        {TOOL_GROUPS.map(group => (
          <div key={group.label} className="tool-group">
            <div className="tool-group-label">{group.label}</div>
            {group.tools.map(tool => (
              <div key={tool.id} className="tooltip-wrapper">
                <button
                  className={`tool-btn${activeTool === tool.id ? ' active' : ''}`}
                  onClick={() => { setActiveTool(tool.id); setDrawStart(null); }}
                  title={tool.label}
                >
                  {tool.icon}
                </button>
                <span className="tooltip">{tool.label}{tool.shortcut ? ` (${tool.shortcut})` : ''}</span>
              </div>
            ))}
            <div className="divider" />
          </div>
        ))}

        {/* View controls */}
        <div className="tool-group">
          <div className="tool-group-label">View</div>
          <div className="tooltip-wrapper">
            <button className="tool-btn" onClick={() => setTransform(t => ({ ...t, scale: t.scale * 1.2 }))}><ZoomIn size={14}/></button>
            <span className="tooltip">Zoom In (+)</span>
          </div>
          <div className="tooltip-wrapper">
            <button className="tool-btn" onClick={() => setTransform(t => ({ ...t, scale: t.scale * 0.8 }))}><ZoomOut size={14}/></button>
            <span className="tooltip">Zoom Out (-)</span>
          </div>
          <div className="tooltip-wrapper">
            <button className="tool-btn" onClick={fitToScreen}><Maximize2 size={14}/></button>
            <span className="tooltip">Fit to Screen (F)</span>
          </div>
          <div className="tooltip-wrapper">
            <button className={`tool-btn${showLayers ? ' active' : ''}`} onClick={() => setShowLayers(v => !v)}><LayersIcon size={14}/></button>
            <span className="tooltip">Toggle Layers</span>
          </div>
        </div>

        <div style={{ flex: 1 }} />

        <div className="tooltip-wrapper">
          <button className="tool-btn" onClick={handleExportDXF}><Download size={14}/></button>
          <span className="tooltip">Export DXF</span>
        </div>
      </div>

      {/* Canvas */}
      <div className="canvas-container">
        <canvas
          ref={canvasRef}
          className="draft-canvas"
          style={{ cursor: activeTool === 'pan' || isPanning ? 'grab' : drawStart ? 'crosshair' : activeTool === 'select' ? 'default' : 'crosshair' }}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => { setCursor(null); setSnapGuide(null); }}
          onWheel={handleWheel}
          onContextMenu={e => { e.preventDefault(); setDrawStart(null); }}
        />

        {/* Tool options bar */}
        {(activeTool === 'wall') && (
          <div className="tool-options-bar">
            <span className="label" style={{margin:0}}>Wall Thickness</span>
            <input type="number" value={wallThickness} onChange={e => setWallThickness(Number(e.target.value))}
              style={{ width: 70 }} min={50} max={1000} step={50} />
            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>mm</span>
            <span className="label" style={{margin:'0 0 0 12px'}}>Height</span>
            <input type="number" value={wallHeight} onChange={e => setWallHeight(Number(e.target.value))}
              style={{ width: 80 }} min={2000} max={10000} step={100} />
            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>mm</span>
            {drawStart && <span className="badge blue pulse">Click to set end point</span>}
          </div>
        )}

        {/* Zoom indicator */}
        <div className="zoom-indicator">{Math.round(transform.scale * 100)}%</div>

        {/* Layer active indicator */}
        <div className="active-layer-chip">
          <div className="color-swatch" style={{ backgroundColor: layers.find(l=>l.name===activeLayer)?.color || '#fff' }} />
          <select value={activeLayer} onChange={e => setActiveLayer(e.target.value)} style={{ background:'none', border:'none', color:'var(--text-primary)', fontSize:11, cursor:'pointer', padding:0 }}>
            {layers.filter(l=>!l.locked).map(l => <option key={l.name} value={l.name}>{l.name}</option>)}
          </select>
        </div>

        {/* AutoCAD-style Command Line */}
        <div className="autocad-command-line">
          <div className="command-history">
            {commandHistory.map((line, i) => (
              <div key={i} className="command-line-text">{line}</div>
            ))}
          </div>
          <div className="command-input-row">
            <span className="command-prompt">Command:</span>
            <input 
              type="text" 
              className="command-input" 
              value={commandText}
              onChange={e => setCommandText(e.target.value)}
              onKeyDown={handleCommandSubmit}
              autoComplete="off"
              spellCheck="false"
              autoFocus
            />
          </div>
        </div>
      </div>

      {/* Right panel: Layer Manager */}
      {showLayers && (
        <LayerManager layers={layers} onLayersChange={onLayersChange} activeLayer={activeLayer} onActiveLayerChange={setActiveLayer} />
      )}
    </div>
  );
}
