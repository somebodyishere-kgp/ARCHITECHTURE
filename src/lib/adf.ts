// ADF (ArchFlow Document Format) — Central Data Model
// All geometry lives here; every tab reads from and writes to this model

export interface Vec2 { x: number; y: number; }

export type EntityType = 'wall' | 'line' | 'arc' | 'circle' | 'polyline' |
  'door' | 'window' | 'stair' | 'column' | 'text' | 'dimension' | 'hatch';

export interface BaseEntity {
  id: string;
  type: EntityType;
  layer: string;
  color?: string;        // overrides layer color if set
  lineweight?: number;
  locked?: boolean;
  selected?: boolean;
}

export interface WallEntity extends BaseEntity {
  type: 'wall';
  x1: number; y1: number;
  x2: number; y2: number;
  thickness: number;    // mm
  height: number;       // mm, default 3000
  material?: string;
}

export interface LineEntity extends BaseEntity {
  type: 'line';
  x1: number; y1: number;
  x2: number; y2: number;
}

export interface ArcEntity extends BaseEntity {
  type: 'arc';
  cx: number; cy: number;
  radius: number;
  startAngle: number; endAngle: number;
}

export interface CircleEntity extends BaseEntity {
  type: 'circle';
  cx: number; cy: number;
  radius: number;
}

export interface DoorEntity extends BaseEntity {
  type: 'door';
  x: number; y: number;
  width: number;         // mm
  swing: number;         // degrees
  wallId?: string;
}

export interface WindowEntity extends BaseEntity {
  type: 'window';
  x: number; y: number;
  width: number; height: number;
  wallId?: string;
  sillHeight?: number;
}

export interface TextEntity extends BaseEntity {
  type: 'text';
  x: number; y: number;
  text: string;
  fontSize: number;
  rotation?: number;
}

export interface DimensionEntity extends BaseEntity {
  type: 'dimension';
  x1: number; y1: number;
  x2: number; y2: number;
  offsetY: number;      // distance offset from the measured line
}

export type AnyEntity = WallEntity | LineEntity | ArcEntity | CircleEntity |
  DoorEntity | WindowEntity | TextEntity | DimensionEntity | BaseEntity;

export interface Layer {
  name: string;
  color: string;
  visible: boolean;
  locked: boolean;
  lineweight?: number;
  linetype?: 'solid' | 'dashed' | 'dotted' | 'dashdot';
}

export interface FloorPlan {
  id: string;
  name: string;
  level: number;       // floor level (0 = Ground, 1 = First, etc.)
  elevation: number;   // mm from ±0.000
  floorHeight: number; // mm
  entities: AnyEntity[];
}

export interface Sheet {
  id: string;
  name: string;
  width: number; height: number;   // mm (A1=841x594, A2=594x420 …)
  viewports: SheetViewport[];
  titleBlock?: TitleBlock;
}

export interface SheetViewport {
  id: string;
  x: number; y: number;
  width: number; height: number;
  scale: number;        // 1:100 = 0.01
  floorId?: string;
  viewType: 'plan' | 'section' | 'elevation' | 'detail' | '3d';
}

export interface TitleBlock {
  projectName: string;
  drawingTitle: string;
  drawingNumber: string;
  scale: string;
  date: string;
  architect: string;
}

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
  buildingCodes?: Record<string, unknown>;
  generatedFromPrompt?: string;
}

// ─── Factory helpers ───────────────────────────────────────────────────────────

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
  };
}

export function createFloor(
  level: number, name: string, elevation: number, height: number
): FloorPlan {
  return {
    id: crypto.randomUUID(),
    name,
    level,
    elevation,
    floorHeight: height,
    entities: [],
  };
}

export function defaultLayers(): Layer[] {
  return [
    { name: 'Walls',      color: '#e6edf3', visible: true,  locked: false, lineweight: 0.5 },
    { name: 'Doors',      color: '#4a9eff', visible: true,  locked: false, lineweight: 0.25 },
    { name: 'Windows',    color: '#7dd3fc', visible: true,  locked: false, lineweight: 0.25 },
    { name: 'Annotation', color: '#94a3b8', visible: true,  locked: false, lineweight: 0.18 },
    { name: 'Dimensions', color: '#64748b', visible: true,  locked: false, lineweight: 0.18 },
    { name: 'Hatch',      color: '#374151', visible: true,  locked: false, lineweight: 0.13 },
    { name: 'Grid',       color: '#1d4ed8', visible: false, locked: true,  lineweight: 0.1  },
  ];
}

export function uid(): string {
  return crypto.randomUUID().slice(0, 8);
}
