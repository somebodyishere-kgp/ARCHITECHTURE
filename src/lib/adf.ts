// ═══════════════════════════════════════════════════════════════════════════════
// ADF (ArchFlow Document Format) — Central Data Model
// The single source of truth. Every tab reads from and writes to this model.
// Units: millimetres (mm) for all geometry. Angles in radians unless noted.
// ═══════════════════════════════════════════════════════════════════════════════

export interface Vec2 { x: number; y: number; }
export interface Vec3 { x: number; y: number; z: number; }

// ─── Entity types ────────────────────────────────────────────────────────────
export type EntityType =
  | 'line' | 'polyline' | 'circle' | 'arc' | 'ellipse' | 'spline'
  | 'rectangle' | 'polygon' | 'hatch' | 'point' | 'gradient'
  | 'xline' | 'ray' | 'mline' | 'donut' | 'revcloud' | 'wipeout' | 'region'
  | 'wall' | 'door' | 'window' | 'column' | 'beam'
  | 'slab' | 'roof' | 'stair' | 'ramp' | 'room' | 'zone' | 'curtainwall'
  | 'railing' | 'ceiling'
  | 'furniture' | 'appliance' | 'fixture' | 'structural_member'
  | 'footing' | 'pile' | 'retaining_wall'
  | 'opening' | 'niche' | 'shaft' | 'elevator'
  // MEP
  | 'pipe' | 'duct' | 'conduit' | 'cable_tray'
  | 'sprinkler' | 'diffuser' | 'outlet' | 'switch_mep'
  | 'panel_board' | 'transformer' | 'valve' | 'pump'
  // Site
  | 'contour' | 'grading' | 'paving' | 'landscape' | 'fence_site' | 'parking'
  // Annotation
  | 'text' | 'mtext' | 'dimension' | 'leader' | 'multileader' | 'table' | 'tolerance'
  | 'section_mark' | 'detail_mark' | 'elevation_mark' | 'grid_bubble'
  | 'tag' | 'keynote' | 'revision_tag'
  | 'block_ref' | 'image';

// ─── Linetype ────────────────────────────────────────────────────────────────
export type Linetype = 'continuous' | 'dashed' | 'dotted' | 'dashdot'
  | 'center' | 'phantom' | 'hidden' | 'border';

// ─── Dimension subtypes ──────────────────────────────────────────────────────
export type DimensionKind = 'linear' | 'aligned' | 'angular' | 'radius'
  | 'diameter' | 'ordinate' | 'arc_length';

// ─── Base for every entity ───────────────────────────────────────────────────
export interface BaseEntity {
  id: string;
  type: EntityType;
  layer: string;
  color?: string;
  lineweight?: number;
  linetype?: Linetype;
  locked?: boolean;
  visible?: boolean;
}

// ─── Geometry primitives ─────────────────────────────────────────────────────
export interface PointEntity extends BaseEntity {
  type: 'point';
  x: number; y: number;
}

export interface LineEntity extends BaseEntity {
  type: 'line';
  x1: number; y1: number;
  x2: number; y2: number;
}

export interface PolylineEntity extends BaseEntity {
  type: 'polyline';
  points: Vec2[];
  closed: boolean;
  bulges?: number[];
}

export interface CircleEntity extends BaseEntity {
  type: 'circle';
  cx: number; cy: number;
  radius: number;
}

export interface ArcEntity extends BaseEntity {
  type: 'arc';
  cx: number; cy: number;
  radius: number;
  startAngle: number;
  endAngle: number;
}

export interface EllipseEntity extends BaseEntity {
  type: 'ellipse';
  cx: number; cy: number;
  rx: number; ry: number;
  rotation: number;
  startAngle: number;
  endAngle: number;
}

export interface SplineEntity extends BaseEntity {
  type: 'spline';
  controlPoints: Vec2[];
  degree: number;
  closed: boolean;
  fitPoints?: Vec2[];
  knots?: number[];
  weights?: number[];
}

export interface RectangleEntity extends BaseEntity {
  type: 'rectangle';
  x1: number; y1: number;
  x2: number; y2: number;
  cornerRadius?: number;
}

export interface PolygonEntity extends BaseEntity {
  type: 'polygon';
  cx: number; cy: number;
  radius: number;
  sides: number;
  rotation: number;
  inscribed: boolean;
}

export interface HatchEntity extends BaseEntity {
  type: 'hatch';
  boundary: Vec2[];
  pattern: string;
  scale: number;
  angle: number;
}

// ─── Construction & special geometry ─────────────────────────────────────────
export interface XLineEntity extends BaseEntity {
  type: 'xline';
  x: number; y: number;
  dx: number; dy: number;
}

export interface RayEntity extends BaseEntity {
  type: 'ray';
  x: number; y: number;
  dx: number; dy: number;
}

export interface MLineEntity extends BaseEntity {
  type: 'mline';
  points: Vec2[];
  offsets: number[];
  closed: boolean;
}

export interface DonutEntity extends BaseEntity {
  type: 'donut';
  cx: number; cy: number;
  innerRadius: number;
  outerRadius: number;
}

export interface RevCloudEntity extends BaseEntity {
  type: 'revcloud';
  points: Vec2[];
  arcLength: number;
}

export interface WipeoutEntity extends BaseEntity {
  type: 'wipeout';
  points: Vec2[];
}

export interface RegionEntity extends BaseEntity {
  type: 'region';
  boundary: Vec2[];
}

// ─── Architectural entities ──────────────────────────────────────────────────
export interface WallEntity extends BaseEntity {
  type: 'wall';
  x1: number; y1: number;
  x2: number; y2: number;
  thickness: number;
  height: number;
  material?: string;
  structuralUsage?: 'bearing' | 'non-bearing' | 'shear';
  ifcType?: string;
}

export interface DoorEntity extends BaseEntity {
  type: 'door';
  x: number; y: number;
  width: number;
  height: number;
  swing: number;
  wallId?: string;
  doorType?: 'single' | 'double' | 'sliding' | 'folding' | 'revolving';
  openDirection?: 'left' | 'right';
}

export interface WindowEntity extends BaseEntity {
  type: 'window';
  x: number; y: number;
  width: number;
  height: number;
  sillHeight: number;
  wallId?: string;
  windowType?: 'fixed' | 'casement' | 'sliding' | 'awning' | 'hopper';
  panes?: number;
}

export interface ColumnEntity extends BaseEntity {
  type: 'column';
  x: number; y: number;
  width: number; depth: number;
  height: number;
  shape?: 'rectangular' | 'circular' | 'steel_h' | 'steel_i';
  rotation: number;
  material?: string;
}

export interface BeamEntity extends BaseEntity {
  type: 'beam';
  x1: number; y1: number;
  x2: number; y2: number;
  width: number; depth: number;
  elevation: number;
  material?: string;
  profile?: string;
}

export interface SlabEntity extends BaseEntity {
  type: 'slab';
  points: Vec2[];
  thickness: number;
  elevation: number;
  material?: string;
  slabType?: 'floor' | 'ceiling' | 'foundation';
}

export interface RoofEntity extends BaseEntity {
  type: 'roof';
  points: Vec2[];
  thickness: number;
  pitch: number;
  elevation: number;
  material?: string;
  roofType?: 'flat' | 'gable' | 'hip' | 'mansard' | 'shed' | 'butterfly';
}

export interface StairEntity extends BaseEntity {
  type: 'stair';
  x: number; y: number;
  width: number;
  length: number;
  height: number;
  treadNumber: number;
  riserHeight?: number;
  treadDepth?: number;
  stairType?: 'straight' | 'l_shaped' | 'u_shaped' | 'spiral';
  rotation: number;
}

export interface RampEntity extends BaseEntity {
  type: 'ramp';
  x: number; y: number;
  width: number; length: number;
  height: number;
  slope?: number;
  rotation: number;
}

export interface RoomEntity extends BaseEntity {
  type: 'room';
  points: Vec2[];
  name: string;
  number?: string;
  area?: number;
  category?: string;
}

export interface ZoneEntity extends BaseEntity {
  type: 'zone';
  points: Vec2[];
  name: string;
  zoneType?: 'living' | 'bedroom' | 'kitchen' | 'bathroom' | 'corridor' | 'office' | 'retail' | 'storage' | 'utility' | 'outdoor' | 'custom';
  area?: number;
  fillColor?: string;
  fillOpacity?: number;
  hatchPattern?: string;
  hatchScale?: number;
  hatchAngle?: number;
  tileOffsetX?: number;
  tileOffsetY?: number;
  tileRotation?: number;
  labelVisible?: boolean;
  showArea?: boolean;
}

export interface CurtainWallEntity extends BaseEntity {
  type: 'curtainwall';
  x1: number; y1: number;
  x2: number; y2: number;
  height: number;
  mullionSpacing: number;
  transomSpacing: number;
}

export interface RailingEntity extends BaseEntity {
  type: 'railing';
  points: Vec2[];
  height: number;
  balusterSpacing: number;
  railType?: 'glass' | 'metal' | 'wood' | 'cable';
}

export interface CeilingEntity extends BaseEntity {
  type: 'ceiling';
  points: Vec2[];
  height: number;
  material?: string;
}

// ─── Annotation entities ─────────────────────────────────────────────────────
export interface TextEntity extends BaseEntity {
  type: 'text';
  x: number; y: number;
  text: string;
  fontSize: number;
  rotation: number;
  alignment?: 'left' | 'center' | 'right';
  fontFamily?: string;
  bold?: boolean;
  italic?: boolean;
}

export interface MTextEntity extends BaseEntity {
  type: 'mtext';
  x: number; y: number;
  width: number;
  text: string;
  fontSize: number;
  rotation: number;
  lineSpacing?: number;
}

export interface DimensionEntity extends BaseEntity {
  type: 'dimension';
  dimKind: DimensionKind;
  x1: number; y1: number;
  x2: number; y2: number;
  offset: number;
  x3?: number; y3?: number;
  textOverride?: string;
  precision?: number;
  // Parametric constraint: linked entity IDs to drive when value edited
  constrainedEntityId?: string;
  constrainedEnd?: 'start' | 'end' | 'both';
  drivenValue?: number; // mm — applied value
}

export interface LeaderEntity extends BaseEntity {
  type: 'leader';
  points: Vec2[];
  text: string;
  arrowSize?: number;
}

export interface MultiLeaderEntity extends BaseEntity {
  type: 'multileader';
  leaders: Vec2[][];
  content: string;
  contentType: 'text' | 'block';
  landingGap: number;
}

export interface TableEntity extends BaseEntity {
  type: 'table';
  x: number; y: number;
  rows: number;
  cols: number;
  colWidths: number[];
  rowHeights: number[];
  cells: string[][];
  rotation: number;
}

export interface ToleranceEntity extends BaseEntity {
  type: 'tolerance';
  x: number; y: number;
  symbol: string;
  value: string;
  datum1?: string;
  datum2?: string;
  datum3?: string;
}

// ─── Block & Image references ────────────────────────────────────────────────
export interface BlockRefEntity extends BaseEntity {
  type: 'block_ref';
  blockName: string;
  x: number; y: number;
  scaleX: number; scaleY: number;
  rotation: number;
}

export interface ImageEntity extends BaseEntity {
  type: 'image';
  x: number; y: number;
  width: number; height: number;
  path: string;
  rotation: number;
  opacity: number;
}

// ─── Additional Arch entities ────────────────────────────────────────────────
export interface FurnitureEntity extends BaseEntity {
  type: 'furniture';
  x: number; y: number;
  width: number; depth: number;
  rotation: number;
  category: string; // 'chair' | 'desk' | 'table' | 'sofa' | 'bed' | 'cabinet' | 'shelf'
  name: string;
}

export interface ApplianceEntity extends BaseEntity {
  type: 'appliance';
  x: number; y: number;
  width: number; depth: number;
  rotation: number;
  category: string; // 'oven' | 'fridge' | 'washer' | 'dryer' | 'dishwasher' | 'microwave'
  name: string;
}

export interface FixtureEntity extends BaseEntity {
  type: 'fixture';
  x: number; y: number;
  width: number; depth: number;
  rotation: number;
  category: string; // 'sink' | 'toilet' | 'bathtub' | 'shower' | 'vanity' | 'bidet'
  name: string;
}

export interface StructuralMemberEntity extends BaseEntity {
  type: 'structural_member';
  x1: number; y1: number; x2: number; y2: number;
  width: number; depth: number;
  profile: string; // 'W' | 'HSS' | 'C' | 'L' | 'T'
  material: string;
}

export interface FootingEntity extends BaseEntity {
  type: 'footing';
  x: number; y: number;
  width: number; depth: number; thickness: number;
  footingType: string; // 'pad' | 'strip' | 'mat'
}

export interface PileEntity extends BaseEntity {
  type: 'pile';
  x: number; y: number;
  diameter: number; depth: number;
  pileType: string; // 'driven' | 'bored' | 'micro'
}

export interface RetainingWallEntity extends BaseEntity {
  type: 'retaining_wall';
  points: Vec2[];
  height: number;
  thickness: number;
  wallType: string; // 'gravity' | 'cantilever' | 'counterfort'
}

export interface OpeningEntity extends BaseEntity {
  type: 'opening';
  x: number; y: number;
  width: number; height: number;
  rotation: number;
}

export interface NicheEntity extends BaseEntity {
  type: 'niche';
  x: number; y: number;
  width: number; height: number; depth: number;
  rotation: number;
}

export interface ShaftEntity extends BaseEntity {
  type: 'shaft';
  points: Vec2[];
  shaftType: string; // 'elevator' | 'mechanical' | 'plumbing' | 'electrical'
}

export interface ElevatorEntity extends BaseEntity {
  type: 'elevator';
  x: number; y: number;
  width: number; depth: number;
  capacity: number;
  stops: number;
}

// ─── MEP entities ────────────────────────────────────────────────────────────
export interface PipeEntity extends BaseEntity {
  type: 'pipe';
  points: Vec2[];
  diameter: number;
  material: string;
  system: string; // 'supply' | 'return' | 'drain' | 'vent' | 'gas'
}

export interface DuctEntity extends BaseEntity {
  type: 'duct';
  points: Vec2[];
  width: number; height: number;
  system: string; // 'supply' | 'return' | 'exhaust' | 'fresh_air'
}

export interface ConduitEntity extends BaseEntity {
  type: 'conduit';
  points: Vec2[];
  diameter: number;
  conduitType: string; // 'emt' | 'rigid' | 'flex' | 'pvc'
}

export interface CableTrayEntity extends BaseEntity {
  type: 'cable_tray';
  points: Vec2[];
  width: number; height: number;
  trayType: string; // 'ladder' | 'solid' | 'channel' | 'wire_mesh'
}

export interface MEPDeviceEntity extends BaseEntity {
  type: 'sprinkler' | 'diffuser' | 'outlet' | 'switch_mep' | 'panel_board' | 'transformer' | 'valve' | 'pump';
  x: number; y: number;
  rotation: number;
  model?: string;
  rating?: string;
}

// ─── Site entities ───────────────────────────────────────────────────────────
export interface ContourEntity extends BaseEntity {
  type: 'contour';
  points: Vec2[];
  elevation: number;
  isMajor: boolean;
}

export interface GradingEntity extends BaseEntity {
  type: 'grading';
  points: Vec2[];
  fromElevation: number;
  toElevation: number;
  slope: number;
}

export interface PavingEntity extends BaseEntity {
  type: 'paving';
  points: Vec2[];
  material: string; // 'asphalt' | 'concrete' | 'brick' | 'gravel' | 'stone'
  thickness: number;
}

export interface LandscapeEntity extends BaseEntity {
  type: 'landscape';
  x: number; y: number;
  radius: number;
  plantType: string; // 'tree' | 'shrub' | 'groundcover' | 'flower'
  species?: string;
}

export interface FenceSiteEntity extends BaseEntity {
  type: 'fence_site';
  points: Vec2[];
  height: number;
  fenceType: string; // 'chain_link' | 'wood' | 'metal' | 'privacy' | 'picket'
}

export interface ParkingEntity extends BaseEntity {
  type: 'parking';
  x: number; y: number;
  width: number; depth: number;
  rotation: number;
  spaces: number;
  parkingType: string; // 'standard' | 'compact' | 'accessible' | 'ev'
}

// ─── Additional Annotation entities ──────────────────────────────────────────
export interface SectionMarkEntity extends BaseEntity {
  type: 'section_mark';
  x: number; y: number;
  rotation: number;
  sectionId: string;
  sheetRef?: string;
}

export interface DetailMarkEntity extends BaseEntity {
  type: 'detail_mark';
  x: number; y: number;
  radius: number;
  detailId: string;
  sheetRef?: string;
}

export interface ElevationMarkEntity extends BaseEntity {
  type: 'elevation_mark';
  x: number; y: number;
  elevation: number;
  direction: number; // angle in radians
}

export interface GridBubbleEntity extends BaseEntity {
  type: 'grid_bubble';
  x: number; y: number;
  label: string;
  direction: 'horizontal' | 'vertical';
  length: number;
}

export interface TagEntity extends BaseEntity {
  type: 'tag';
  x: number; y: number;
  text: string;
  tagType: string; // 'room' | 'door' | 'window' | 'wall' | 'equipment'
  linkedEntityId?: string;
}

export interface KeynoteEntity extends BaseEntity {
  type: 'keynote';
  x: number; y: number;
  leaderPoints: Vec2[];
  keynoteId: string;
  text: string;
}

export interface RevisionTagEntity extends BaseEntity {
  type: 'revision_tag';
  x: number; y: number;
  revisionNumber: string;
  date: string;
  description: string;
}

export interface GradientEntity extends BaseEntity {
  type: 'gradient';
  boundary: Vec2[];
  color1: string;
  color2: string;
  angle: number;
  gradientType: 'linear' | 'radial';
}

// ─── Union of all concrete entity types ──────────────────────────────────────
export type AnyEntity =
  | PointEntity | LineEntity | PolylineEntity
  | CircleEntity | ArcEntity | EllipseEntity | SplineEntity
  | RectangleEntity | PolygonEntity | HatchEntity | GradientEntity
  | XLineEntity | RayEntity | MLineEntity | DonutEntity
  | RevCloudEntity | WipeoutEntity | RegionEntity
  | WallEntity | DoorEntity | WindowEntity | ColumnEntity | BeamEntity
  | SlabEntity | RoofEntity | StairEntity | RampEntity | RoomEntity | ZoneEntity
  | CurtainWallEntity | RailingEntity | CeilingEntity
  | FurnitureEntity | ApplianceEntity | FixtureEntity
  | StructuralMemberEntity | FootingEntity | PileEntity | RetainingWallEntity
  | OpeningEntity | NicheEntity | ShaftEntity | ElevatorEntity
  | PipeEntity | DuctEntity | ConduitEntity | CableTrayEntity | MEPDeviceEntity
  | ContourEntity | GradingEntity | PavingEntity | LandscapeEntity
  | FenceSiteEntity | ParkingEntity
  | TextEntity | MTextEntity | DimensionEntity | LeaderEntity
  | MultiLeaderEntity | TableEntity | ToleranceEntity
  | SectionMarkEntity | DetailMarkEntity | ElevationMarkEntity
  | GridBubbleEntity | TagEntity | KeynoteEntity | RevisionTagEntity
  | BlockRefEntity | ImageEntity;

// ─── Block definition ────────────────────────────────────────────────────────
export interface BlockDef {
  name: string;
  basePoint: Vec2;
  entities: AnyEntity[];
  description?: string;
}

// ─── Layer ───────────────────────────────────────────────────────────────────
export interface Layer {
  name: string;
  color: string;
  visible: boolean;
  locked: boolean;
  lineweight: number;
  linetype: Linetype;
  printable?: boolean;
  description?: string;
}

// ─── Floor plan ──────────────────────────────────────────────────────────────
export interface FloorPlan {
  id: string;
  name: string;
  level: number;
  elevation: number;
  floorHeight: number;
  entities: AnyEntity[];
}

// ─── Sheet / Drawing layout (see expanded Paper Space section below) ─────────
export interface SheetViewport {
  id: string;
  x: number; y: number;
  width: number; height: number;
  scale: number;
  floorId?: string;
  viewType: 'plan' | 'section' | 'elevation' | 'detail' | '3d';
}

// ─── Undo/Redo history entry ─────────────────────────────────────────────────
export interface HistoryEntry {
  timestamp: number;
  description: string;
  entities: AnyEntity[];
}

// ─── Top-level project ───────────────────────────────────────────────────────
export interface ADFProject {
  version: string;
  projectName: string;
  location: string;
  buildingType: string;
  author: string;
  createdAt: string;
  modifiedAt: string;
  floors: FloorPlan[];
  sheets: Sheet[];
  layers: Layer[];
  blocks: BlockDef[];
  buildingCodes?: Record<string, unknown>;
  generatedFromPrompt?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Factory helpers
// ═══════════════════════════════════════════════════════════════════════════════

export function uid(): string {
  return crypto.randomUUID().slice(0, 8);
}

export function createProject(name = 'New Project'): ADFProject {
  return {
    version: '1.0',
    projectName: name,
    location: '',
    buildingType: 'residential',
    author: '',
    createdAt: new Date().toISOString(),
    modifiedAt: new Date().toISOString(),
    floors: [createFloor(0, 'Ground Floor', 0, 3000)],
    sheets: [],
    layers: defaultLayers(),
    blocks: [],
  };
}

export function createFloor(
  level: number, name: string, elevation: number, height: number
): FloorPlan {
  return {
    id: crypto.randomUUID(),
    name, level, elevation,
    floorHeight: height,
    entities: [],
  };
}

export function defaultLayers(): Layer[] {
  return [
    { name: 'Walls',       color: '#e6edf3', visible: true,  locked: false, lineweight: 0.5,  linetype: 'continuous' },
    { name: 'Doors',       color: '#4a9eff', visible: true,  locked: false, lineweight: 0.25, linetype: 'continuous' },
    { name: 'Windows',     color: '#7dd3fc', visible: true,  locked: false, lineweight: 0.25, linetype: 'continuous' },
    { name: 'Columns',     color: '#a78bfa', visible: true,  locked: false, lineweight: 0.35, linetype: 'continuous' },
    { name: 'Beams',       color: '#818cf8', visible: true,  locked: false, lineweight: 0.35, linetype: 'continuous' },
    { name: 'Slabs',       color: '#64748b', visible: true,  locked: false, lineweight: 0.25, linetype: 'continuous' },
    { name: 'Roof',        color: '#f472b6', visible: true,  locked: false, lineweight: 0.25, linetype: 'continuous' },
    { name: 'Stairs',      color: '#fb923c', visible: true,  locked: false, lineweight: 0.25, linetype: 'continuous' },
    { name: 'Furniture',   color: '#a3a3a3', visible: true,  locked: false, lineweight: 0.18, linetype: 'continuous' },
    { name: 'Annotation',  color: '#94a3b8', visible: true,  locked: false, lineweight: 0.18, linetype: 'continuous' },
    { name: 'Dimensions',  color: '#64748b', visible: true,  locked: false, lineweight: 0.18, linetype: 'continuous' },
    { name: 'Hatch',       color: '#374151', visible: true,  locked: false, lineweight: 0.13, linetype: 'continuous' },
    { name: 'Grid',        color: '#1d4ed8', visible: false, locked: true,  lineweight: 0.1,  linetype: 'continuous' },
    { name: 'Construction',color: '#6b7280', visible: true,  locked: false, lineweight: 0.09, linetype: 'dashed' },
    { name: 'CenterLine',  color: '#ef4444', visible: true,  locked: false, lineweight: 0.09, linetype: 'center' },
    { name: 'Hidden',      color: '#6366f1', visible: true,  locked: false, lineweight: 0.18, linetype: 'hidden' },
    { name: 'Electrical',  color: '#fbbf24', visible: true,  locked: false, lineweight: 0.25, linetype: 'continuous' },
    { name: 'Plumbing',    color: '#22d3ee', visible: true,  locked: false, lineweight: 0.25, linetype: 'continuous' },
    { name: 'HVAC',        color: '#a3e635', visible: true,  locked: false, lineweight: 0.25, linetype: 'continuous' },
    { name: 'Fire',        color: '#f87171', visible: true,  locked: false, lineweight: 0.25, linetype: 'continuous' },
    { name: 'Railing',     color: '#c084fc', visible: true,  locked: false, lineweight: 0.25, linetype: 'continuous' },
    { name: 'Ceiling',     color: '#d4d4d8', visible: true,  locked: false, lineweight: 0.18, linetype: 'dashdot' },
    { name: 'Defpoints',   color: '#525252', visible: true,  locked: false, lineweight: 0.05, linetype: 'continuous' },
    { name: '0',           color: '#ffffff', visible: true,  locked: false, lineweight: 0.25, linetype: 'continuous' },
    // MEP layers
    { name: 'Pipe-Supply',     color: '#3b82f6', visible: true, locked: false, lineweight: 0.25, linetype: 'continuous' },
    { name: 'Pipe-Drain',      color: '#059669', visible: true, locked: false, lineweight: 0.25, linetype: 'continuous' },
    { name: 'Pipe-Gas',        color: '#eab308', visible: true, locked: false, lineweight: 0.25, linetype: 'dashed' },
    { name: 'Duct-Supply',     color: '#2563eb', visible: true, locked: false, lineweight: 0.35, linetype: 'continuous' },
    { name: 'Duct-Return',     color: '#dc2626', visible: true, locked: false, lineweight: 0.35, linetype: 'continuous' },
    { name: 'Conduit',         color: '#f59e0b', visible: true, locked: false, lineweight: 0.18, linetype: 'continuous' },
    { name: 'CableTray',       color: '#d97706', visible: true, locked: false, lineweight: 0.25, linetype: 'continuous' },
    // Site layers
    { name: 'Contours',        color: '#84cc16', visible: true, locked: false, lineweight: 0.13, linetype: 'continuous' },
    { name: 'Grading',         color: '#65a30d', visible: true, locked: false, lineweight: 0.18, linetype: 'continuous' },
    { name: 'Paving',          color: '#78716c', visible: true, locked: false, lineweight: 0.25, linetype: 'continuous' },
    { name: 'Landscape',       color: '#22c55e', visible: true, locked: false, lineweight: 0.18, linetype: 'continuous' },
    { name: 'Fencing',         color: '#a8a29e', visible: true, locked: false, lineweight: 0.18, linetype: 'dashed' },
    { name: 'Parking',         color: '#737373', visible: true, locked: false, lineweight: 0.25, linetype: 'continuous' },
    // Structural layers
    { name: 'Structural',      color: '#7c3aed', visible: true, locked: false, lineweight: 0.35, linetype: 'continuous' },
    { name: 'Foundation',      color: '#6d28d9', visible: true, locked: false, lineweight: 0.35, linetype: 'continuous' },
    // Misc
    { name: 'Sections',        color: '#be123c', visible: true, locked: false, lineweight: 0.25, linetype: 'center' },
    { name: 'Details',         color: '#be123c', visible: true, locked: false, lineweight: 0.18, linetype: 'continuous' },
    { name: 'Revisions',       color: '#ea580c', visible: true, locked: false, lineweight: 0.25, linetype: 'dashdot' },
  ];
}

// ─── Geometry utility helpers ────────────────────────────────────────────────

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function midpoint(a: Vec2, b: Vec2): Vec2 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function angleBetween(a: Vec2, b: Vec2): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

export function rotatePoint(pt: Vec2, angle: number, origin: Vec2 = { x: 0, y: 0 }): Vec2 {
  const dx = pt.x - origin.x, dy = pt.y - origin.y;
  return {
    x: origin.x + dx * Math.cos(angle) - dy * Math.sin(angle),
    y: origin.y + dx * Math.sin(angle) + dy * Math.cos(angle),
  };
}

export function lerp2(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function perpNormal(a: Vec2, b: Vec2): Vec2 {
  const d = dist(a, b);
  if (d === 0) return { x: 0, y: 1 };
  return { x: -(b.y - a.y) / d, y: (b.x - a.x) / d };
}

export function polygonArea(pts: Vec2[]): number {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return area / 2;
}

export function polygonCentroid(pts: Vec2[]): Vec2 {
  const a = polygonArea(pts) * 6;
  if (Math.abs(a) < 1e-10) return pts[0] || { x: 0, y: 0 };
  let cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    const cross = pts[i].x * pts[j].y - pts[j].x * pts[i].y;
    cx += (pts[i].x + pts[j].x) * cross;
    cy += (pts[i].y + pts[j].y) * cross;
  }
  return { x: cx / a, y: cy / a };
}

export function boundingBox(pts: Vec2[]): { min: Vec2; max: Vec2 } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}

export function pointToSegmentDist(pt: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return dist(pt, a);
  let t = ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return dist(pt, { x: a.x + t * dx, y: a.y + t * dy });
}

export function entityVertices(e: AnyEntity): Vec2[] {
  switch (e.type) {
    case 'point': return [{ x: (e as PointEntity).x, y: (e as PointEntity).y }];
    case 'line': { const l = e as LineEntity; return [{ x: l.x1, y: l.y1 }, { x: l.x2, y: l.y2 }]; }
    case 'wall': { const w = e as WallEntity; return [{ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }]; }
    case 'rectangle': { const r = e as RectangleEntity; return [{ x: r.x1, y: r.y1 }, { x: r.x2, y: r.y1 }, { x: r.x2, y: r.y2 }, { x: r.x1, y: r.y2 }]; }
    case 'circle': { const c = e as CircleEntity; return [{ x: c.cx, y: c.cy }, { x: c.cx + c.radius, y: c.cy }, { x: c.cx - c.radius, y: c.cy }, { x: c.cx, y: c.cy + c.radius }, { x: c.cx, y: c.cy - c.radius }]; }
    case 'arc': { const a = e as ArcEntity; return [{ x: a.cx, y: a.cy }, { x: a.cx + a.radius * Math.cos(a.startAngle), y: a.cy + a.radius * Math.sin(a.startAngle) }, { x: a.cx + a.radius * Math.cos(a.endAngle), y: a.cy + a.radius * Math.sin(a.endAngle) }]; }
    case 'polyline': return (e as PolylineEntity).points;
    case 'polygon': { const pg = e as PolygonEntity; return Array.from({ length: pg.sides }, (_, i) => { const a = pg.rotation + (2 * Math.PI * i) / pg.sides; return { x: pg.cx + pg.radius * Math.cos(a), y: pg.cy + pg.radius * Math.sin(a) }; }); }
    case 'ellipse': { const el = e as EllipseEntity; return [{ x: el.cx, y: el.cy }]; }
    case 'spline': return (e as SplineEntity).controlPoints;
    case 'hatch': return (e as HatchEntity).boundary;
    case 'door': { const d = e as DoorEntity; return [{ x: d.x, y: d.y }]; }
    case 'window': { const w = e as WindowEntity; return [{ x: w.x, y: w.y }]; }
    case 'column': { const c = e as ColumnEntity; return [{ x: c.x, y: c.y }]; }
    case 'beam': { const b = e as BeamEntity; return [{ x: b.x1, y: b.y1 }, { x: b.x2, y: b.y2 }]; }
    case 'slab': return (e as SlabEntity).points;
    case 'roof': return (e as RoofEntity).points;
    case 'stair': { const s = e as StairEntity; return [{ x: s.x, y: s.y }]; }
    case 'ramp': { const r = e as RampEntity; return [{ x: r.x, y: r.y }]; }
    case 'room': return (e as RoomEntity).points;
    case 'curtainwall': { const c = e as CurtainWallEntity; return [{ x: c.x1, y: c.y1 }, { x: c.x2, y: c.y2 }]; }
    case 'text': { const t = e as TextEntity; return [{ x: t.x, y: t.y }]; }
    case 'mtext': { const m = e as MTextEntity; return [{ x: m.x, y: m.y }]; }
    case 'dimension': { const d = e as DimensionEntity; return [{ x: d.x1, y: d.y1 }, { x: d.x2, y: d.y2 }]; }
    case 'leader': return (e as LeaderEntity).points;
    case 'multileader': { const ml = e as MultiLeaderEntity; return ml.leaders.flat(); }
    case 'table': { const t = e as TableEntity; return [{ x: t.x, y: t.y }]; }
    case 'tolerance': { const tol = e as ToleranceEntity; return [{ x: tol.x, y: tol.y }]; }
    case 'xline': case 'ray': { const xl = e as XLineEntity; return [{ x: xl.x, y: xl.y }]; }
    case 'mline': return (e as MLineEntity).points;
    case 'donut': { const d = e as DonutEntity; return [{ x: d.cx, y: d.cy }]; }
    case 'revcloud': return (e as RevCloudEntity).points;
    case 'wipeout': return (e as WipeoutEntity).points;
    case 'region': return (e as RegionEntity).boundary;
    case 'railing': return (e as RailingEntity).points;
    case 'ceiling': return (e as CeilingEntity).points;
    case 'block_ref': { const b = e as BlockRefEntity; return [{ x: b.x, y: b.y }]; }
    case 'image': { const im = e as ImageEntity; return [{ x: im.x, y: im.y }]; }
    // New Arch entities
    case 'furniture': case 'appliance': case 'fixture': { const f = e as any; return [{ x: f.x, y: f.y }]; }
    case 'structural_member': { const sm = e as any; return [{ x: sm.x1, y: sm.y1 }, { x: sm.x2, y: sm.y2 }]; }
    case 'footing': { const ft = e as any; return [{ x: ft.x, y: ft.y }]; }
    case 'pile': { const pl = e as any; return [{ x: pl.x, y: pl.y }]; }
    case 'retaining_wall': return (e as any).points;
    case 'opening': case 'niche': { const o = e as any; return [{ x: o.x, y: o.y }]; }
    case 'shaft': return (e as any).points;
    case 'elevator': { const el = e as any; return [{ x: el.x, y: el.y }]; }
    // MEP entities
    case 'pipe': case 'duct': case 'conduit': case 'cable_tray': return (e as any).points;
    case 'sprinkler': case 'diffuser': case 'outlet': case 'switch_mep':
    case 'panel_board': case 'transformer': case 'valve': case 'pump': { const d = e as any; return [{ x: d.x, y: d.y }]; }
    // Site entities
    case 'contour': return (e as any).points;
    case 'grading': return (e as any).points;
    case 'paving': return (e as any).points;
    case 'landscape': { const l = e as any; return [{ x: l.x, y: l.y }]; }
    case 'fence_site': return (e as any).points;
    case 'parking': { const p = e as any; return [{ x: p.x, y: p.y }]; }
    // Annotation entities
    case 'gradient': return (e as any).boundary;
    case 'section_mark': case 'detail_mark': case 'elevation_mark':
    case 'grid_bubble': case 'tag': case 'keynote': case 'revision_tag': { const a = e as any; return [{ x: a.x, y: a.y }]; }
    default: return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ADVANCED GEOMETRY ENGINE
//  Professional-grade computational geometry — line intersections, offsets,
//  booleans, fillets, chamfers, trimming, extending, area calculations, etc.
// ═══════════════════════════════════════════════════════════════════════════════

/** Line-line intersection. Returns intersection point or null if parallel. */
export function lineLineIntersect(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): Vec2 | null {
  const d1x = a2.x - a1.x, d1y = a2.y - a1.y;
  const d2x = b2.x - b1.x, d2y = b2.y - b1.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-10) return null;
  const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / denom;
  return { x: a1.x + t * d1x, y: a1.y + t * d1y };
}

/** Segment-segment intersection. Returns point only if it lies on both segments. */
export function segSegIntersect(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): Vec2 | null {
  const d1x = a2.x - a1.x, d1y = a2.y - a1.y;
  const d2x = b2.x - b1.x, d2y = b2.y - b1.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-10) return null;
  const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / denom;
  const u = ((b1.x - a1.x) * d1y - (b1.y - a1.y) * d1x) / denom;
  if (t < -1e-10 || t > 1 + 1e-10 || u < -1e-10 || u > 1 + 1e-10) return null;
  return { x: a1.x + t * d1x, y: a1.y + t * d1y };
}

/** Circle-line intersection points (0, 1, or 2). */
export function circleLineIntersect(cx: number, cy: number, r: number, p1: Vec2, p2: Vec2): Vec2[] {
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const fx = p1.x - cx, fy = p1.y - cy;
  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  let disc = b * b - 4 * a * c;
  if (disc < -1e-10) return [];
  disc = Math.max(0, disc);
  const sq = Math.sqrt(disc);
  const pts: Vec2[] = [];
  for (const sign of [-1, 1]) {
    const t = (-b + sign * sq) / (2 * a);
    if (t >= -1e-10 && t <= 1 + 1e-10) {
      pts.push({ x: p1.x + t * dx, y: p1.y + t * dy });
    }
  }
  return pts;
}

/** Circle-circle intersection points (0, 1, or 2). */
export function circleCircleIntersect(c1x: number, c1y: number, r1: number, c2x: number, c2y: number, r2: number): Vec2[] {
  const dx = c2x - c1x, dy = c2y - c1y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > r1 + r2 + 1e-10 || d < Math.abs(r1 - r2) - 1e-10 || d < 1e-10) return [];
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const mx = c1x + a * dx / d, my = c1y + a * dy / d;
  if (h < 1e-10) return [{ x: mx, y: my }];
  return [
    { x: mx + h * dy / d, y: my - h * dx / d },
    { x: mx - h * dy / d, y: my + h * dx / d },
  ];
}

/** Offset a polyline by distance (positive = left of travel). */
export function offsetPolyline(pts: Vec2[], dist: number): Vec2[] {
  if (pts.length < 2) return pts;
  const result: Vec2[] = [];
  const segments: { nx: number; ny: number; p1: Vec2; p2: Vec2 }[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x;
    const dy = pts[i + 1].y - pts[i].y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-10) continue;
    const nx = -dy / len, ny = dx / len;
    segments.push({
      nx, ny,
      p1: { x: pts[i].x + nx * dist, y: pts[i].y + ny * dist },
      p2: { x: pts[i + 1].x + nx * dist, y: pts[i + 1].y + ny * dist },
    });
  }
  if (segments.length === 0) return pts;
  result.push(segments[0].p1);
  for (let i = 0; i < segments.length - 1; i++) {
    const ip = lineLineIntersect(segments[i].p1, segments[i].p2, segments[i + 1].p1, segments[i + 1].p2);
    result.push(ip || segments[i].p2);
  }
  result.push(segments[segments.length - 1].p2);
  return result;
}

/** Offset a closed polygon by distance. */
export function offsetPolygon(pts: Vec2[], dist: number): Vec2[] {
  if (pts.length < 3) return pts;
  const closed = [...pts, pts[0]];
  const off = offsetPolyline(closed, dist);
  return off.slice(0, off.length - 1);
}

/** Compute fillet arc between two lines at intersection. Returns arc points. */
export function filletArcPoints(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2, radius: number, segments: number = 16): Vec2[] {
  const ip = lineLineIntersect(a1, a2, b1, b2);
  if (!ip || radius <= 0) return [];
  const angA = Math.atan2(a1.y - ip.y, a1.x - ip.x);
  const angB = Math.atan2(b2.y - ip.y, b2.x - ip.x);
  let startAng = angA, endAng = angB;
  if (endAng < startAng) endAng += 2 * Math.PI;
  const half = (endAng - startAng) / 2;
  const tanDist = radius / Math.tan(half);
  const cx = ip.x + tanDist * Math.cos(startAng) + radius * Math.cos(startAng + Math.PI / 2);
  const cy = ip.y + tanDist * Math.sin(startAng) + radius * Math.sin(startAng + Math.PI / 2);
  const result: Vec2[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const ang = startAng + Math.PI / 2 + t * (Math.PI - 2 * half);
    result.push({ x: cx + radius * Math.cos(ang), y: cy + radius * Math.sin(ang) });
  }
  return result;
}

/** Perimeter of polygon. */
export function polygonPerimeter(pts: Vec2[]): number {
  let perim = 0;
  for (let i = 0; i < pts.length; i++) {
    perim += dist(pts[i], pts[(i + 1) % pts.length]);
  }
  return perim;
}

/** Point-in-polygon test (ray casting). */
export function pointInPolygon(pt: Vec2, polygon: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    if (((yi > pt.y) !== (yj > pt.y)) &&
        (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

/** Closest point on a line segment to a given point. */
export function closestPointOnSegment(pt: Vec2, a: Vec2, b: Vec2): Vec2 {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return a;
  let t = ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + t * dx, y: a.y + t * dy };
}

/** Closest point on a circle to a given point. */
export function closestPointOnCircle(pt: Vec2, cx: number, cy: number, r: number): Vec2 {
  const ang = Math.atan2(pt.y - cy, pt.x - cx);
  return { x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang) };
}

/** Perpendicular foot from point to infinite line through a and b. */
export function perpendicularFoot(pt: Vec2, a: Vec2, b: Vec2): Vec2 {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return a;
  const t = ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / lenSq;
  return { x: a.x + t * dx, y: a.y + t * dy };
}

/** Tangent points from external point to circle. Returns 0 or 2 points. */
export function tangentPointsFromExternal(pt: Vec2, cx: number, cy: number, r: number): Vec2[] {
  const dx = pt.x - cx, dy = pt.y - cy;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d <= r + 1e-10) return [];
  const a = Math.acos(r / d);
  const baseAng = Math.atan2(dy, dx);
  return [
    { x: cx + r * Math.cos(baseAng + a), y: cy + r * Math.sin(baseAng + a) },
    { x: cx + r * Math.cos(baseAng - a), y: cy + r * Math.sin(baseAng - a) },
  ];
}

/** Normalize angle to [0, 2π). */
export function normalizeAngle(a: number): number {
  a = a % (2 * Math.PI);
  return a < 0 ? a + 2 * Math.PI : a;
}

/** Check if angle is within arc (startAngle → endAngle, CCW). */
export function angleInArc(angle: number, start: number, end: number): boolean {
  angle = normalizeAngle(angle);
  start = normalizeAngle(start);
  end = normalizeAngle(end);
  return start <= end
    ? angle >= start && angle <= end
    : angle >= start || angle <= end;
}

/** Arc length. */
export function arcLength(radius: number, startAngle: number, endAngle: number): number {
  let sweep = normalizeAngle(endAngle - startAngle);
  if (sweep === 0) sweep = 2 * Math.PI;
  return radius * sweep;
}

/** Point on arc at parameter t ∈ [0,1]. */
export function pointOnArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number, t: number): Vec2 {
  let sweep = normalizeAngle(endAngle - startAngle);
  if (sweep === 0) sweep = 2 * Math.PI;
  const ang = startAngle + t * sweep;
  return { x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang) };
}

/** Divide a segment into N equal parts. Returns N-1 division points. */
export function divideSegment(a: Vec2, b: Vec2, n: number): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 1; i < n; i++) {
    const t = i / n;
    pts.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
  }
  return pts;
}

/** Measure points along a polyline at equal spacing (like AutoCAD MEASURE). */
export function measureAlongPolyline(pts: Vec2[], spacing: number): Vec2[] {
  const result: Vec2[] = [];
  let carry = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const segLen = dist(pts[i], pts[i + 1]);
    let pos = spacing - carry;
    while (pos <= segLen + 1e-10) {
      const t = pos / segLen;
      result.push(lerp2(pts[i], pts[i + 1], t));
      pos += spacing;
    }
    carry = segLen - (pos - spacing);
  }
  return result;
}

/** Polyline total length. */
export function polylineLength(pts: Vec2[]): number {
  let len = 0;
  for (let i = 0; i < pts.length - 1; i++) len += dist(pts[i], pts[i + 1]);
  return len;
}

/** Point on polyline at parameter t ∈ [0,1]. */
export function pointOnPolyline(pts: Vec2[], t: number): Vec2 {
  const totalLen = polylineLength(pts);
  let target = t * totalLen;
  for (let i = 0; i < pts.length - 1; i++) {
    const segLen = dist(pts[i], pts[i + 1]);
    if (target <= segLen) {
      return lerp2(pts[i], pts[i + 1], segLen > 0 ? target / segLen : 0);
    }
    target -= segLen;
  }
  return pts[pts.length - 1];
}

/** Convex hull of points (Graham scan). */
export function convexHull(points: Vec2[]): Vec2[] {
  if (points.length < 3) return [...points];
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Vec2, a: Vec2, b: Vec2) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Vec2[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Vec2[] = [];
  for (const p of sorted.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** Douglas-Peucker polyline simplification. */
export function simplifyPolyline(pts: Vec2[], tolerance: number): Vec2[] {
  if (pts.length <= 2) return pts;
  let maxDist = 0, maxIdx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = pointToSegmentDist(pts[i], pts[0], pts[pts.length - 1]);
    if (d > maxDist) { maxDist = d; maxIdx = i; }
  }
  if (maxDist > tolerance) {
    const left = simplifyPolyline(pts.slice(0, maxIdx + 1), tolerance);
    const right = simplifyPolyline(pts.slice(maxIdx), tolerance);
    return left.slice(0, -1).concat(right);
  }
  return [pts[0], pts[pts.length - 1]];
}

/** Smooth polyline using Chaikin's corner-cutting algorithm. */
export function smoothPolyline(pts: Vec2[], iterations: number = 2): Vec2[] {
  let current = [...pts];
  for (let iter = 0; iter < iterations; iter++) {
    const next: Vec2[] = [current[0]];
    for (let i = 0; i < current.length - 1; i++) {
      next.push(lerp2(current[i], current[i + 1], 0.25));
      next.push(lerp2(current[i], current[i + 1], 0.75));
    }
    next.push(current[current.length - 1]);
    current = next;
  }
  return current;
}

/** Transform: translate. */
export function translatePts(pts: Vec2[], dx: number, dy: number): Vec2[] {
  return pts.map(p => ({ x: p.x + dx, y: p.y + dy }));
}

/** Transform: scale around origin. */
export function scalePts(pts: Vec2[], sx: number, sy: number, origin: Vec2 = { x: 0, y: 0 }): Vec2[] {
  return pts.map(p => ({
    x: origin.x + (p.x - origin.x) * sx,
    y: origin.y + (p.y - origin.y) * sy,
  }));
}

/** Transform: rotate around origin. */
export function rotatePts(pts: Vec2[], angle: number, origin: Vec2 = { x: 0, y: 0 }): Vec2[] {
  return pts.map(p => rotatePoint(p, angle, origin));
}

/** Transform: mirror across a line. */
export function mirrorPts(pts: Vec2[], lineA: Vec2, lineB: Vec2): Vec2[] {
  const dx = lineB.x - lineA.x, dy = lineB.y - lineA.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return pts;
  return pts.map(p => {
    const t = ((p.x - lineA.x) * dx + (p.y - lineA.y) * dy) / lenSq;
    const foot = { x: lineA.x + t * dx, y: lineA.y + t * dy };
    return { x: 2 * foot.x - p.x, y: 2 * foot.y - p.y };
  });
}

/** Polar array: duplicate points around a center. */
export function polarArrayPts(pts: Vec2[], center: Vec2, count: number, totalAngle: number = 2 * Math.PI): Vec2[][] {
  const result: Vec2[][] = [];
  for (let i = 0; i < count; i++) {
    const ang = (totalAngle * i) / count;
    result.push(rotatePts(pts, ang, center));
  }
  return result;
}

/** Rectangular array: duplicate points in a grid. */
export function rectArrayPts(pts: Vec2[], rows: number, cols: number, rowSpacing: number, colSpacing: number): Vec2[][] {
  const result: Vec2[][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      result.push(translatePts(pts, c * colSpacing, r * rowSpacing));
    }
  }
  return result;
}

/** Cubic Bezier point at parameter t. */
export function cubicBezier(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const mt = 1 - t;
  return {
    x: mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
    y: mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y,
  };
}

/** Sample cubic Bezier curve into polyline. */
export function sampleBezier(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, segments: number = 32): Vec2[] {
  return Array.from({ length: segments + 1 }, (_, i) => cubicBezier(p0, p1, p2, p3, i / segments));
}

/** Sample B-spline (centripetal Catmull-Rom) from control points. */
export function sampleCatmullRom(pts: Vec2[], segments: number = 8): Vec2[] {
  if (pts.length < 2) return pts;
  const result: Vec2[] = [];
  const extended = [pts[0], ...pts, pts[pts.length - 1]];
  for (let i = 1; i < extended.length - 2; i++) {
    const p0 = extended[i - 1], p1 = extended[i], p2 = extended[i + 1], p3 = extended[i + 2];
    for (let j = 0; j < segments; j++) {
      const t = j / segments;
      const t2 = t * t, t3 = t2 * t;
      result.push({
        x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  result.push(pts[pts.length - 1]);
  return result;
}

/** Ellipse point at parameter t (angle). */
export function pointOnEllipse(cx: number, cy: number, rx: number, ry: number, rotation: number, t: number): Vec2 {
  const cos = Math.cos(rotation), sin = Math.sin(rotation);
  const ex = rx * Math.cos(t), ey = ry * Math.sin(t);
  return { x: cx + ex * cos - ey * sin, y: cy + ex * sin + ey * cos };
}

/** Sample ellipse arc into polyline. */
export function sampleEllipseArc(cx: number, cy: number, rx: number, ry: number, rotation: number, start: number, end: number, segments: number = 64): Vec2[] {
  const result: Vec2[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = start + (end - start) * (i / segments);
    result.push(pointOnEllipse(cx, cy, rx, ry, rotation, t));
  }
  return result;
}

/** Boolean: union of two simple polygons (shoelace merging — approximate). */
export function polygonUnion(a: Vec2[], b: Vec2[]): Vec2[] {
  return convexHull([...a, ...b]); // convex hull approximation; exact would use Weiler-Atherton
}

/** Boolean: intersection area approximate (returns convex hull of overlapping points). */
export function polygonIntersection(a: Vec2[], b: Vec2[]): Vec2[] {
  const inside: Vec2[] = [];
  for (const p of a) if (pointInPolygon(p, b)) inside.push(p);
  for (const p of b) if (pointInPolygon(p, a)) inside.push(p);
  // Add clip intersection points
  for (let i = 0; i < a.length; i++) {
    const a1 = a[i], a2 = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      const ip = segSegIntersect(a1, a2, b[j], b[(j + 1) % b.length]);
      if (ip) inside.push(ip);
    }
  }
  return inside.length >= 3 ? convexHull(inside) : [];
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PAPER SPACE / SHEET LAYOUT DATA MODEL
// ═══════════════════════════════════════════════════════════════════════════════

export interface Viewport {
  id: string;
  x: number; y: number;     // position on sheet (mm)
  width: number; height: number;
  centerX: number; centerY: number; // model-space center
  scale: number;             // 1:100 = 0.01
  locked: boolean;
  layerOverrides?: Record<string, { visible?: boolean; color?: string }>;
}

export interface TitleBlock {
  template: string;          // 'A4' | 'A3' | 'A2' | 'A1' | 'A0' | 'ARCH-D' | 'ANSI-A' etc.
  width: number; height: number;
  projectName: string;
  drawnBy: string;
  checkedBy: string;
  date: string;
  revision: string;
  sheetNumber: string;
  sheetTitle: string;
  scale: string;
  customFields?: Record<string, string>;
}

export interface Sheet {
  id: string;
  name: string;
  titleBlock: TitleBlock;
  viewports: Viewport[];
  annotations: AnyEntity[];   // text, dimensions, etc. in paper-space
}

export const PAPER_SIZES: Record<string, { width: number; height: number }> = {
  'A4':     { width: 297,  height: 210 },
  'A3':     { width: 420,  height: 297 },
  'A2':     { width: 594,  height: 420 },
  'A1':     { width: 841,  height: 594 },
  'A0':     { width: 1189, height: 841 },
  'ARCH-A': { width: 304.8, height: 228.6 },
  'ARCH-B': { width: 457.2, height: 304.8 },
  'ARCH-C': { width: 609.6, height: 457.2 },
  'ARCH-D': { width: 914.4, height: 609.6 },
  'ARCH-E': { width: 1219.2, height: 914.4 },
  'ANSI-A': { width: 279.4, height: 215.9 },
  'ANSI-B': { width: 431.8, height: 279.4 },
  'ANSI-C': { width: 558.8, height: 431.8 },
  'ANSI-D': { width: 863.6, height: 558.8 },
};

// ═══════════════════════════════════════════════════════════════════════════════
//  DIMENSION STYLES
// ═══════════════════════════════════════════════════════════════════════════════

export interface DimStyle {
  name: string;
  textHeight: number;
  arrowSize: number;
  extensionLineOffset: number;
  extensionLineExtend: number;
  dimLineGap: number;
  arrowType: 'closed' | 'open' | 'dot' | 'tick' | 'none';
  textColor: string;
  lineColor: string;
  precision: number;         // decimal places
  prefix: string;
  suffix: string;
  scaleFactor: number;       // multiply measured value
  suppressLeadingZeros: boolean;
  suppressTrailingZeros: boolean;
  textPosition: 'above' | 'center' | 'inline';
  unitFormat: 'decimal' | 'architectural' | 'engineering' | 'fractional';
}

export const defaultDimStyles: DimStyle[] = [
  {
    name: 'Standard',
    textHeight: 2.5, arrowSize: 2.5, extensionLineOffset: 1.25, extensionLineExtend: 1.25,
    dimLineGap: 0.625, arrowType: 'closed', textColor: '#ffffff', lineColor: '#ffffff',
    precision: 2, prefix: '', suffix: '', scaleFactor: 1, suppressLeadingZeros: false,
    suppressTrailingZeros: true, textPosition: 'above', unitFormat: 'decimal',
  },
  {
    name: 'Architectural',
    textHeight: 3.0, arrowSize: 3.0, extensionLineOffset: 1.5, extensionLineExtend: 1.5,
    dimLineGap: 1.0, arrowType: 'tick', textColor: '#ffffff', lineColor: '#ffffff',
    precision: 0, prefix: '', suffix: '', scaleFactor: 1, suppressLeadingZeros: true,
    suppressTrailingZeros: true, textPosition: 'above', unitFormat: 'architectural',
  },
  {
    name: 'Metric',
    textHeight: 2.5, arrowSize: 2.0, extensionLineOffset: 1.0, extensionLineExtend: 2.0,
    dimLineGap: 0.5, arrowType: 'closed', textColor: '#ffffff', lineColor: '#ffffff',
    precision: 1, prefix: '', suffix: ' mm', scaleFactor: 1, suppressLeadingZeros: false,
    suppressTrailingZeros: false, textPosition: 'center', unitFormat: 'decimal',
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
//  TEXT STYLES
// ═══════════════════════════════════════════════════════════════════════════════

export interface TextStyle {
  name: string;
  fontFamily: string;
  height: number;
  widthFactor: number;
  obliquingAngle: number;    // degrees
  bold: boolean;
  italic: boolean;
}

export const defaultTextStyles: TextStyle[] = [
  { name: 'Standard', fontFamily: 'Arial', height: 2.5, widthFactor: 1.0, obliquingAngle: 0, bold: false, italic: false },
  { name: 'Title', fontFamily: 'Arial', height: 5.0, widthFactor: 1.0, obliquingAngle: 0, bold: true, italic: false },
  { name: 'Notes', fontFamily: 'Arial', height: 2.0, widthFactor: 1.0, obliquingAngle: 0, bold: false, italic: false },
  { name: 'Annotative', fontFamily: 'Helvetica', height: 2.5, widthFactor: 1.0, obliquingAngle: 0, bold: false, italic: false },
  { name: 'Architectural', fontFamily: 'Courier New', height: 3.0, widthFactor: 0.9, obliquingAngle: 0, bold: false, italic: false },
];

// ═══════════════════════════════════════════════════════════════════════════════
//  HATCH PATTERNS  
// ═══════════════════════════════════════════════════════════════════════════════

export interface HatchPattern {
  name: string;
  description: string;
  type: 'predefined' | 'user' | 'custom';
}

export const defaultHatchPatterns: HatchPattern[] = [
  { name: 'ANSI31', description: 'ANSI Iron, Brick, Stone masonry', type: 'predefined' },
  { name: 'ANSI32', description: 'ANSI Steel', type: 'predefined' },
  { name: 'ANSI33', description: 'ANSI Bronze, Brass, Copper', type: 'predefined' },
  { name: 'ANSI34', description: 'ANSI Plastic, Rubber', type: 'predefined' },
  { name: 'ANSI35', description: 'ANSI Fire brick, Refractory material', type: 'predefined' },
  { name: 'ANSI36', description: 'ANSI Marble, Slate, Glass', type: 'predefined' },
  { name: 'ANSI37', description: 'ANSI Lead, Zinc, Magnesium', type: 'predefined' },
  { name: 'ANSI38', description: 'ANSI Aluminum', type: 'predefined' },
  { name: 'AR-B816', description: 'Block 8x16', type: 'predefined' },
  { name: 'AR-B816C', description: 'Block 8x16 with mortar', type: 'predefined' },
  { name: 'AR-B88', description: 'Block 8x8', type: 'predefined' },
  { name: 'AR-BRELM', description: 'Brick elevation', type: 'predefined' },
  { name: 'AR-BRSTD', description: 'Brick standard', type: 'predefined' },
  { name: 'AR-CONC', description: 'Random dot and stone pattern', type: 'predefined' },
  { name: 'AR-HBONE', description: 'Herringbone pattern', type: 'predefined' },
  { name: 'AR-PARQ1', description: 'Parquet flooring 12x12', type: 'predefined' },
  { name: 'AR-RROOF', description: 'Roof shingles', type: 'predefined' },
  { name: 'AR-RSHKE', description: 'Roof wood shakes', type: 'predefined' },
  { name: 'AR-SAND', description: 'Sand', type: 'predefined' },
  { name: 'BRICK', description: 'Brick or masonry-type surface', type: 'predefined' },
  { name: 'CONCRETE', description: 'Concrete', type: 'predefined' },
  { name: 'CROSS', description: 'Cross pattern', type: 'predefined' },
  { name: 'DASH', description: 'Dashed lines', type: 'predefined' },
  { name: 'DOTS', description: 'Dot pattern', type: 'predefined' },
  { name: 'EARTH', description: 'Earth or ground', type: 'predefined' },
  { name: 'GRASS', description: 'Grass area', type: 'predefined' },
  { name: 'GRAVEL', description: 'Gravel pattern', type: 'predefined' },
  { name: 'HEX', description: 'Hexagon pattern', type: 'predefined' },
  { name: 'HONEY', description: 'Honeycomb pattern', type: 'predefined' },
  { name: 'INSUL', description: 'Insulation', type: 'predefined' },
  { name: 'LINE', description: 'Parallel lines', type: 'predefined' },
  { name: 'MUDST', description: 'Mudstone', type: 'predefined' },
  { name: 'SOLID', description: 'Solid fill', type: 'predefined' },
  { name: 'STEEL', description: 'Steel section', type: 'predefined' },
  { name: 'SWAMP', description: 'Swamp area', type: 'predefined' },
  { name: 'TRIANG', description: 'Triangle pattern', type: 'predefined' },
  { name: 'ZIGZAG', description: 'Zigzag pattern', type: 'predefined' },
];

// ═══════════════════════════════════════════════════════════════════════════════
//  LINETYPE DEFINITIONS (Extended)
// ═══════════════════════════════════════════════════════════════════════════════

export interface LinetypeDefinition {
  name: string;
  description: string;
  pattern: number[];   // dash-gap pattern in mm (positive=dash, negative=gap, 0=dot)
}

export const defaultLinetypes: LinetypeDefinition[] = [
  { name: 'Continuous', description: 'Solid line', pattern: [] },
  { name: 'DASHED', description: 'Dashed __ __ __', pattern: [12, -6] },
  { name: 'DASHDOT', description: 'Dash dot __._._', pattern: [12, -3, 0, -3] },
  { name: 'CENTER', description: 'Center ____ _ ____ _', pattern: [32, -6, 6, -6] },
  { name: 'HIDDEN', description: 'Hidden _ _ _ _', pattern: [6, -3] },
  { name: 'PHANTOM', description: 'Phantom _____ _ _ _____', pattern: [32, -6, 6, -6, 6, -6] },
  { name: 'DOT', description: 'Dot . . . .', pattern: [0, -6] },
  { name: 'BORDER', description: 'Border ____ _ _ ____ _ _', pattern: [12, -6, 12, -6, 0, -6] },
  { name: 'DIVIDE', description: 'Divide ____ . . ____ . .', pattern: [12, -6, 0, -3, 0, -6] },
  { name: 'FENCELINE1', description: 'Fenceline circle ----0----0--', pattern: [6, -2, 0, -2] },
  { name: 'GAS_LINE', description: 'Gas line ----GAS----', pattern: [16, -8] },
  { name: 'HOT_WATER', description: 'Hot water supply ---- HW ----', pattern: [16, -8] },
  { name: 'ZIGZAG', description: 'Zig zag /\\/\\/\\/\\', pattern: [3, -3, 3, -3] },
];

// ═══════════════════════════════════════════════════════════════════════════════
//  COLOUR PALETTE (AutoCAD ACI-like)
// ═══════════════════════════════════════════════════════════════════════════════

export const ACI_COLORS: string[] = [
  '#000000', '#ff0000', '#ffff00', '#00ff00', '#00ffff',
  '#0000ff', '#ff00ff', '#ffffff', '#808080', '#c0c0c0',
  '#ff8080', '#ffb380', '#ffe680', '#b3ff80', '#80ff80',
  '#80ffb3', '#80ffe6', '#80b3ff', '#8080ff', '#b380ff',
  '#e680ff', '#ff80e6', '#ff80b3', '#ff3333', '#ff9933',
];

// ═══════════════════════════════════════════════════════════════════════════════
//  COORDINATE SYSTEM & UCS
// ═══════════════════════════════════════════════════════════════════════════════

export interface UCS {
  name: string;
  origin: Vec3;
  xAxis: Vec3;
  yAxis: Vec3;
  zAxis: Vec3;
}

export const WCS: UCS = {
  name: 'World',
  origin: { x: 0, y: 0, z: 0 },
  xAxis: { x: 1, y: 0, z: 0 },
  yAxis: { x: 0, y: 1, z: 0 },
  zAxis: { x: 0, y: 0, z: 1 },
};
