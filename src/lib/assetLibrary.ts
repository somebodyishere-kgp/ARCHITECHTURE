// ═══════════════════════════════════════════════════════════════════════════════
// Asset Library — Reusable architectural symbol & block definitions
// Each asset is a BlockDef (name + entities) that can be inserted as block_ref
// Units: millimetres (mm)
// ═══════════════════════════════════════════════════════════════════════════════

import type { AnyEntity, BlockDef, Vec2 } from './adf';
import { uid } from './adf';

// ─── Asset category ─────────────────────────────────────────────────────────
export type AssetCategory =
  | 'doors' | 'windows' | 'furniture-living' | 'furniture-bedroom'
  | 'furniture-dining' | 'furniture-office' | 'kitchen' | 'bathroom'
  | 'electrical' | 'plumbing' | 'hvac' | 'fire-protection'
  | 'structural' | 'site' | 'roofs' | 'stairs';

export interface AssetEntry {
  name: string;
  category: AssetCategory;
  description: string;
  width: number;         // bounding box width (mm)
  height: number;        // bounding box height (mm) [depth in plan]
  tags: string[];
  buildEntities: () => AnyEntity[];
}

// ─── Helper: create a line quickly ──────────────────────────────────────────
function L(x1: number, y1: number, x2: number, y2: number, layer = '0'): AnyEntity {
  return { id: uid(), type: 'line', layer, x1, y1, x2, y2 } as any;
}
function A(cx: number, cy: number, r: number, sa: number, ea: number, layer = '0'): AnyEntity {
  return { id: uid(), type: 'arc', layer, cx, cy, radius: r, startAngle: sa, endAngle: ea } as any;
}
function C(cx: number, cy: number, r: number, layer = '0'): AnyEntity {
  return { id: uid(), type: 'circle', layer, cx, cy, radius: r } as any;
}
function R(x1: number, y1: number, x2: number, y2: number, layer = '0'): AnyEntity {
  return { id: uid(), type: 'rectangle', layer, x1, y1, x2, y2 } as any;
}
function PL(pts: Vec2[], closed = false, layer = '0'): AnyEntity {
  return { id: uid(), type: 'polyline', layer, points: pts, closed } as any;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DOOR SYMBOLS
// ═══════════════════════════════════════════════════════════════════════════════
const DOOR_ASSETS: AssetEntry[] = [
  {
    name: 'Single Door 900mm',
    category: 'doors', description: 'Standard single swing door, 900mm', width: 900, height: 900,
    tags: ['door', 'single', 'swing', '900'],
    buildEntities: () => [
      L(0, 0, 900, 0, 'Doors'),           // wall opening line
      L(0, 0, 0, 50, 'Doors'),            // door thickness
      L(0, 50, 900, 50, 'Doors'),
      A(0, 0, 900, 0, Math.PI / 2, 'Doors'), // swing arc
    ],
  },
  {
    name: 'Single Door 800mm',
    category: 'doors', description: 'Standard single swing door, 800mm', width: 800, height: 800,
    tags: ['door', 'single', 'swing', '800'],
    buildEntities: () => [
      L(0, 0, 800, 0, 'Doors'),
      L(0, 0, 0, 50, 'Doors'), L(0, 50, 800, 50, 'Doors'),
      A(0, 0, 800, 0, Math.PI / 2, 'Doors'),
    ],
  },
  {
    name: 'Double Door 1800mm',
    category: 'doors', description: 'Double swing door, 1800mm', width: 1800, height: 900,
    tags: ['door', 'double', 'swing', '1800'],
    buildEntities: () => [
      L(0, 0, 1800, 0, 'Doors'),
      L(0, 0, 0, 50, 'Doors'), L(0, 50, 1800, 50, 'Doors'),
      A(0, 0, 900, 0, Math.PI / 2, 'Doors'),
      A(1800, 0, 900, Math.PI / 2, Math.PI, 'Doors'),
    ],
  },
  {
    name: 'Sliding Door 2400mm',
    category: 'doors', description: 'Sliding door, 2400mm', width: 2400, height: 200,
    tags: ['door', 'sliding', '2400'],
    buildEntities: () => [
      L(0, 0, 2400, 0, 'Doors'),
      R(0, -20, 1200, 20, 'Doors'),       // fixed panel
      R(1200, -20, 2400, 20, 'Doors'),    // sliding panel
      L(1200, -20, 1200, 20, 'Doors'),    // meeting rail
      // Arrows indicating slide direction
      L(1400, 0, 2200, 0, 'Doors'),
      L(2100, -15, 2200, 0, 'Doors'), L(2100, 15, 2200, 0, 'Doors'),
    ],
  },
  {
    name: 'Folding Door 2400mm',
    category: 'doors', description: 'Bi-fold door, 2400mm', width: 2400, height: 600,
    tags: ['door', 'folding', 'bifold', '2400'],
    buildEntities: () => [
      L(0, 0, 2400, 0, 'Doors'),
      L(0, 0, 600, 600, 'Doors'), L(600, 600, 1200, 0, 'Doors'),  // left pair
      L(1200, 0, 1800, 600, 'Doors'), L(1800, 600, 2400, 0, 'Doors'), // right pair
    ],
  },
  {
    name: 'Revolving Door 2000mm',
    category: 'doors', description: 'Revolving door, 2000mm diameter', width: 2000, height: 2000,
    tags: ['door', 'revolving', '2000'],
    buildEntities: () => [
      C(1000, 1000, 1000, 'Doors'),       // outer circle
      L(0, 1000, 2000, 1000, 'Doors'),    // horizontal partition
      L(1000, 0, 1000, 2000, 'Doors'),    // vertical partition
    ],
  },
  {
    name: 'Pocket Door 900mm',
    category: 'doors', description: 'Pocket door that slides into wall, 900mm', width: 1800, height: 200,
    tags: ['door', 'pocket', 'sliding', '900'],
    buildEntities: () => [
      L(0, 0, 1800, 0, 'Doors'),
      R(0, -30, 900, 30, 'Doors'),        // wall pocket (dashed)
      R(900, -20, 1800, 20, 'Doors'),     // door panel
      L(900, -15, 1700, -15, 'Doors'),    // slide direction
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// WINDOW SYMBOLS
// ═══════════════════════════════════════════════════════════════════════════════
const WINDOW_ASSETS: AssetEntry[] = [
  {
    name: 'Fixed Window 1200mm',
    category: 'windows', description: 'Fixed (non-operable) window, 1200mm', width: 1200, height: 200,
    tags: ['window', 'fixed', '1200'],
    buildEntities: () => [
      L(0, -50, 1200, -50, 'Windows'), L(0, 0, 1200, 0, 'Windows'), L(0, 50, 1200, 50, 'Windows'),
      L(0, -50, 0, 50, 'Windows'), L(1200, -50, 1200, 50, 'Windows'),
    ],
  },
  {
    name: 'Casement Window 1500mm',
    category: 'windows', description: 'Casement window (hinged side), 1500mm', width: 1500, height: 400,
    tags: ['window', 'casement', '1500'],
    buildEntities: () => [
      L(0, -50, 1500, -50, 'Windows'), L(0, 0, 1500, 0, 'Windows'), L(0, 50, 1500, 50, 'Windows'),
      L(0, -50, 0, 50, 'Windows'), L(1500, -50, 1500, 50, 'Windows'),
      // Swing indication (triangle from hinge side)
      L(0, 0, 750, 400, 'Windows'), L(750, 400, 1500, 0, 'Windows'),
    ],
  },
  {
    name: 'Sliding Window 1800mm',
    category: 'windows', description: 'Horizontal sliding window, 1800mm', width: 1800, height: 200,
    tags: ['window', 'sliding', '1800'],
    buildEntities: () => [
      L(0, -50, 1800, -50, 'Windows'), L(0, 50, 1800, 50, 'Windows'),
      L(0, -50, 0, 50, 'Windows'), L(1800, -50, 1800, 50, 'Windows'),
      L(0, -20, 900, -20, 'Windows'), L(0, 20, 900, 20, 'Windows'),
      L(900, -20, 1800, -20, 'Windows'), L(900, 20, 1800, 20, 'Windows'),
      L(900, -50, 900, 50, 'Windows'),
    ],
  },
  {
    name: 'Awning Window 900mm',
    category: 'windows', description: 'Awning window (hinged top), 900mm', width: 900, height: 600,
    tags: ['window', 'awning', '900'],
    buildEntities: () => [
      R(0, 0, 900, 100, 'Windows'),
      L(0, 100, 450, 600, 'Windows'), L(450, 600, 900, 100, 'Windows'),
    ],
  },
  {
    name: 'Bay Window 2400mm',
    category: 'windows', description: 'Bay window projection, 2400mm', width: 2400, height: 600,
    tags: ['window', 'bay', '2400'],
    buildEntities: () => [
      L(0, 0, 400, 600, 'Windows'),     // angled left
      L(400, 600, 2000, 600, 'Windows'), // front face
      L(2000, 600, 2400, 0, 'Windows'), // angled right
      // Window subdivisions
      L(400, 0, 400, 600, 'Windows'),
      L(2000, 0, 2000, 600, 'Windows'),
      L(800, 600, 800, 0, 'Windows'),
      L(1200, 600, 1200, 0, 'Windows'),
      L(1600, 600, 1600, 0, 'Windows'),
    ],
  },
  {
    name: 'Hopper Window 600mm',
    category: 'windows', description: 'Hopper window (hinged bottom), 600mm', width: 600, height: 400,
    tags: ['window', 'hopper', '600'],
    buildEntities: () => [
      R(0, 0, 600, 100, 'Windows'),
      L(0, 0, 300, -400, 'Windows'), L(300, -400, 600, 0, 'Windows'),
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// FURNITURE — LIVING ROOM
// ═══════════════════════════════════════════════════════════════════════════════
const FURNITURE_LIVING: AssetEntry[] = [
  {
    name: '3-Seat Sofa',
    category: 'furniture-living', description: '3-seat sofa, 2200x900mm', width: 2200, height: 900,
    tags: ['sofa', 'couch', 'living', 'seating'],
    buildEntities: () => [
      R(0, 0, 2200, 900, 'Furniture'),   // outer
      R(50, 50, 2150, 700, 'Furniture'), // seat
      R(50, 700, 2150, 900, 'Furniture'), // back cushion
      L(733, 50, 733, 700, 'Furniture'),  // cushion dividers
      L(1466, 50, 1466, 700, 'Furniture'),
    ],
  },
  {
    name: '2-Seat Sofa',
    category: 'furniture-living', description: 'Loveseat, 1600x850mm', width: 1600, height: 850,
    tags: ['sofa', 'loveseat', 'living', 'seating'],
    buildEntities: () => [
      R(0, 0, 1600, 850, 'Furniture'),
      R(50, 50, 1550, 650, 'Furniture'),
      R(50, 650, 1550, 850, 'Furniture'),
      L(800, 50, 800, 650, 'Furniture'),
    ],
  },
  {
    name: 'Armchair',
    category: 'furniture-living', description: 'Single armchair, 850x850mm', width: 850, height: 850,
    tags: ['armchair', 'chair', 'living', 'seating'],
    buildEntities: () => [
      R(0, 0, 850, 850, 'Furniture'),
      R(100, 100, 750, 600, 'Furniture'), // seat
      R(100, 600, 750, 850, 'Furniture'), // back
      R(0, 0, 100, 850, 'Furniture'),     // left arm
      R(750, 0, 850, 850, 'Furniture'),   // right arm
    ],
  },
  {
    name: 'Coffee Table',
    category: 'furniture-living', description: 'Rectangular coffee table, 1200x600mm', width: 1200, height: 600,
    tags: ['table', 'coffee', 'living'],
    buildEntities: () => [
      R(0, 0, 1200, 600, 'Furniture'),
      R(30, 30, 1170, 570, 'Furniture'), // inset edge
    ],
  },
  {
    name: 'Round Coffee Table',
    category: 'furniture-living', description: 'Round coffee table, ⌀800mm', width: 800, height: 800,
    tags: ['table', 'coffee', 'round', 'living'],
    buildEntities: () => [
      C(400, 400, 400, 'Furniture'),
      C(400, 400, 370, 'Furniture'), // inner edge
    ],
  },
  {
    name: 'TV Console',
    category: 'furniture-living', description: 'TV console/entertainment unit, 1800x450mm', width: 1800, height: 450,
    tags: ['tv', 'console', 'entertainment', 'living'],
    buildEntities: () => [
      R(0, 0, 1800, 450, 'Furniture'),
      L(450, 0, 450, 450, 'Furniture'),
      L(900, 0, 900, 450, 'Furniture'),
      L(1350, 0, 1350, 450, 'Furniture'),
    ],
  },
  {
    name: 'Bookshelf',
    category: 'furniture-living', description: 'Bookshelf, 900x350mm', width: 900, height: 350,
    tags: ['bookshelf', 'shelf', 'storage', 'living'],
    buildEntities: () => [
      R(0, 0, 900, 350, 'Furniture'),
      L(0, 70, 900, 70, 'Furniture'),
      L(0, 140, 900, 140, 'Furniture'),
      L(0, 210, 900, 210, 'Furniture'),
      L(0, 280, 900, 280, 'Furniture'),
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// FURNITURE — BEDROOM
// ═══════════════════════════════════════════════════════════════════════════════
const FURNITURE_BEDROOM: AssetEntry[] = [
  {
    name: 'Queen Bed',
    category: 'furniture-bedroom', description: 'Queen bed with headboard, 2000x1600mm', width: 2000, height: 1600,
    tags: ['bed', 'queen', 'bedroom'],
    buildEntities: () => [
      R(0, 0, 2000, 1600, 'Furniture'),     // frame
      R(0, 0, 2000, 100, 'Furniture'),       // headboard
      R(100, 150, 1900, 1500, 'Furniture'),  // mattress
      // Pillow outlines
      R(150, 180, 650, 400, 'Furniture'),
      R(1350, 180, 1850, 400, 'Furniture'),
    ],
  },
  {
    name: 'King Bed',
    category: 'furniture-bedroom', description: 'King bed with headboard, 2100x2000mm', width: 2100, height: 2000,
    tags: ['bed', 'king', 'bedroom'],
    buildEntities: () => [
      R(0, 0, 2100, 2000, 'Furniture'),
      R(0, 0, 2100, 100, 'Furniture'),
      R(100, 150, 2000, 1900, 'Furniture'),
      R(150, 180, 750, 400, 'Furniture'),
      R(1350, 180, 1950, 400, 'Furniture'),
    ],
  },
  {
    name: 'Single Bed',
    category: 'furniture-bedroom', description: 'Single/twin bed, 2000x900mm', width: 2000, height: 900,
    tags: ['bed', 'single', 'twin', 'bedroom'],
    buildEntities: () => [
      R(0, 0, 2000, 900, 'Furniture'),
      R(0, 0, 2000, 80, 'Furniture'),
      R(80, 120, 1920, 820, 'Furniture'),
      R(200, 150, 700, 350, 'Furniture'),
    ],
  },
  {
    name: 'Nightstand',
    category: 'furniture-bedroom', description: 'Bedside nightstand, 500x450mm', width: 500, height: 450,
    tags: ['nightstand', 'bedside', 'table', 'bedroom'],
    buildEntities: () => [
      R(0, 0, 500, 450, 'Furniture'),
      L(0, 150, 500, 150, 'Furniture'),
      C(250, 75, 30, 'Furniture'), // knob
    ],
  },
  {
    name: 'Wardrobe 1800mm',
    category: 'furniture-bedroom', description: 'Double-door wardrobe, 1800x600mm', width: 1800, height: 600,
    tags: ['wardrobe', 'closet', 'bedroom', 'storage'],
    buildEntities: () => [
      R(0, 0, 1800, 600, 'Furniture'),
      L(900, 0, 900, 600, 'Furniture'),   // center division
      C(850, 300, 15, 'Furniture'),        // left handle
      C(950, 300, 15, 'Furniture'),        // right handle
    ],
  },
  {
    name: 'Dresser',
    category: 'furniture-bedroom', description: 'Chest of drawers, 1200x500mm', width: 1200, height: 500,
    tags: ['dresser', 'drawers', 'bedroom', 'storage'],
    buildEntities: () => [
      R(0, 0, 1200, 500, 'Furniture'),
      L(0, 100, 1200, 100, 'Furniture'),
      L(0, 200, 1200, 200, 'Furniture'),
      L(0, 300, 1200, 300, 'Furniture'),
      L(0, 400, 1200, 400, 'Furniture'),
      C(600, 50, 15, 'Furniture'), C(600, 150, 15, 'Furniture'),
      C(600, 250, 15, 'Furniture'), C(600, 350, 15, 'Furniture'), C(600, 450, 15, 'Furniture'),
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// FURNITURE — DINING
// ═══════════════════════════════════════════════════════════════════════════════
const FURNITURE_DINING: AssetEntry[] = [
  {
    name: 'Dining Table 6-Seat',
    category: 'furniture-dining', description: 'Rectangular dining table 6-seat, 1800x900mm', width: 1800, height: 900,
    tags: ['table', 'dining', '6-seat'],
    buildEntities: () => [
      R(0, 0, 1800, 900, 'Furniture'),
      // 6 chairs represented as circles
      C(300, -250, 200, 'Furniture'), C(900, -250, 200, 'Furniture'), C(1500, -250, 200, 'Furniture'),
      C(300, 1150, 200, 'Furniture'), C(900, 1150, 200, 'Furniture'), C(1500, 1150, 200, 'Furniture'),
    ],
  },
  {
    name: 'Dining Table 4-Seat',
    category: 'furniture-dining', description: 'Square dining table 4-seat, 1000x1000mm', width: 1000, height: 1000,
    tags: ['table', 'dining', '4-seat', 'square'],
    buildEntities: () => [
      R(0, 0, 1000, 1000, 'Furniture'),
      C(500, -250, 200, 'Furniture'), C(500, 1250, 200, 'Furniture'),
      C(-250, 500, 200, 'Furniture'), C(1250, 500, 200, 'Furniture'),
    ],
  },
  {
    name: 'Round Dining Table',
    category: 'furniture-dining', description: 'Round dining table, ⌀1200mm', width: 1200, height: 1200,
    tags: ['table', 'dining', 'round'],
    buildEntities: () => {
      const ents: AnyEntity[] = [C(600, 600, 600, 'Furniture')];
      // 6 chairs around
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI * 2 * i) / 6;
        ents.push(C(600 + Math.cos(a) * 850, 600 + Math.sin(a) * 850, 200, 'Furniture'));
      }
      return ents;
    },
  },
  {
    name: 'Dining Chair',
    category: 'furniture-dining', description: 'Dining chair, 450x450mm', width: 450, height: 450,
    tags: ['chair', 'dining', 'seating'],
    buildEntities: () => [
      R(0, 0, 450, 450, 'Furniture'),
      R(25, 25, 425, 350, 'Furniture'),   // seat
      R(25, 350, 425, 450, 'Furniture'),  // back
    ],
  },
  {
    name: 'Bar Stool',
    category: 'furniture-dining', description: 'Bar stool, ⌀400mm', width: 400, height: 400,
    tags: ['stool', 'bar', 'seating'],
    buildEntities: () => [
      C(200, 200, 200, 'Furniture'),
      C(200, 200, 150, 'Furniture'),
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// FURNITURE — OFFICE
// ═══════════════════════════════════════════════════════════════════════════════
const FURNITURE_OFFICE: AssetEntry[] = [
  {
    name: 'L-Shaped Desk',
    category: 'furniture-office', description: 'L-shaped desk, 1600x1400mm', width: 1600, height: 1400,
    tags: ['desk', 'l-shaped', 'office'],
    buildEntities: () => [
      PL([{ x: 0, y: 0 }, { x: 1600, y: 0 }, { x: 1600, y: 700 }, { x: 700, y: 700 }, { x: 700, y: 1400 }, { x: 0, y: 1400 }], true, 'Furniture'),
    ],
  },
  {
    name: 'Straight Desk',
    category: 'furniture-office', description: 'Straight desk, 1400x700mm', width: 1400, height: 700,
    tags: ['desk', 'straight', 'office'],
    buildEntities: () => [
      R(0, 0, 1400, 700, 'Furniture'),
      R(50, 100, 550, 650, 'Furniture'),     // drawer bank left
      R(850, 100, 1350, 650, 'Furniture'),   // drawer bank right
    ],
  },
  {
    name: 'Office Chair',
    category: 'furniture-office', description: 'Swivel office chair, ⌀600mm', width: 600, height: 600,
    tags: ['chair', 'office', 'swivel'],
    buildEntities: () => [
      C(300, 300, 250, 'Furniture'),          // seat
      R(100, 350, 500, 500, 'Furniture'),     // back
      C(300, 300, 300, 'Furniture'),           // base (5-star)
    ],
  },
  {
    name: 'Filing Cabinet',
    category: 'furniture-office', description: '3-drawer filing cabinet, 470x600mm', width: 470, height: 600,
    tags: ['cabinet', 'filing', 'office', 'storage'],
    buildEntities: () => [
      R(0, 0, 470, 600, 'Furniture'),
      L(0, 200, 470, 200, 'Furniture'),
      L(0, 400, 470, 400, 'Furniture'),
      C(235, 100, 12, 'Furniture'), C(235, 300, 12, 'Furniture'), C(235, 500, 12, 'Furniture'),
    ],
  },
  {
    name: 'Conference Table',
    category: 'furniture-office', description: 'Oval conference table, 3000x1200mm', width: 3000, height: 1200,
    tags: ['table', 'conference', 'meeting', 'office'],
    buildEntities: () => {
      const ents: AnyEntity[] = [];
      // Oval approximation with ellipse note: using rounded rect
      ents.push(R(200, 0, 2800, 1200, 'Furniture'));
      ents.push(A(200, 600, 600, Math.PI / 2, Math.PI * 1.5, 'Furniture'));
      ents.push(A(2800, 600, 600, -Math.PI / 2, Math.PI / 2, 'Furniture'));
      // 10 chairs
      for (let i = 0; i < 4; i++) ents.push(C(500 + i * 600, -250, 200, 'Furniture'));
      for (let i = 0; i < 4; i++) ents.push(C(500 + i * 600, 1450, 200, 'Furniture'));
      ents.push(C(-250, 600, 200, 'Furniture'));
      ents.push(C(3250, 600, 200, 'Furniture'));
      return ents;
    },
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// KITCHEN
// ═══════════════════════════════════════════════════════════════════════════════
const KITCHEN_ASSETS: AssetEntry[] = [
  {
    name: 'Kitchen Sink (Double)',
    category: 'kitchen', description: 'Double bowl kitchen sink, 800x600mm', width: 800, height: 600,
    tags: ['sink', 'double', 'kitchen'],
    buildEntities: () => [
      R(0, 0, 800, 600, 'Fixtures'),
      R(40, 60, 370, 540, 'Fixtures'),   // left bowl
      R(430, 60, 760, 540, 'Fixtures'),  // right bowl
      C(200, 300, 20, 'Fixtures'),        // left drain
      C(600, 300, 20, 'Fixtures'),        // right drain
      C(400, 30, 25, 'Fixtures'),         // faucet
    ],
  },
  {
    name: 'Kitchen Sink (Single)',
    category: 'kitchen', description: 'Single bowl kitchen sink, 600x500mm', width: 600, height: 500,
    tags: ['sink', 'single', 'kitchen'],
    buildEntities: () => [
      R(0, 0, 600, 500, 'Fixtures'),
      R(50, 50, 550, 450, 'Fixtures'),
      C(300, 250, 20, 'Fixtures'),
      C(300, 25, 25, 'Fixtures'),
    ],
  },
  {
    name: 'Refrigerator',
    category: 'kitchen', description: 'Standard refrigerator, 900x700mm', width: 900, height: 700,
    tags: ['refrigerator', 'fridge', 'kitchen', 'appliance'],
    buildEntities: () => [
      R(0, 0, 900, 700, 'Furniture'),
      L(450, 0, 450, 700, 'Furniture'),   // door split
      C(420, 350, 15, 'Furniture'),        // left handle
      C(480, 350, 15, 'Furniture'),        // right handle
    ],
  },
  {
    name: 'Oven/Range',
    category: 'kitchen', description: 'Cooktop with oven, 600x600mm', width: 600, height: 600,
    tags: ['oven', 'range', 'cooktop', 'kitchen', 'appliance'],
    buildEntities: () => [
      R(0, 0, 600, 600, 'Furniture'),
      C(150, 150, 80, 'Furniture'),   // burner TL
      C(450, 150, 80, 'Furniture'),   // burner TR
      C(150, 450, 100, 'Furniture'),  // burner BL (large)
      C(450, 450, 80, 'Furniture'),   // burner BR
    ],
  },
  {
    name: 'Dishwasher',
    category: 'kitchen', description: 'Built-in dishwasher, 600x600mm', width: 600, height: 600,
    tags: ['dishwasher', 'kitchen', 'appliance'],
    buildEntities: () => [
      R(0, 0, 600, 600, 'Furniture'),
      C(300, 300, 15, 'Furniture'),        // handle
      L(100, 100, 500, 100, 'Furniture'),  // rack line
    ],
  },
  {
    name: 'Microwave',
    category: 'kitchen', description: 'Microwave oven, 550x400mm', width: 550, height: 400,
    tags: ['microwave', 'kitchen', 'appliance'],
    buildEntities: () => [
      R(0, 0, 550, 400, 'Furniture'),
      R(30, 30, 380, 370, 'Furniture'),   // door window
      C(480, 200, 20, 'Furniture'),        // knob
    ],
  },
  {
    name: 'Kitchen Counter (Straight)',
    category: 'kitchen', description: 'Counter section, 3000x600mm', width: 3000, height: 600,
    tags: ['counter', 'kitchen', 'countertop'],
    buildEntities: () => [
      R(0, 0, 3000, 600, 'Furniture'),
      L(600, 0, 600, 600, 'Furniture'),
      L(1200, 0, 1200, 600, 'Furniture'),
      L(1800, 0, 1800, 600, 'Furniture'),
      L(2400, 0, 2400, 600, 'Furniture'),
    ],
  },
  {
    name: 'Kitchen Island',
    category: 'kitchen', description: 'Kitchen island, 2400x1000mm', width: 2400, height: 1000,
    tags: ['island', 'kitchen', 'counter'],
    buildEntities: () => [
      R(0, 0, 2400, 1000, 'Furniture'),
      L(0, 100, 2400, 100, 'Furniture'),   // countertop edge
      // 4 stools on one side
      C(300, -250, 200, 'Furniture'), C(900, -250, 200, 'Furniture'),
      C(1500, -250, 200, 'Furniture'), C(2100, -250, 200, 'Furniture'),
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// BATHROOM
// ═══════════════════════════════════════════════════════════════════════════════
const BATHROOM_ASSETS: AssetEntry[] = [
  {
    name: 'Toilet',
    category: 'bathroom', description: 'Standard toilet, 400x700mm', width: 400, height: 700,
    tags: ['toilet', 'wc', 'bathroom'],
    buildEntities: () => [
      R(50, 0, 350, 250, 'Fixtures'),           // tank
      // Bowl (elliptical shape approximated with arcs/lines)
      PL([{ x: 50, y: 250 }, { x: 0, y: 400 }, { x: 40, y: 600 }, { x: 200, y: 700 },
          { x: 360, y: 600 }, { x: 400, y: 400 }, { x: 350, y: 250 }], true, 'Fixtures'),
      C(200, 480, 100, 'Fixtures'),              // bowl inner
    ],
  },
  {
    name: 'Bathtub',
    category: 'bathroom', description: 'Standard bathtub, 1700x750mm', width: 1700, height: 750,
    tags: ['bathtub', 'tub', 'bath', 'bathroom'],
    buildEntities: () => [
      R(0, 0, 1700, 750, 'Fixtures'),           // outer
      R(40, 40, 1660, 710, 'Fixtures'),          // inner
      C(200, 375, 30, 'Fixtures'),                // drain
      C(100, 375, 20, 'Fixtures'),                // faucet
    ],
  },
  {
    name: 'Shower 900x900',
    category: 'bathroom', description: 'Square shower enclosure, 900x900mm', width: 900, height: 900,
    tags: ['shower', 'bathroom'],
    buildEntities: () => [
      R(0, 0, 900, 900, 'Fixtures'),
      C(450, 450, 40, 'Fixtures'),                // drain
      // Shower head indicator
      C(450, 100, 60, 'Fixtures'),
      // Door swing arc
      A(0, 0, 900, 0, Math.PI / 2, 'Fixtures'),
    ],
  },
  {
    name: 'Vanity with Sink',
    category: 'bathroom', description: 'Bathroom vanity with sink, 900x550mm', width: 900, height: 550,
    tags: ['vanity', 'sink', 'bathroom', 'basin'],
    buildEntities: () => [
      R(0, 0, 900, 550, 'Fixtures'),            // cabinet
      R(200, 50, 700, 450, 'Fixtures'),          // basin
      C(450, 250, 20, 'Fixtures'),                // drain
      C(450, 50, 15, 'Fixtures'),                 // faucet
    ],
  },
  {
    name: 'Double Vanity',
    category: 'bathroom', description: 'Double vanity with two sinks, 1500x550mm', width: 1500, height: 550,
    tags: ['vanity', 'double', 'sink', 'bathroom', 'basin'],
    buildEntities: () => [
      R(0, 0, 1500, 550, 'Fixtures'),
      R(80, 50, 620, 450, 'Fixtures'),      // left basin
      R(880, 50, 1420, 450, 'Fixtures'),     // right basin
      C(350, 250, 20, 'Fixtures'),  C(1150, 250, 20, 'Fixtures'),
      C(350, 50, 15, 'Fixtures'),   C(1150, 50, 15, 'Fixtures'),
    ],
  },
  {
    name: 'Bidet',
    category: 'bathroom', description: 'Bidet fixture, 350x600mm', width: 350, height: 600,
    tags: ['bidet', 'bathroom'],
    buildEntities: () => [
      PL([{ x: 25, y: 0 }, { x: 0, y: 200 }, { x: 25, y: 500 }, { x: 175, y: 600 },
          { x: 325, y: 500 }, { x: 350, y: 200 }, { x: 325, y: 0 }], true, 'Fixtures'),
      C(175, 350, 80, 'Fixtures'),
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// ELECTRICAL SYMBOLS
// ═══════════════════════════════════════════════════════════════════════════════
const ELECTRICAL_ASSETS: AssetEntry[] = [
  {
    name: 'Duplex Receptacle',
    category: 'electrical', description: 'Standard wall outlet/receptacle', width: 200, height: 200,
    tags: ['receptacle', 'outlet', 'electrical', 'power'],
    buildEntities: () => [
      C(100, 100, 100, 'Electrical'),
      L(50, 70, 90, 70, 'Electrical'), L(50, 90, 90, 90, 'Electrical'),   // slot pair 1
      L(110, 70, 150, 70, 'Electrical'), L(110, 90, 150, 90, 'Electrical'), // slot pair 2
    ],
  },
  {
    name: 'Light Switch',
    category: 'electrical', description: 'Single-pole light switch', width: 200, height: 200,
    tags: ['switch', 'light', 'electrical'],
    buildEntities: () => [
      C(100, 100, 100, 'Electrical'),
      L(100, 100, 100, 0, 'Electrical'),  // switch arm (up)
    ],
  },
  {
    name: 'Ceiling Light',
    category: 'electrical', description: 'Ceiling-mounted light fixture', width: 300, height: 300,
    tags: ['light', 'ceiling', 'fixture', 'electrical'],
    buildEntities: () => [
      C(150, 150, 150, 'Electrical'),
      L(50, 50, 250, 250, 'Electrical'),
      L(250, 50, 50, 250, 'Electrical'),
    ],
  },
  {
    name: 'Recessed Light',
    category: 'electrical', description: 'Recessed (can) light', width: 200, height: 200,
    tags: ['light', 'recessed', 'downlight', 'electrical'],
    buildEntities: () => [
      C(100, 100, 100, 'Electrical'),
      C(100, 100, 60, 'Electrical'),
    ],
  },
  {
    name: 'Panel Board',
    category: 'electrical', description: 'Electrical panel, 600x400mm', width: 600, height: 400,
    tags: ['panel', 'breaker', 'electrical'],
    buildEntities: () => [
      R(0, 0, 600, 400, 'Electrical'),
      L(300, 0, 300, 400, 'Electrical'),     // center division
      L(0, 100, 600, 100, 'Electrical'),     // top section
      // Breaker indicators
      L(50, 150, 250, 150, 'Electrical'), L(50, 200, 250, 200, 'Electrical'),
      L(50, 250, 250, 250, 'Electrical'), L(50, 300, 250, 300, 'Electrical'),
      L(350, 150, 550, 150, 'Electrical'), L(350, 200, 550, 200, 'Electrical'),
      L(350, 250, 550, 250, 'Electrical'), L(350, 300, 550, 300, 'Electrical'),
    ],
  },
  {
    name: 'Smoke Detector',
    category: 'electrical', description: 'Smoke/fire detector', width: 200, height: 200,
    tags: ['smoke', 'detector', 'fire', 'safety'],
    buildEntities: () => [
      C(100, 100, 100, 'Electrical'),
      C(100, 100, 50, 'Electrical'),
      L(65, 65, 135, 135, 'Electrical'),  // S shape approx
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// PLUMBING SYMBOLS
// ═══════════════════════════════════════════════════════════════════════════════
const PLUMBING_ASSETS: AssetEntry[] = [
  {
    name: 'Gate Valve',
    category: 'plumbing', description: 'Gate valve symbol', width: 200, height: 200,
    tags: ['valve', 'gate', 'plumbing'],
    buildEntities: () => [
      L(0, 100, 80, 0, 'Plumbing'), L(0, 100, 80, 200, 'Plumbing'),     // left triangle
      L(120, 0, 200, 100, 'Plumbing'), L(120, 200, 200, 100, 'Plumbing'), // right triangle
      L(80, 0, 120, 0, 'Plumbing'), L(80, 200, 120, 200, 'Plumbing'),
    ],
  },
  {
    name: 'Floor Drain',
    category: 'plumbing', description: 'Floor drain symbol', width: 200, height: 200,
    tags: ['drain', 'floor', 'plumbing'],
    buildEntities: () => [
      R(0, 0, 200, 200, 'Plumbing'),
      C(100, 100, 70, 'Plumbing'),
      C(100, 100, 15, 'Plumbing'),
    ],
  },
  {
    name: 'Water Heater',
    category: 'plumbing', description: 'Water heater, ⌀500mm', width: 500, height: 500,
    tags: ['water', 'heater', 'hot water', 'plumbing'],
    buildEntities: () => [
      C(250, 250, 250, 'Plumbing'),
      L(100, 250, 400, 250, 'Plumbing'),
      L(250, 100, 250, 400, 'Plumbing'),
    ],
  },
  {
    name: 'Cleanout',
    category: 'plumbing', description: 'Cleanout access symbol', width: 200, height: 200,
    tags: ['cleanout', 'access', 'plumbing'],
    buildEntities: () => [
      C(100, 100, 100, 'Plumbing'),
      L(30, 30, 170, 170, 'Plumbing'),
      L(170, 30, 30, 170, 'Plumbing'),
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// HVAC SYMBOLS
// ═══════════════════════════════════════════════════════════════════════════════
const HVAC_ASSETS: AssetEntry[] = [
  {
    name: 'Supply Diffuser (Square)',
    category: 'hvac', description: 'Square ceiling supply diffuser, 600x600mm', width: 600, height: 600,
    tags: ['diffuser', 'supply', 'ceiling', 'hvac'],
    buildEntities: () => [
      R(0, 0, 600, 600, 'HVAC'),
      L(0, 0, 600, 600, 'HVAC'), L(600, 0, 0, 600, 'HVAC'),
    ],
  },
  {
    name: 'Return Grille',
    category: 'hvac', description: 'Return air grille, 600x300mm', width: 600, height: 300,
    tags: ['grille', 'return', 'hvac'],
    buildEntities: () => [
      R(0, 0, 600, 300, 'HVAC'),
      L(0, 60, 600, 60, 'HVAC'), L(0, 120, 600, 120, 'HVAC'),
      L(0, 180, 600, 180, 'HVAC'), L(0, 240, 600, 240, 'HVAC'),
    ],
  },
  {
    name: 'Thermostat',
    category: 'hvac', description: 'Wall thermostat', width: 150, height: 150,
    tags: ['thermostat', 'control', 'hvac'],
    buildEntities: () => [
      R(0, 0, 150, 150, 'HVAC'),
      C(75, 75, 50, 'HVAC'),
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// ROOF PLAN SYMBOLS
// ═══════════════════════════════════════════════════════════════════════════════
const ROOF_ASSETS: AssetEntry[] = [
  {
    name: 'Gable Roof Plan',
    category: 'roofs', description: 'Gable roof plan view, 6000x4000mm', width: 6000, height: 4000,
    tags: ['roof', 'gable'],
    buildEntities: () => [
      R(0, 0, 6000, 4000, 'Roof'),
      L(0, 2000, 6000, 2000, 'Roof'),     // ridge line
      // Ridge line dashed (overhang)
      L(-200, 2000, 0, 2000, 'Roof'), L(6000, 2000, 6200, 2000, 'Roof'),
      // Eave overhangs
      L(-200, -200, 6200, -200, 'Roof'), L(-200, 4200, 6200, 4200, 'Roof'),
      L(-200, -200, -200, 4200, 'Roof'), L(6200, -200, 6200, 4200, 'Roof'),
    ],
  },
  {
    name: 'Hip Roof Plan',
    category: 'roofs', description: 'Hip roof plan view, 6000x4000mm', width: 6000, height: 4000,
    tags: ['roof', 'hip'],
    buildEntities: () => [
      R(0, 0, 6000, 4000, 'Roof'),
      L(1000, 2000, 5000, 2000, 'Roof'),  // ridge
      // Hip lines from corners to ridge ends
      L(0, 0, 1000, 2000, 'Roof'), L(0, 4000, 1000, 2000, 'Roof'),
      L(6000, 0, 5000, 2000, 'Roof'), L(6000, 4000, 5000, 2000, 'Roof'),
    ],
  },
  {
    name: 'Flat Roof Plan',
    category: 'roofs', description: 'Flat roof with drainage, 6000x4000mm', width: 6000, height: 4000,
    tags: ['roof', 'flat'],
    buildEntities: () => [
      R(0, 0, 6000, 4000, 'Roof'),
      // Drain locations
      C(1500, 1000, 100, 'Roof'), C(4500, 1000, 100, 'Roof'),
      C(1500, 3000, 100, 'Roof'), C(4500, 3000, 100, 'Roof'),
      // Slope arrows
      L(3000, 2000, 1500, 1000, 'Roof'), L(3000, 2000, 4500, 1000, 'Roof'),
      L(3000, 2000, 1500, 3000, 'Roof'), L(3000, 2000, 4500, 3000, 'Roof'),
    ],
  },
  {
    name: 'Mansard Roof Plan',
    category: 'roofs', description: 'Mansard roof plan view, 6000x4000mm', width: 6000, height: 4000,
    tags: ['roof', 'mansard'],
    buildEntities: () => [
      R(0, 0, 6000, 4000, 'Roof'),         // outer
      R(800, 800, 5200, 3200, 'Roof'),      // inner flat
      // Slope lines from corners
      L(0, 0, 800, 800, 'Roof'), L(6000, 0, 5200, 800, 'Roof'),
      L(0, 4000, 800, 3200, 'Roof'), L(6000, 4000, 5200, 3200, 'Roof'),
    ],
  },
  {
    name: 'Shed Roof Plan',
    category: 'roofs', description: 'Shed (mono-pitch) roof plan, 4000x3000mm', width: 4000, height: 3000,
    tags: ['roof', 'shed', 'mono-pitch'],
    buildEntities: () => [
      R(0, 0, 4000, 3000, 'Roof'),
      // Slope direction arrow
      L(2000, 500, 2000, 2500, 'Roof'),
      L(1800, 2300, 2000, 2500, 'Roof'), L(2200, 2300, 2000, 2500, 'Roof'),
      // High edge indicator
      L(-200, 0, 4200, 0, 'Roof'),
    ],
  },
  {
    name: 'Butterfly Roof Plan',
    category: 'roofs', description: 'Butterfly (inverted gable) roof plan, 6000x4000mm', width: 6000, height: 4000,
    tags: ['roof', 'butterfly', 'inverted'],
    buildEntities: () => [
      R(0, 0, 6000, 4000, 'Roof'),
      L(0, 2000, 6000, 2000, 'Roof'),     // valley line
      // Slope arrows pointing inward
      L(3000, 500, 3000, 1800, 'Roof'), L(2800, 1600, 3000, 1800, 'Roof'), L(3200, 1600, 3000, 1800, 'Roof'),
      L(3000, 3500, 3000, 2200, 'Roof'), L(2800, 2400, 3000, 2200, 'Roof'), L(3200, 2400, 3000, 2200, 'Roof'),
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// STAIR SYMBOLS
// ═══════════════════════════════════════════════════════════════════════════════
const STAIR_ASSETS: AssetEntry[] = [
  {
    name: 'Straight Stair (Up)',
    category: 'stairs', description: 'Straight stair going up, 1200x3000mm', width: 1200, height: 3000,
    tags: ['stair', 'straight', 'up'],
    buildEntities: () => {
      const ents: AnyEntity[] = [R(0, 0, 1200, 3000, 'Stairs')];
      // 12 treads at 250mm each
      for (let i = 1; i <= 12; i++) ents.push(L(0, i * 250, 1200, i * 250, 'Stairs'));
      // Direction arrow
      ents.push(L(600, 200, 600, 2800, 'Stairs'));
      ents.push(L(500, 2600, 600, 2800, 'Stairs')); ents.push(L(700, 2600, 600, 2800, 'Stairs'));
      // "UP" label
      return ents;
    },
  },
  {
    name: 'L-Shaped Stair',
    category: 'stairs', description: 'L-shaped stair with landing, 2400x2400mm', width: 2400, height: 2400,
    tags: ['stair', 'l-shaped', 'landing'],
    buildEntities: () => {
      const ents: AnyEntity[] = [];
      // Lower run
      ents.push(R(0, 0, 1200, 1800, 'Stairs'));
      for (let i = 1; i <= 6; i++) ents.push(L(0, i * 300, 1200, i * 300, 'Stairs'));
      // Landing
      ents.push(R(0, 1800, 2400, 2400, 'Stairs'));
      // Upper run
      ents.push(R(1200, 0, 2400, 1800, 'Stairs'));
      for (let i = 1; i <= 6; i++) ents.push(L(1200, 1800 - i * 300, 2400, 1800 - i * 300, 'Stairs'));
      // Arrow
      ents.push(L(600, 200, 600, 1600, 'Stairs'));
      ents.push(L(500, 1400, 600, 1600, 'Stairs')); ents.push(L(700, 1400, 600, 1600, 'Stairs'));
      return ents;
    },
  },
  {
    name: 'U-Shaped Stair',
    category: 'stairs', description: 'U-shaped stair with intermediate landing', width: 2400, height: 4000,
    tags: ['stair', 'u-shaped', 'landing'],
    buildEntities: () => {
      const ents: AnyEntity[] = [];
      // Left run (going up)
      ents.push(R(0, 0, 1100, 2800, 'Stairs'));
      for (let i = 1; i <= 8; i++) ents.push(L(0, i * 350, 1100, i * 350, 'Stairs'));
      // Landing
      ents.push(R(0, 2800, 2400, 4000, 'Stairs'));
      // Right run (going up)
      ents.push(R(1300, 0, 2400, 2800, 'Stairs'));
      for (let i = 1; i <= 8; i++) ents.push(L(1300, 2800 - i * 350, 2400, 2800 - i * 350, 'Stairs'));
      return ents;
    },
  },
  {
    name: 'Spiral Stair',
    category: 'stairs', description: 'Spiral staircase, ⌀2000mm', width: 2000, height: 2000,
    tags: ['stair', 'spiral', 'circular'],
    buildEntities: () => {
      const ents: AnyEntity[] = [];
      ents.push(C(1000, 1000, 1000, 'Stairs'));   // outer
      ents.push(C(1000, 1000, 150, 'Stairs'));     // center post
      // Tread lines (12 radiating lines at 30-degree intervals)
      for (let i = 0; i < 12; i++) {
        const a = (Math.PI * 2 * i) / 12;
        ents.push(L(
          1000 + Math.cos(a) * 150, 1000 + Math.sin(a) * 150,
          1000 + Math.cos(a) * 1000, 1000 + Math.sin(a) * 1000, 'Stairs'));
      }
      return ents;
    },
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// STRUCTURAL SYMBOLS
// ═══════════════════════════════════════════════════════════════════════════════
const STRUCTURAL_ASSETS: AssetEntry[] = [
  {
    name: 'Square Column 300x300',
    category: 'structural', description: 'Structural square column, 300x300mm', width: 300, height: 300,
    tags: ['column', 'square', 'structural', 'concrete'],
    buildEntities: () => [
      R(0, 0, 300, 300, 'Columns'),
      L(0, 0, 300, 300, 'Columns'), L(300, 0, 0, 300, 'Columns'), // cross-hatch
    ],
  },
  {
    name: 'Round Column ⌀400',
    category: 'structural', description: 'Structural round column, ⌀400mm', width: 400, height: 400,
    tags: ['column', 'round', 'circular', 'structural'],
    buildEntities: () => [
      C(200, 200, 200, 'Columns'),
      L(0, 200, 400, 200, 'Columns'), L(200, 0, 200, 400, 'Columns'),
    ],
  },
  {
    name: 'Steel I-Beam',
    category: 'structural', description: 'Steel I-beam section, 300x150mm', width: 300, height: 150,
    tags: ['beam', 'i-beam', 'steel', 'structural'],
    buildEntities: () => [
      L(0, 0, 300, 0, 'Beams'),       // top flange
      L(0, 150, 300, 150, 'Beams'),  // bottom flange
      R(130, 0, 170, 150, 'Beams'),  // web
    ],
  },
  {
    name: 'Spread Footing',
    category: 'structural', description: 'Spread footing in plan, 1200x1200mm', width: 1200, height: 1200,
    tags: ['footing', 'foundation', 'structural'],
    buildEntities: () => [
      R(0, 0, 1200, 1200, 'Foundation'),     // footing outline
      R(300, 300, 900, 900, 'Foundation'),    // column pad
      L(0, 0, 300, 300, 'Foundation'), L(1200, 0, 900, 300, 'Foundation'),
      L(0, 1200, 300, 900, 'Foundation'), L(1200, 1200, 900, 900, 'Foundation'),
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SITE SYMBOLS
// ═══════════════════════════════════════════════════════════════════════════════
const SITE_ASSETS: AssetEntry[] = [
  {
    name: 'Parking Space',
    category: 'site', description: 'Standard parking space, 2500x5000mm', width: 2500, height: 5000,
    tags: ['parking', 'car', 'site'],
    buildEntities: () => [
      L(0, 0, 0, 5000, 'Paving'),
      L(2500, 0, 2500, 5000, 'Paving'),
      L(0, 0, 2500, 0, 'Paving'),
    ],
  },
  {
    name: 'Handicap Parking',
    category: 'site', description: 'ADA accessible parking space, 3600x5000mm', width: 3600, height: 5000,
    tags: ['parking', 'handicap', 'ada', 'accessible', 'site'],
    buildEntities: () => [
      L(0, 0, 0, 5000, 'Paving'),
      L(3600, 0, 3600, 5000, 'Paving'),
      L(0, 0, 3600, 0, 'Paving'),
      L(2500, 0, 2500, 5000, 'Paving'),  // access aisle line
      // Wheelchair symbol area
      R(700, 1800, 1800, 3200, 'Paving'),
      C(1250, 2500, 300, 'Paving'),
    ],
  },
  {
    name: 'Tree (Deciduous)',
    category: 'site', description: 'Deciduous tree, ⌀4000mm canopy', width: 4000, height: 4000,
    tags: ['tree', 'deciduous', 'landscape', 'site'],
    buildEntities: () => [
      C(2000, 2000, 2000, 'Landscape'),   // canopy
      C(2000, 2000, 200, 'Landscape'),    // trunk
    ],
  },
  {
    name: 'Shrub',
    category: 'site', description: 'Ornamental shrub, ⌀1500mm', width: 1500, height: 1500,
    tags: ['shrub', 'bush', 'landscape', 'site'],
    buildEntities: () => {
      const ents: AnyEntity[] = [];
      ents.push(C(750, 750, 750, 'Landscape'));
      // Wavy interior
      ents.push(A(500, 750, 400, 0, Math.PI, 'Landscape'));
      ents.push(A(1000, 750, 400, Math.PI, Math.PI * 2, 'Landscape'));
      return ents;
    },
  },
  {
    name: 'North Arrow',
    category: 'site', description: 'North arrow indicator', width: 400, height: 600,
    tags: ['north', 'arrow', 'compass', 'site'],
    buildEntities: () => [
      PL([{ x: 200, y: 0 }, { x: 300, y: 600 }, { x: 200, y: 450 }, { x: 100, y: 600 }], true, 'Annotation'),
      L(200, 0, 200, -100, 'Annotation'),  // top line
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════════

export const ALL_ASSETS: AssetEntry[] = [
  ...DOOR_ASSETS,
  ...WINDOW_ASSETS,
  ...FURNITURE_LIVING,
  ...FURNITURE_BEDROOM,
  ...FURNITURE_DINING,
  ...FURNITURE_OFFICE,
  ...KITCHEN_ASSETS,
  ...BATHROOM_ASSETS,
  ...ELECTRICAL_ASSETS,
  ...PLUMBING_ASSETS,
  ...HVAC_ASSETS,
  ...ROOF_ASSETS,
  ...STAIR_ASSETS,
  ...STRUCTURAL_ASSETS,
  ...SITE_ASSETS,
];

export const ASSET_CATEGORIES: { key: AssetCategory; label: string }[] = [
  { key: 'doors', label: 'Doors' },
  { key: 'windows', label: 'Windows' },
  { key: 'furniture-living', label: 'Living Room' },
  { key: 'furniture-bedroom', label: 'Bedroom' },
  { key: 'furniture-dining', label: 'Dining' },
  { key: 'furniture-office', label: 'Office' },
  { key: 'kitchen', label: 'Kitchen' },
  { key: 'bathroom', label: 'Bathroom' },
  { key: 'electrical', label: 'Electrical' },
  { key: 'plumbing', label: 'Plumbing' },
  { key: 'hvac', label: 'HVAC' },
  { key: 'roofs', label: 'Roof Plans' },
  { key: 'stairs', label: 'Stairs' },
  { key: 'structural', label: 'Structural' },
  { key: 'site', label: 'Site' },
];

/** Convert an AssetEntry into a BlockDef ready for insertion */
export function assetToBlockDef(asset: AssetEntry): BlockDef {
  return {
    name: asset.name,
    basePoint: { x: 0, y: 0 },
    entities: asset.buildEntities(),
    description: asset.description,
  };
}

/** Search assets by query string (matches name, tags, description) */
export function searchAssets(query: string): AssetEntry[] {
  const q = query.toLowerCase().trim();
  if (!q) return ALL_ASSETS;
  return ALL_ASSETS.filter(a =>
    a.name.toLowerCase().includes(q) ||
    a.description.toLowerCase().includes(q) ||
    a.tags.some(t => t.includes(q))
  );
}
