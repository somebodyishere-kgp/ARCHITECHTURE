import React, { useState, useMemo } from 'react';
import { Search, Package, ChevronDown, ChevronRight } from 'lucide-react';
import { ALL_ASSETS, ASSET_CATEGORIES, ASSET_PACKS, searchAssets, assetToBlockDef } from '../lib/assetLibrary';
import type { AssetCategory, AssetEntry, AssetPack } from '../lib/assetLibrary';
import type { BlockDef } from '../lib/adf';
import './AssetLibrary.css';

interface Props {
  onInsertAsset: (block: BlockDef) => void;
}

export default function AssetLibrary({ onInsertAsset }: Props) {
  const [query, setQuery] = useState('');
  const [packFilter, setPackFilter] = useState<'all' | AssetPack>('all');
  const [expandedCat, setExpandedCat] = useState<AssetCategory | null>('doors');

  const filtered = useMemo(() => {
    const matched = searchAssets(query);
    if (packFilter === 'all') return matched;
    return matched.filter(asset => asset.pack === packFilter);
  }, [packFilter, query]);

  const grouped = useMemo(() => {
    const map = new Map<AssetCategory, AssetEntry[]>();
    for (const a of filtered) {
      if (!map.has(a.category)) map.set(a.category, []);
      map.get(a.category)!.push(a);
    }
    return map;
  }, [filtered]);

  const toggleCat = (cat: AssetCategory) => {
    setExpandedCat(prev => prev === cat ? null : cat);
  };

  return (
    <div className="asset-library">
      <div className="asset-library-header">
        <Package size={12} />
        <span>Asset Library</span>
        <span className="asset-count">{filtered.length}</span>
      </div>

      <div className="asset-search">
        <Search size={11} />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search assets..."
          className="asset-search-input"
        />
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        <button
          className={`btn ghost${packFilter === 'all' ? ' active' : ''}`}
          style={{ fontSize: 10, padding: '2px 6px' }}
          onClick={() => setPackFilter('all')}
        >
          All Packs
        </button>
        {ASSET_PACKS.map(pack => (
          <button
            key={pack}
            className={`btn ghost${packFilter === pack ? ' active' : ''}`}
            style={{ fontSize: 10, padding: '2px 6px' }}
            onClick={() => setPackFilter(pack)}
          >
            {pack}
          </button>
        ))}
      </div>

      <div className="asset-categories">
        {ASSET_CATEGORIES.map(cat => {
          const items = grouped.get(cat.key);
          if (!items || items.length === 0) return null;
          const isExpanded = expandedCat === cat.key;

          return (
            <div key={cat.key} className="asset-cat-group">
              <button
                className={`asset-cat-header${isExpanded ? ' expanded' : ''}`}
                onClick={() => toggleCat(cat.key)}
              >
                {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                <span className="asset-cat-label">{cat.label}</span>
                <span className="asset-cat-count">{items.length}</span>
              </button>

              {isExpanded && (
                <div className="asset-cat-items">
                  {items.map(asset => (
                    <button
                      key={asset.name}
                      className="asset-item"
                      onClick={() => onInsertAsset(assetToBlockDef(asset))}
                      title={`${asset.description}\n${asset.width}×${asset.height}mm`}
                    >
                      <AssetPreview asset={asset} />
                      <div className="asset-item-info">
                        <span className="asset-item-name">{asset.name}</span>
                        <span className="asset-item-size">{asset.width}×{asset.height}</span>
                        {(asset.pack || asset.source) && (
                          <span className="asset-item-size" style={{ fontSize: 9 }}>
                            {asset.pack || asset.source}
                            {asset.license ? ` · ${asset.license}` : ''}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Mini canvas preview of an asset */
function AssetPreview({ asset }: { asset: AssetEntry }) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;

    const w = cvs.width, h = cvs.height;
    ctx.clearRect(0, 0, w, h);

    const entities = asset.buildEntities();
    // Compute bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const e of entities) {
      if ('x1' in e) { const t = e as any; minX = Math.min(minX, t.x1, t.x2); maxX = Math.max(maxX, t.x1, t.x2); minY = Math.min(minY, t.y1, t.y2); maxY = Math.max(maxY, t.y1, t.y2); }
      if ('cx' in e) { const t = e as any; minX = Math.min(minX, t.cx - t.radius); maxX = Math.max(maxX, t.cx + t.radius); minY = Math.min(minY, t.cy - t.radius); maxY = Math.max(maxY, t.cy + t.radius); }
      if ('x' in e && 'y' in e && !('x1' in e) && !('cx' in e)) { const t = e as any; minX = Math.min(minX, t.x); maxX = Math.max(maxX, t.x); minY = Math.min(minY, t.y); maxY = Math.max(maxY, t.y); }
      if ('points' in e) { const pts = (e as any).points as Array<{x: number; y: number}>; for (const p of pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); } }
    }

    if (!isFinite(minX)) return;
    const bw = maxX - minX || 1, bh = maxY - minY || 1;
    const pad = 4;
    const scale = Math.min((w - pad * 2) / bw, (h - pad * 2) / bh);
    const ox = pad + (w - pad * 2 - bw * scale) / 2;
    const oy = pad + (h - pad * 2 - bh * scale) / 2;

    const tx = (x: number) => ox + (x - minX) * scale;
    const ty = (y: number) => oy + (y - minY) * scale;

    ctx.strokeStyle = '#8b949e';
    ctx.fillStyle = '#8b949e';
    ctx.lineWidth = 1;

    for (const e of entities) {
      if (e.type === 'line') {
        const l = e as any;
        ctx.beginPath(); ctx.moveTo(tx(l.x1), ty(l.y1)); ctx.lineTo(tx(l.x2), ty(l.y2)); ctx.stroke();
      } else if (e.type === 'circle') {
        const c = e as any;
        ctx.beginPath(); ctx.arc(tx(c.cx), ty(c.cy), c.radius * scale, 0, Math.PI * 2); ctx.stroke();
      } else if (e.type === 'arc') {
        const a = e as any;
        ctx.beginPath(); ctx.arc(tx(a.cx), ty(a.cy), a.radius * scale, a.startAngle, a.endAngle); ctx.stroke();
      } else if (e.type === 'rectangle') {
        const r = e as any;
        ctx.strokeRect(tx(r.x1), ty(r.y1), (r.x2 - r.x1) * scale, (r.y2 - r.y1) * scale);
      } else if (e.type === 'polyline') {
        const p = e as any;
        if (p.points.length > 1) {
          ctx.beginPath();
          ctx.moveTo(tx(p.points[0].x), ty(p.points[0].y));
          for (let i = 1; i < p.points.length; i++) ctx.lineTo(tx(p.points[i].x), ty(p.points[i].y));
          if (p.closed) ctx.closePath();
          ctx.stroke();
        }
      }
    }
  }, [asset]);

  return <canvas ref={canvasRef} width={48} height={48} className="asset-preview-canvas" />;
}
