import React from 'react';
import {
  AnyEntity, WallEntity, ColumnEntity, SlabEntity, RoofEntity, StairEntity,
  DoorEntity, WindowEntity, BeamEntity, RampEntity, RoomEntity, CurtainWallEntity,
  LineEntity, CircleEntity, ArcEntity, RectangleEntity, PolylineEntity,
  EllipseEntity, SplineEntity, PolygonEntity, HatchEntity,
  TextEntity, MTextEntity, DimensionEntity, LeaderEntity, ZoneEntity
} from '../lib/adf';

interface Props {
  selectedEntities: AnyEntity[];
  onUpdateEntity: (id: string, updates: Partial<AnyEntity>) => void;
}

export default function BimPanel({ selectedEntities, onUpdateEntity }: Props) {
  if (selectedEntities.length === 0) {
    return (
      <div className="bim-panel">
        <div className="bim-panel-header">Properties</div>
        <div className="bim-panel-content empty">No entity selected</div>
      </div>
    );
  }

  // If multiple entities are selected, just show generic count for now
  if (selectedEntities.length > 1) {
    return (
      <div className="bim-panel">
        <div className="bim-panel-header">Properties</div>
        <div className="bim-panel-content">
          <div className="prop-row">
            <span className="prop-label">Selected</span>
            <span className="prop-value">{selectedEntities.length} items</span>
          </div>
        </div>
      </div>
    );
  }

  const en = selectedEntities[0];

  const renderField = (label: string, value: number | string | undefined, fieldKey: string, type: 'number' | 'text' = 'number') => {
    return (
      <div className="prop-row" key={fieldKey}>
        <span className="prop-label">{label}</span>
        <input 
          className="prop-input"
          type={type} 
          value={value ?? ''} 
          onChange={e => {
            const val = type === 'number' ? Number(e.target.value) : e.target.value;
            onUpdateEntity(en.id, { [fieldKey]: val });
          }} 
        />
      </div>
    );
  };

  return (
    <div className="bim-panel">
      <div className="bim-panel-header">{en.type.toUpperCase()} Properties</div>
      <div className="bim-panel-content">
        {renderField('Layer', en.layer, 'layer', 'text')}
        {renderField('Color', en.color ?? 'ByLayer', 'color', 'text')}
        
        <div className="divider" style={{ margin: '8px 0', borderBottom: '1px solid var(--border)' }} />

        {en.type === 'wall' && (
          <>
            {renderField('Thickness', (en as WallEntity).thickness, 'thickness')}
            {renderField('Height', (en as WallEntity).height, 'height')}
          </>
        )}

        {en.type === 'column' && (
          <>
            {renderField('Width', (en as ColumnEntity).width, 'width')}
            {renderField('Depth', (en as ColumnEntity).depth, 'depth')}
            {renderField('Height', (en as ColumnEntity).height, 'height')}
          </>
        )}

        {en.type === 'door' && (
          <>
            {renderField('Width', (en as DoorEntity).width, 'width')}
            {renderField('Swing (deg)', (en as DoorEntity).swing, 'swing')}
          </>
        )}

        {en.type === 'window' && (
          <>
            {renderField('Width', (en as WindowEntity).width, 'width')}
            {renderField('Height', (en as WindowEntity).height, 'height')}
            {renderField('Sill Height', (en as WindowEntity).sillHeight, 'sillHeight')}
          </>
        )}

        {en.type === 'slab' && (
          <>
            {renderField('Thickness', (en as SlabEntity).thickness, 'thickness')}
            {renderField('Elevation', (en as SlabEntity).elevation, 'elevation')}
          </>
        )}

        {en.type === 'roof' && (
          <>
            {renderField('Thickness', (en as RoofEntity).thickness, 'thickness')}
            {renderField('Pitch (deg)', (en as RoofEntity).pitch, 'pitch')}
            {renderField('Elevation', (en as RoofEntity).elevation, 'elevation')}
          </>
        )}

        {en.type === 'stair' && (
          <>
            {renderField('Width', (en as StairEntity).width, 'width')}
            {renderField('Length', (en as StairEntity).length, 'length')}
            {renderField('Height', (en as StairEntity).height, 'height')}
            {renderField('Treads', (en as StairEntity).treadNumber, 'treadNumber')}
          </>
        )}

        {en.type === 'beam' && (
          <>
            {renderField('Width', (en as BeamEntity).width, 'width')}
            {renderField('Depth', (en as BeamEntity).depth, 'depth')}
            {renderField('Elevation', (en as BeamEntity).elevation, 'elevation')}
            {renderField('Material', (en as BeamEntity).material ?? '', 'material', 'text')}
          </>
        )}

        {en.type === 'ramp' && (
          <>
            {renderField('Width', (en as RampEntity).width, 'width')}
            {renderField('Length', (en as RampEntity).length, 'length')}
            {renderField('Height', (en as RampEntity).height, 'height')}
          </>
        )}

        {en.type === 'room' && (
          <>
            {renderField('Name', (en as RoomEntity).name, 'name', 'text')}
            {renderField('Area (m²)', (en as RoomEntity).area, 'area')}
            {renderField('Category', (en as RoomEntity).category ?? '', 'category', 'text')}
          </>
        )}

        {en.type === 'zone' && (
          <>
            {renderField('Name', (en as ZoneEntity).name, 'name', 'text')}
            {renderField('Area (m²)', (en as ZoneEntity).area, 'area')}
            <div className="prop-row">
              <span className="prop-label">Zone Type</span>
              <select className="prop-input" value={(en as ZoneEntity).zoneType || 'living'}
                onChange={e => onUpdateEntity(en.id, { zoneType: e.target.value } as any)}>
                <option value="living">Living</option>
                <option value="bedroom">Bedroom</option>
                <option value="kitchen">Kitchen</option>
                <option value="bathroom">Bathroom</option>
                <option value="corridor">Corridor</option>
                <option value="office">Office</option>
                <option value="retail">Retail</option>
                <option value="storage">Storage</option>
                <option value="utility">Utility</option>
                <option value="outdoor">Outdoor</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div className="prop-row">
              <span className="prop-label">Fill Color</span>
              <input type="color" className="prop-input" value={(en as ZoneEntity).fillColor || '#58a6ff'}
                style={{ width: 30, height: 22, padding: 0, border: 'none' }}
                onChange={e => onUpdateEntity(en.id, { fillColor: e.target.value } as any)} />
            </div>
            {renderField('Fill Opacity', (en as ZoneEntity).fillOpacity ?? 0.15, 'fillOpacity')}
            <div className="prop-row">
              <span className="prop-label">Hatch</span>
              <select className="prop-input" value={(en as ZoneEntity).hatchPattern || 'none'}
                onChange={e => onUpdateEntity(en.id, { hatchPattern: e.target.value } as any)}>
                <option value="none">None</option>
                <option value="diagonal">Diagonal</option>
                <option value="cross">Cross</option>
                <option value="dots">Dots</option>
                <option value="horizontal">Horizontal</option>
                <option value="vertical">Vertical</option>
              </select>
            </div>
          </>
        )}

        {en.type === 'curtainwall' && (
          <>
            {renderField('Height', (en as CurtainWallEntity).height, 'height')}
            {renderField('Mullion Spacing', (en as CurtainWallEntity).mullionSpacing, 'mullionSpacing')}
            {renderField('Transom Spacing', (en as CurtainWallEntity).transomSpacing, 'transomSpacing')}
          </>
        )}

        {en.type === 'line' && (
          <>
            {renderField('X1', (en as LineEntity).x1, 'x1')}
            {renderField('Y1', (en as LineEntity).y1, 'y1')}
            {renderField('X2', (en as LineEntity).x2, 'x2')}
            {renderField('Y2', (en as LineEntity).y2, 'y2')}
          </>
        )}

        {en.type === 'circle' && (
          <>
            {renderField('Center X', (en as CircleEntity).cx, 'cx')}
            {renderField('Center Y', (en as CircleEntity).cy, 'cy')}
            {renderField('Radius', (en as CircleEntity).radius, 'radius')}
          </>
        )}

        {en.type === 'arc' && (
          <>
            {renderField('Center X', (en as ArcEntity).cx, 'cx')}
            {renderField('Center Y', (en as ArcEntity).cy, 'cy')}
            {renderField('Radius', (en as ArcEntity).radius, 'radius')}
          </>
        )}

        {en.type === 'rectangle' && (
          <>
            {renderField('X1', (en as RectangleEntity).x1, 'x1')}
            {renderField('Y1', (en as RectangleEntity).y1, 'y1')}
            {renderField('X2', (en as RectangleEntity).x2, 'x2')}
            {renderField('Y2', (en as RectangleEntity).y2, 'y2')}
          </>
        )}

        {en.type === 'ellipse' && (
          <>
            {renderField('Center X', (en as EllipseEntity).cx, 'cx')}
            {renderField('Center Y', (en as EllipseEntity).cy, 'cy')}
            {renderField('RX', (en as EllipseEntity).rx, 'rx')}
            {renderField('RY', (en as EllipseEntity).ry, 'ry')}
          </>
        )}

        {en.type === 'polygon' && (
          <>
            {renderField('Center X', (en as PolygonEntity).cx, 'cx')}
            {renderField('Center Y', (en as PolygonEntity).cy, 'cy')}
            {renderField('Radius', (en as PolygonEntity).radius, 'radius')}
            {renderField('Sides', (en as PolygonEntity).sides, 'sides')}
          </>
        )}

        {en.type === 'text' && (
          <>
            {renderField('Text', (en as TextEntity).text, 'text', 'text')}
            {renderField('Font Size', (en as TextEntity).fontSize, 'fontSize')}
          </>
        )}

        {en.type === 'mtext' && (
          <>
            {renderField('Text', (en as MTextEntity).text, 'text', 'text')}
            {renderField('Font Size', (en as MTextEntity).fontSize, 'fontSize')}
            {renderField('Width', (en as MTextEntity).width, 'width')}
          </>
        )}

        {en.type === 'dimension' && (
          <>
            {renderField('Kind', (en as DimensionEntity).dimKind, 'dimKind', 'text')}
            {renderField('Offset', (en as DimensionEntity).offset, 'offset')}
            {renderField('Text Override', (en as DimensionEntity).textOverride ?? '', 'textOverride', 'text')}
          </>
        )}

        {['wall', 'column', 'slab', 'roof', 'beam'].includes(en.type) && (
          <>
            <div className="divider" style={{ margin: '8px 0', borderBottom: '1px solid var(--border)' }} />
            {renderField('Material', (en as any).material ?? 'Default', 'material', 'text')}
          </>
        )}

        {/* ── MEP Devices ────────────────────────────────────────────── */}
        {['sprinkler', 'diffuser', 'outlet', 'switch_mep', 'panel_board', 'transformer', 'valve', 'pump'].includes(en.type) && (
          <>
            <div className="divider" style={{ margin: '8px 0', borderBottom: '1px solid var(--border)' }} />
            <div className="prop-row"><span className="prop-label" style={{ fontWeight: 600, color: 'var(--accent)' }}>MEP Device</span></div>
            {renderField('X', (en as any).x, 'x')}
            {renderField('Y', (en as any).y, 'y')}
            {renderField('System', (en as any).system ?? '', 'system', 'text')}
            {renderField('Symbol', (en as any).symbol ?? '', 'symbol', 'text')}
            {(en as any).amperage !== undefined && renderField('Amperage', (en as any).amperage, 'amperage')}
            {(en as any).voltage !== undefined && renderField('Voltage', (en as any).voltage, 'voltage')}
            {(en as any).wattage !== undefined && renderField('Wattage', (en as any).wattage, 'wattage')}
            {(en as any).cfm !== undefined && renderField('CFM', (en as any).cfm, 'cfm')}
            {(en as any).coverage !== undefined && renderField('Coverage (mm)', (en as any).coverage, 'coverage')}
            {(en as any).k_factor !== undefined && renderField('K-Factor', (en as any).k_factor, 'k_factor')}
            {(en as any).flowRate !== undefined && renderField('Flow Rate', (en as any).flowRate, 'flowRate')}
            {(en as any).size !== undefined && renderField('Size', (en as any).size, 'size')}
          </>
        )}

        {/* ── Pipe / Duct / Conduit ──────────────────────────────────── */}
        {['pipe', 'duct', 'conduit', 'cable_tray'].includes(en.type) && (
          <>
            <div className="divider" style={{ margin: '8px 0', borderBottom: '1px solid var(--border)' }} />
            <div className="prop-row"><span className="prop-label" style={{ fontWeight: 600, color: 'var(--accent)' }}>MEP Routing</span></div>
            {renderField('System', (en as any).system ?? '', 'system', 'text')}
            {(en as any).diameter !== undefined && renderField('Diameter', (en as any).diameter, 'diameter')}
            {(en as any).width !== undefined && renderField('Width', (en as any).width, 'width')}
            {(en as any).height !== undefined && renderField('Height', (en as any).height, 'height')}
            {renderField('Material', (en as any).material ?? '', 'material', 'text')}
            <div className="prop-row"><span className="prop-label">Points</span><span className="prop-value">{(en as any).points?.length ?? 0}</span></div>
          </>
        )}

        {/* ── Site entities ──────────────────────────────────────────── */}
        {['contour', 'grading', 'paving', 'fence_site', 'landscape', 'parking'].includes(en.type) && (
          <>
            <div className="divider" style={{ margin: '8px 0', borderBottom: '1px solid var(--border)' }} />
            <div className="prop-row"><span className="prop-label" style={{ fontWeight: 600, color: 'var(--accent)' }}>Site</span></div>
            {(en as any).elevation !== undefined && renderField('Elevation', (en as any).elevation, 'elevation')}
            {(en as any).material !== undefined && renderField('Material', (en as any).material, 'material', 'text')}
            {(en as any).fenceType !== undefined && renderField('Fence Type', (en as any).fenceType, 'fenceType', 'text')}
            {(en as any).accessAisle !== undefined && renderField('Access Aisle', (en as any).accessAisle, 'accessAisle')}
          </>
        )}

        {/* ── Structural ─────────────────────────────────────────────── */}
        {['footing', 'pile', 'retaining_wall', 'structural_member'].includes(en.type) && (
          <>
            <div className="divider" style={{ margin: '8px 0', borderBottom: '1px solid var(--border)' }} />
            <div className="prop-row"><span className="prop-label" style={{ fontWeight: 600, color: 'var(--accent)' }}>Structural</span></div>
            {(en as any).width !== undefined && renderField('Width', (en as any).width, 'width')}
            {(en as any).depth !== undefined && renderField('Depth', (en as any).depth, 'depth')}
            {(en as any).height !== undefined && renderField('Height', (en as any).height, 'height')}
            {(en as any).thickness !== undefined && renderField('Thickness', (en as any).thickness, 'thickness')}
            {renderField('Material', (en as any).material ?? '', 'material', 'text')}
          </>
        )}

        {/* ── Hatch ──────────────────────────────────────────────────── */}
        {en.type === 'hatch' && (
          <>
            {renderField('Pattern', (en as HatchEntity).pattern, 'pattern', 'text')}
            {renderField('Scale', (en as HatchEntity).scale, 'scale')}
          </>
        )}

        {/* ── Polyline / Spline ──────────────────────────────────────── */}
        {(en.type === 'polyline' || en.type === 'spline') && (
          <>
            <div className="prop-row"><span className="prop-label">Points</span><span className="prop-value">{(en as any).points?.length || (en as any).controlPoints?.length || 0}</span></div>
            {renderField('Closed', (en as any).closed ? 'Yes' : 'No', 'closed', 'text')}
          </>
        )}

        {/* ── Leader entities ────────────────────────────────────────── */}
        {en.type === 'leader' && (
          <>
            {renderField('Text', (en as LeaderEntity).text, 'text', 'text')}
          </>
        )}

        {/* ── Railing / Ceiling ──────────────────────────────────────── */}
        {en.type === 'railing' && (
          <>
            {renderField('Height', (en as any).height, 'height')}
            {renderField('Baluster Spacing', (en as any).balusterSpacing, 'balusterSpacing')}
          </>
        )}
        {en.type === 'ceiling' && (
          <>
            {renderField('Height', (en as any).height, 'height')}
          </>
        )}

        {/* ── Opening / Niche / Shaft ────────────────────────────────── */}
        {(en.type === 'opening' || en.type === 'niche' || en.type === 'shaft') && (
          <>
            {(en as any).width !== undefined && renderField('Width', (en as any).width, 'width')}
            {(en as any).height !== undefined && renderField('Height', (en as any).height, 'height')}
            {(en as any).depth !== undefined && renderField('Depth', (en as any).depth, 'depth')}
          </>
        )}

        {/* ── Annotation marks ───────────────────────────────────────── */}
        {['section_mark', 'detail_mark', 'elevation_mark', 'grid_bubble', 'tag', 'keynote', 'revision_tag'].includes(en.type) && (
          <>
            <div className="divider" style={{ margin: '8px 0', borderBottom: '1px solid var(--border)' }} />
            {renderField('X', (en as any).x, 'x')}
            {renderField('Y', (en as any).y, 'y')}
            {(en as any).label !== undefined && renderField('Label', (en as any).label, 'label', 'text')}
            {(en as any).text !== undefined && renderField('Text', (en as any).text, 'text', 'text')}
          </>
        )}
      </div>
    </div>
  );
}
