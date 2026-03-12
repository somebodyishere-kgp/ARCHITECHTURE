import React from 'react';
import { Eye, EyeOff, Lock, Unlock, Plus, Trash2, Snowflake } from 'lucide-react';
import type { Layer } from '@/lib/adf';
import { defaultLayers } from '@/lib/adf';
import './LayerManager.css';

interface Props {
  layers: Layer[];
  onLayersChange: (layers: Layer[]) => void;
  activeLayer: string;
  onActiveLayerChange: (name: string) => void;
}

const LINEWEIGHTS = [0.05, 0.09, 0.13, 0.18, 0.25, 0.35, 0.5, 0.7, 1.0];
const LINETYPES: Layer['linetype'][] = ['continuous', 'dashed', 'dotted', 'dashdot', 'center', 'hidden'];

export default function LayerManager({ layers, onLayersChange, activeLayer, onActiveLayerChange }: Props) {
  const update = (name: string, patch: Partial<Layer>) => {
    onLayersChange(layers.map(l => l.name === name ? { ...l, ...patch } : l));
  };

  const addLayer = () => {
    const name = `Layer ${layers.length + 1}`;
    onLayersChange([...layers, { name, color: '#aaaaaa', visible: true, locked: false, frozen: false, lineweight: 0.25, linetype: 'continuous' }]);
  };

  const removeLayer = (name: string) => {
    if (layers.length <= 1) return;
    const next = layers.filter(l => l.name !== name);
    onLayersChange(next);
    if (activeLayer === name) onActiveLayerChange(next[0].name);
  };

  const toggleFreeze = (name: string, layer: Layer) => {
    if (layer.frozen) {
      update(name, { frozen: false, visible: true, locked: false });
    } else {
      update(name, { frozen: true, visible: false, locked: true });
    }
  };

  return (
    <div className="layer-manager">
      <div className="layer-manager-header">
        <span>Layers</span>
        <button className="btn ghost icon-only" onClick={addLayer} title="Add Layer"><Plus size={12}/></button>
      </div>

      <div className="layers-list">
        {layers.map(layer => (
          <div key={layer.name}
            className={`layer-row${activeLayer === layer.name ? ' active' : ''}${layer.frozen ? ' frozen' : ''}`}
            onClick={() => !layer.locked && !layer.frozen && onActiveLayerChange(layer.name)}>

            {/* Visibility */}
            <button className="layer-icon-btn" onClick={e => { e.stopPropagation(); if (!layer.frozen) update(layer.name, { visible: !layer.visible }); }}
              title={layer.visible ? 'Hide' : 'Show'}>
              {layer.visible ? <Eye size={11}/> : <EyeOff size={11} style={{ opacity:0.4 }}/>}
            </button>

            {/* Lock */}
            <button className="layer-icon-btn" onClick={e => { e.stopPropagation(); if (!layer.frozen) update(layer.name, { locked: !layer.locked }); }}
              title={layer.locked ? 'Unlock' : 'Lock'}>
              {layer.locked ? <Lock size={10} style={{ color:'var(--amber)' }}/> : <Unlock size={10}/>}
            </button>

            {/* Freeze */}
            <button className="layer-icon-btn" onClick={e => { e.stopPropagation(); toggleFreeze(layer.name, layer); }}
              title={layer.frozen ? 'Thaw' : 'Freeze'}>
              <Snowflake size={10} style={{ color: layer.frozen ? '#58a6ff' : 'var(--text-muted)', opacity: layer.frozen ? 1 : 0.3 }}/>
            </button>

            {/* Color */}
            <div style={{ position:'relative', flexShrink:0 }}>
              <div className="color-swatch" style={{ backgroundColor: layer.color }}
                onClick={e => { e.stopPropagation(); (e.currentTarget.nextSibling as HTMLInputElement).click(); }}
              />
              <input type="color" value={layer.color} style={{ opacity:0, position:'absolute', inset:0, width:'100%', height:'100%', cursor:'pointer' }}
                onChange={e => update(layer.name, { color: e.target.value })}
                onClick={e => e.stopPropagation()}
              />
            </div>

            {/* Name */}
            <span className="layer-name" style={{ opacity: layer.visible ? 1 : 0.4 }}>{layer.name}</span>

            {/* Linetype */}
            <select className="layer-lt" value={layer.linetype ?? 'continuous'}
              onChange={e => { e.stopPropagation(); update(layer.name, { linetype: e.target.value as Layer['linetype'] }); }}
              onClick={e => e.stopPropagation()}
              title="Linetype">
              {LINETYPES.map(lt => <option key={lt} value={lt}>{lt}</option>)}
            </select>

            {/* Lineweight */}
            <select className="layer-lw" value={layer.lineweight ?? 0.25}
              onChange={e => { e.stopPropagation(); update(layer.name, { lineweight: Number(e.target.value) }); }}
              onClick={e => e.stopPropagation()}
              title="Lineweight">
              {LINEWEIGHTS.map(w => <option key={w} value={w}>{w}</option>)}
            </select>

            {/* Delete (non-default layers only) */}
            {!defaultLayers().find(d => d.name === layer.name) && (
              <button className="layer-icon-btn danger" onClick={e => { e.stopPropagation(); removeLayer(layer.name); }}>
                <Trash2 size={10}/>
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="layer-manager-footer">
        <span className="label">Active: {activeLayer}</span>
      </div>
    </div>
  );
}
