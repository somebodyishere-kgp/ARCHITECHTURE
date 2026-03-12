import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { SSRPass } from 'three/addons/postprocessing/SSRPass.js';
import { TAARenderPass } from 'three/addons/postprocessing/TAARenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { CSM } from 'three/addons/csm/CSM.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';
import {
  RefreshCw, Sun, Camera, Layers, Settings2, Play, Box, FileText, Download,
  Eye, EyeOff, Grid3X3, Move, RotateCw, RotateCcw, Maximize, MousePointer, Crosshair,
  Scissors, Copy, Trash2, Ruler, ArrowUp, ArrowDown, ChevronDown, Minus, Plus,
  Navigation, AlertTriangle, Split, Edit3, ZoomIn, ZoomOut, Home, Lightbulb
} from 'lucide-react';
import {
  FloorPlan, ADFProject, AnyEntity, Vec2,
  WallEntity, DoorEntity, WindowEntity, ColumnEntity, BeamEntity,
  SlabEntity, RoofEntity, StairEntity, RampEntity, CurtainWallEntity,
  RailingEntity, CeilingEntity, RoomEntity, ZoneEntity,
  FurnitureEntity, ApplianceEntity, FixtureEntity,
  StructuralMemberEntity, FootingEntity, PileEntity, RetainingWallEntity,
  PipeEntity, DuctEntity, ConduitEntity, CableTrayEntity, MEPDeviceEntity,
  FenceSiteEntity, LandscapeEntity, PavingEntity,
  SectionMarkEntity, ElevationMarkEntity,
  LineEntity, CircleEntity, ArcEntity, RectangleEntity, PolylineEntity,
  dist
} from '../lib/adf';
import './ThreeDTab.css';

// ─── Material palette ───────────────────────────────────────────────────────
const MAT_PALETTE: Record<string, { color: number; roughness: number; metalness: number; opacity?: number }> = {
  concrete:    { color: 0xa09080, roughness: 0.9, metalness: 0.0 },
  masonry:     { color: 0xb89080, roughness: 0.85, metalness: 0.0 },
  steel:       { color: 0x8090a0, roughness: 0.3, metalness: 0.8 },
  timber:      { color: 0xc09060, roughness: 0.8, metalness: 0.0 },
  glass:       { color: 0x7dd3fc, roughness: 0.1, metalness: 0.1, opacity: 0.35 },
  aluminium:   { color: 0xb0b8c0, roughness: 0.25, metalness: 0.9 },
  drywall:     { color: 0xe8e0d8, roughness: 0.95, metalness: 0.0 },
  carpet:      { color: 0x708060, roughness: 1.0, metalness: 0.0 },
  tile:        { color: 0xd0c8c0, roughness: 0.4, metalness: 0.0 },
  wood_floor:  { color: 0xb08050, roughness: 0.7, metalness: 0.0 },
  metal_panel: { color: 0x607080, roughness: 0.3, metalness: 0.7 },
  brick:       { color: 0xa05030, roughness: 0.9, metalness: 0.0 },
  stone:       { color: 0x908878, roughness: 0.85, metalness: 0.05 },
  insulation:  { color: 0xe8c850, roughness: 1.0, metalness: 0.0 },
  copper:      { color: 0xb87333, roughness: 0.3, metalness: 0.9 },
  pvc:         { color: 0xd0d0d8, roughness: 0.7, metalness: 0.0 },
};

// ─── BIM tool modes ─────────────────────────────────────────────────────────
type Tool3D =
  | 'select' | 'pan' | 'orbit'
  | 'wall' | 'slab' | 'column' | 'beam' | 'roof' | 'stair' | 'ramp'
  | 'door' | 'window' | 'curtainwall' | 'railing' | 'ceiling'
  | 'furniture' | 'fixture'
  | 'pipe' | 'duct'
  | 'move' | 'rotate' | 'scale' | 'copy' | 'delete'
  | 'measure' | 'section_cut' | 'elevation_cut'
  | 'walkthrough';

type ViewMode = 'perspective' | 'top' | 'front' | 'back' | 'left' | 'right' | 'iso_nw' | 'iso_ne' | 'iso_sw' | 'iso_se';
type RenderQuality = 'auto' | 'ultra' | 'balanced' | 'performance';

interface Props {
  floor: FloorPlan;
  project: ADFProject;
  onStatusChange: (s: string) => void;
  onEntityUpdate?: (entities: AnyEntity[]) => void;
}

interface SceneObject {
  id: string; type: string;
  position: [number, number, number];
  size: [number, number, number];
  rotation_y?: number;
  material?: string;
  color: string;
}

interface ChunkBounds {
  min: [number, number, number];
  max: [number, number, number];
  center: [number, number, number];
}

interface InstanceTransformPayload {
  id: string;
  matrix: number[];
}

interface InstanceBatchPayload {
  prototype_type: string;
  prototype_size: [number, number, number];
  material: string;
  color: string;
  instances: InstanceTransformPayload[];
}

interface ChunkPayload {
  scene_id: string;
  chunk_index: number;
  chunk_size: number;
  scene_objects: SceneObject[];
  is_final: boolean;
  bounds: ChunkBounds;
}

interface NativeScenePayload {
  scene_id: string;
  scene_objects: SceneObject[];
  chunk_count: number;
  chunk_size: number;
  first_chunk: SceneObject[];
  native?: {
    mesh_batches?: unknown[];
    instance_batches?: InstanceBatchPayload[];
    metadata?: Record<string, unknown>;
  };
  ambient_light?: { color: string; intensity: number };
  directional_light?: {
    color: string;
    intensity: number;
    position: [number, number, number];
  };
  camera?: {
    position: [number, number, number];
    target: [number, number, number];
  };
}

// ─── Section/Elevation generation ────────────────────────────────────────────
interface SectionLine { start: Vec2; end: Vec2; lookDir: 'left' | 'right'; }
interface SectionResult {
  type: 'section' | 'elevation';
  entities: AnyEntity[];
  label: string;
  clipPlane?: { normal: THREE.Vector3; constant: number };
}

interface ViewPreset {
  id: string;
  name: string;
  cameraPosition: [number, number, number];
  target: [number, number, number];
  renderMode: 'solid' | 'wireframe' | 'clay' | 'realistic' | 'xray';
  renderQuality: RenderQuality;
  sunPosition: { azimuth: number; altitude: number };
}

interface SectionPreset {
  id: string;
  name: string;
  height: number;
}

interface SectionSetPreset {
  id: string;
  name: string;
  heights: number[];
}

interface ElevationPreset {
  id: string;
  name: string;
  direction: 'front' | 'back' | 'left' | 'right';
}

interface WorldPreset {
  id: string;
  name: string;
  renderMode: 'solid' | 'wireframe' | 'clay' | 'realistic' | 'xray';
  renderQuality: RenderQuality;
  sunPosition: { azimuth: number; altitude: number };
  useGeoSun: boolean;
  geoSunParams: { latitude: number; longitude: number; dayOfYear: number; hour: number };
  toggles: {
    showGrid: boolean;
    showAxes: boolean;
    showShadows: boolean;
    enableSSAO: boolean;
    enableSSR: boolean;
    enableTAA: boolean;
    enableCSM: boolean;
    enableSky: boolean;
  };
}

type QuickAssetKind =
  | 'chair'
  | 'desk'
  | 'sofa'
  | 'bed'
  | 'fridge'
  | 'washer'
  | 'sink'
  | 'toilet';

const mmToM = 0.001;

(THREE.BufferGeometry.prototype as any).computeBoundsTree = computeBoundsTree;
(THREE.BufferGeometry.prototype as any).disposeBoundsTree = disposeBoundsTree;
(THREE.Mesh.prototype as any).raycast = acceleratedRaycast;

export default function ThreeDTab({ floor, project, onStatusChange, onEntityUpdate }: Props) {
  const mountRef   = useRef<HTMLDivElement>(null);
  const sceneRef   = useRef<THREE.Scene | null>(null);
  const cameraRef  = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const composerRef = useRef<EffectComposer | null>(null);
  const renderPassRef = useRef<RenderPass | null>(null);
  const ssaoPassRef = useRef<SSAOPass | null>(null);
  const ssrPassRef = useRef<SSRPass | null>(null);
  const taaPassRef = useRef<TAARenderPass | null>(null);
  const csmRef = useRef<CSM | null>(null);
  const skyRef = useRef<Sky | null>(null);
  const governorFrameTimesRef = useRef<number[]>([]);
  const governorScaleRef = useRef(1);
  const governorFrameRef = useRef(0);
  const occlusionCullRef = useRef(false);
  const instancedObjectIdsRef = useRef<Set<string>>(new Set());
  const frameRef   = useRef<number>(0);
  const isDragging = useRef(false);
  const lastMouse  = useRef({ x: 0, y: 0 });
  const orbitAngles = useRef({ theta: Math.PI / 4, phi: Math.PI / 4, radius: 20 });
  const orbitTarget = useRef(new THREE.Vector3(0, 1.5, 0));
  const transformControlRef = useRef<THREE.Object3D | null>(null);
  const sectionClipRef = useRef<THREE.Plane | null>(null);
  const entityMeshMap = useRef<Map<string, THREE.Object3D>>(new Map());
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const axesRef = useRef<THREE.AxesHelper | null>(null);
  const nativeGenerationRef = useRef(0);

  const [isGenerating, setIsGenerating] = useState(false);
  const [hasModel, setHasModel]         = useState(false);
  const [renderMode, setRenderMode]     = useState<'solid' | 'wireframe' | 'clay' | 'realistic' | 'xray'>('solid');
  const [renderQuality, setRenderQuality] = useState<RenderQuality>('auto');
  const [useNativeMesher, setUseNativeMesher] = useState(true);
  const [sceneData, setSceneData]       = useState<NativeScenePayload | null>(null);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [activeTool, setActiveTool]     = useState<Tool3D>('orbit');
  const [viewMode, setViewMode]         = useState<ViewMode>('perspective');
  const [showGrid, setShowGrid]         = useState(true);
  const [showAxes, setShowAxes]         = useState(true);
  const [showShadows, setShowShadows]   = useState(true);
  const [enableSSAO, setEnableSSAO]     = useState(false);
  const [enableSSR, setEnableSSR]       = useState(false);
  const [enableTAA, setEnableTAA]       = useState(false);
  const [enableCSM, setEnableCSM]       = useState(false);
  const [enableSky, setEnableSky]       = useState(true);
  const [enableGovernor, setEnableGovernor] = useState(true);
  const [enableOcclusionThrottle, setEnableOcclusionThrottle] = useState(true);
  const [frameTimeMs, setFrameTimeMs]   = useState(0);
  const [showSectionPlane, setShowSectionPlane] = useState(false);
  const [isIsolationActive, setIsIsolationActive] = useState(false);
  const [sectionHeight, setSectionHeight] = useState(1.2); // meters
  const [activeSectionHeights, setActiveSectionHeights] = useState<number[]>([]);
  const [sectionPresets, setSectionPresets] = useState<SectionPreset[]>([]);
  const [newSectionPresetName, setNewSectionPresetName] = useState('');
  const [sectionSetPresets, setSectionSetPresets] = useState<SectionSetPreset[]>([]);
  const [newSectionSetName, setNewSectionSetName] = useState('');
  const [sectionSetCount, setSectionSetCount] = useState(3);
  const [sectionSetSpacing, setSectionSetSpacing] = useState(0.6);
  const [elevationPresets, setElevationPresets] = useState<ElevationPreset[]>([]);
  const [newElevationPresetName, setNewElevationPresetName] = useState('');
  const [newElevationDirection, setNewElevationDirection] = useState<'front' | 'back' | 'left' | 'right'>('front');
  const [sectionResults, setSectionResults] = useState<SectionResult[]>([]);
  const [viewPresets, setViewPresets] = useState<ViewPreset[]>([]);
  const [newPresetName, setNewPresetName] = useState('');
  const [worldPresets, setWorldPresets] = useState<WorldPreset[]>([]);
  const [newWorldPresetName, setNewWorldPresetName] = useState('');
  const [visibleCategories, setVisibleCategories] = useState({
    walls: true, slabs: true, roofs: true, columns: true, beams: true,
    stairs: true, doors: true, windows: true, furniture: true, mep: true,
    site: true, rooms: true,
  });
  const [floorVisibility, setFloorVisibility] = useState<Record<string, boolean>>({});
  const [ambientOcclusion, setAmbientOcclusion] = useState(false);
  const [sunPosition, setSunPosition] = useState({ azimuth: 45, altitude: 60 });
  const [useGeoSun, setUseGeoSun] = useState(false);
  const [geoSunParams, setGeoSunParams] = useState({ latitude: 28.6139, longitude: 77.2090, dayOfYear: 172, hour: 13 });

  // ─── New state for advanced features ──────────────────────────
  const [walkthroughMode, setWalkthroughMode] = useState(false);
  const walkthroughKeys = useRef<Set<string>>(new Set());
  const [measurePoints, setMeasurePoints] = useState<THREE.Vector3[]>([]);
  const [measureDistance, setMeasureDistance] = useState<number | null>(null);
  const measureLineRef = useRef<THREE.Line | null>(null);
  const [clashResults, setClashResults] = useState<{ a: string; b: string; point: THREE.Vector3 }[]>([]);
  const [showClashes, setShowClashes] = useState(false);
  const clashMarkersRef = useRef<THREE.Object3D[]>([]);
  const [explodedView, setExplodedView] = useState(false);
  const [explodeFactor, setExplodeFactor] = useState(1.0);
  const [showMultiStory, setShowMultiStory] = useState(false);
  const [editingProperty, setEditingProperty] = useState<{ field: string; value: string } | null>(null);
  const creationStartRef = useRef<THREE.Vector3 | null>(null);
  const creationPreviewRef = useRef<THREE.Mesh | null>(null);
  const [creationStep, setCreationStep] = useState(0);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const gridSnapSize = 250; // mm

  const effectiveQuality = useMemo<Exclude<RenderQuality, 'auto'>>(() => {
    if (renderQuality !== 'auto') return renderQuality;
    const count = floor.entities.length;
    if (count > 3500) return 'performance';
    if (count > 1800) return 'balanced';
    return 'ultra';
  }, [renderQuality, floor.entities.length]);

  const qualityProfile = useMemo(() => {
    if (effectiveQuality === 'performance') {
      return {
        pixelRatioCap: 1.0,
        shadowMapSize: 1024,
        allowSSAO: false,
        ssaoKernelRadius: 8,
        ssaoMinDistance: 0.01,
        ssaoMaxDistance: 0.2,
        exposure: 1.0,
      };
    }
    if (effectiveQuality === 'balanced') {
      return {
        pixelRatioCap: 1.4,
        shadowMapSize: 2048,
        allowSSAO: true,
        ssaoKernelRadius: 12,
        ssaoMinDistance: 0.008,
        ssaoMaxDistance: 0.14,
        exposure: 1.1,
      };
    }
    return {
      pixelRatioCap: 2.0,
      shadowMapSize: 4096,
      allowSSAO: true,
      ssaoKernelRadius: 16,
      ssaoMinDistance: 0.005,
      ssaoMaxDistance: 0.1,
      exposure: 1.2,
    };
  }, [effectiveQuality]);

  // ─── 3D Undo / Redo ──────────────────────────────────────────
  const MAX_UNDO_3D = 50;
  const undoStack3D = useRef<{ label: string; snapshot: string }[]>([]);
  const redoStack3D = useRef<{ label: string; snapshot: string }[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);

  const pushUndo3D = useCallback((label: string) => {
    const snapshot = JSON.stringify(floor.entities);
    undoStack3D.current.push({ label, snapshot });
    if (undoStack3D.current.length > MAX_UNDO_3D) undoStack3D.current.shift();
    redoStack3D.current = [];
    setUndoCount(undoStack3D.current.length);
    setRedoCount(0);
  }, [floor]);

  const undo3D = useCallback(() => {
    if (undoStack3D.current.length === 0) { onStatusChange('Nothing to undo'); return; }
    // Save current state to redo
    redoStack3D.current.push({ label: 'redo', snapshot: JSON.stringify(floor.entities) });
    const entry = undoStack3D.current.pop()!;
    const restored: AnyEntity[] = JSON.parse(entry.snapshot);
    floor.entities.length = 0;
    floor.entities.push(...restored);
    if (onEntityUpdate) onEntityUpdate([...floor.entities]);
    setUndoCount(undoStack3D.current.length);
    setRedoCount(redoStack3D.current.length);
    onStatusChange(`Undo: ${entry.label}`);
  }, [floor, onEntityUpdate, onStatusChange]);

  const redo3D = useCallback(() => {
    if (redoStack3D.current.length === 0) { onStatusChange('Nothing to redo'); return; }
    undoStack3D.current.push({ label: 'redo', snapshot: JSON.stringify(floor.entities) });
    const entry = redoStack3D.current.pop()!;
    const restored: AnyEntity[] = JSON.parse(entry.snapshot);
    floor.entities.length = 0;
    floor.entities.push(...restored);
    if (onEntityUpdate) onEntityUpdate([...floor.entities]);
    setUndoCount(undoStack3D.current.length);
    setRedoCount(redoStack3D.current.length);
    onStatusChange('Redo');
  }, [floor, onEntityUpdate, onStatusChange]);

  // ─── Move/Rotate gizmo state ─────────────────────────────────
  const moveStartRef = useRef<THREE.Vector3 | null>(null);
  const moveEntityStartRef = useRef<{ x: number; y: number; x1?: number; y1?: number; x2?: number; y2?: number; points?: Vec2[] } | null>(null);
  const rotateStartAngleRef = useRef<number>(0);
  const rotateEntityStartRef = useRef<number>(0);
  const gizmoRef = useRef<THREE.Group | null>(null);

  // ─── Helper: create material from palette ──────────────────────────────
  const makeMaterial = useCallback((key: string, overrides?: Partial<THREE.MeshStandardMaterialParameters>) => {
    const p = MAT_PALETTE[key] || MAT_PALETTE.concrete;
    const params: THREE.MeshStandardMaterialParameters = {
      color: p.color, roughness: p.roughness, metalness: p.metalness,
      wireframe: renderMode === 'wireframe',
      ...(p.opacity !== undefined ? { transparent: true, opacity: p.opacity } : {}),
      ...overrides,
    };
    if (renderMode === 'clay') { params.color = 0xd0c8c0; params.roughness = 1; params.metalness = 0; }
    if (renderMode === 'xray') { params.transparent = true; params.opacity = 0.15; params.depthWrite = false; }
    return new THREE.MeshStandardMaterial(params);
  }, [renderMode]);

  // ─── Initialize Three.js scene ────────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const W = mount.clientWidth, H = mount.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0f15);
    scene.fog = new THREE.FogExp2(0x0a0f15, 0.008);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(55, W / H, 0.01, 2000);
    camera.position.set(12, 8, 12);
    camera.lookAt(0, 1.5, 0);
    cameraRef.current = camera;

    // Renderer — high quality
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, qualityProfile.pixelRatioCap));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // ─── Post-processing chain ───
    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);
    const ssaoPass = new SSAOPass(scene, camera, W, H);
    ssaoPass.kernelRadius = 16;
    ssaoPass.minDistance = 0.005;
    ssaoPass.maxDistance = 0.1;
    ssaoPass.enabled = false; // off by default
    composer.addPass(ssaoPass);

    const taaPass = new TAARenderPass(scene, camera);
    taaPass.sampleLevel = effectiveQuality === 'ultra' ? 2 : 1;
    taaPass.unbiased = true;
    taaPass.enabled = false;
    composer.addPass(taaPass);

    const ssrPass = new SSRPass({
      renderer,
      scene,
      camera,
      width: W,
      height: H,
      groundReflector: null,
      selects: null,
    });
    ssrPass.enabled = false;
    (ssrPass as any).maxDistance = 28;
    (ssrPass as any).thickness = 0.018;
    composer.addPass(ssrPass);

    composer.addPass(new OutputPass());
    composerRef.current = composer;
    renderPassRef.current = renderPass;
    ssaoPassRef.current = ssaoPass;
    taaPassRef.current = taaPass;
    ssrPassRef.current = ssrPass;

    // ─── Lighting rig ───
    // Ambient hemisphere
    const hemi = new THREE.HemisphereLight(0xddeeff, 0x445566, 0.6);
    hemi.name = 'hemi';
    scene.add(hemi);

    // Main sun
    const sun = new THREE.DirectionalLight(0xfff5e6, 3.0);
    sun.name = 'sun';
    sun.position.set(15, 25, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(qualityProfile.shadowMapSize, qualityProfile.shadowMapSize);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 200;
    sun.shadow.camera.left = -60;
    sun.shadow.camera.right = 60;
    sun.shadow.camera.top = 60;
    sun.shadow.camera.bottom = -60;
    sun.shadow.bias = -0.0002;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);
    scene.add(sun.target);

    // Fill light
    const fill = new THREE.DirectionalLight(0x8bbfe8, 0.6);
    fill.position.set(-10, 5, -10);
    scene.add(fill);

    // Rim / back light
    const rim = new THREE.DirectionalLight(0xffeedd, 0.3);
    rim.position.set(0, 3, -15);
    scene.add(rim);

    // Physical sky dome (can be toggled)
    const sky = new Sky();
    sky.scale.setScalar(450000);
    sky.name = 'sky';
    scene.add(sky);
    skyRef.current = sky;

    const skyUniforms = (sky.material as THREE.ShaderMaterial).uniforms;
    skyUniforms['turbidity'].value = 9;
    skyUniforms['rayleigh'].value = 2.2;
    skyUniforms['mieCoefficient'].value = 0.004;
    skyUniforms['mieDirectionalG'].value = 0.8;

    // Optional cascaded shadows for large scenes
    const csm = new CSM({
      camera,
      parent: scene,
      cascades: effectiveQuality === 'ultra' ? 4 : 3,
      maxFar: Math.min(camera.far, 600),
      mode: 'practical',
      shadowMapSize: qualityProfile.shadowMapSize,
      lightDirection: new THREE.Vector3(0.6, -1.0, 0.4).normalize(),
      lightIntensity: 1.3,
      lightNear: 1,
      lightFar: 600,
    });
    csm.fade = true;
    csmRef.current = csm;

    // Ground grid
    const grid = new THREE.GridHelper(100, 100, 0x1a2030, 0x141a24);
    (grid.material as THREE.Material).opacity = 0.3;
    (grid.material as THREE.Material).transparent = true;
    grid.name = 'grid';
    gridRef.current = grid;
    scene.add(grid);

    // Axes helper
    const axes = new THREE.AxesHelper(5);
    axes.name = 'axes';
    axesRef.current = axes;
    scene.add(axes);

    // Ground plane (shadow receiver)
    const groundGeo = new THREE.PlaneGeometry(200, 200);
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.3 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.name = 'ground';
    scene.add(ground);

    // Environment map for reflections (simple gradient)
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0x1a2030);
    const envMap = pmrem.fromScene(envScene, 0.04).texture;
    scene.environment = envMap;
    pmrem.dispose();

    // Animation loop
    const clock = new THREE.Clock();
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const dtMs = delta * 1000;
      governorFrameTimesRef.current.push(dtMs);
      if (governorFrameTimesRef.current.length > 45) governorFrameTimesRef.current.shift();
      governorFrameRef.current += 1;
      if (governorFrameRef.current % 10 === 0) {
        setFrameTimeMs(prev => prev * 0.85 + dtMs * 0.15);
      }

      if (enableCSM && csmRef.current) {
        csmRef.current.update();
      }

      if (enableGovernor && governorFrameRef.current % 20 === 0 && governorFrameTimesRef.current.length > 10) {
        const avg = governorFrameTimesRef.current.reduce((acc, v) => acc + v, 0) / governorFrameTimesRef.current.length;
        const rendererNext = rendererRef.current;
        if (rendererNext) {
          if (avg > 28 && governorScaleRef.current > 0.6) {
            governorScaleRef.current = Math.max(0.6, governorScaleRef.current - 0.08);
            rendererNext.setPixelRatio(Math.min(window.devicePixelRatio, qualityProfile.pixelRatioCap) * governorScaleRef.current);
            occlusionCullRef.current = true;
          } else if (avg < 16 && governorScaleRef.current < 1.0) {
            governorScaleRef.current = Math.min(1.0, governorScaleRef.current + 0.04);
            rendererNext.setPixelRatio(Math.min(window.devicePixelRatio, qualityProfile.pixelRatioCap) * governorScaleRef.current);
            if (governorScaleRef.current > 0.9) occlusionCullRef.current = false;
          }

          if (avg > 30 && ssrPassRef.current?.enabled) {
            ssrPassRef.current.enabled = false;
          }
          if (avg > 34 && taaPassRef.current?.enabled) {
            taaPassRef.current.enabled = false;
          }
        }
      }

      if (enableOcclusionThrottle && occlusionCullRef.current && cameraRef.current && governorFrameRef.current % 8 === 0) {
        const cam = cameraRef.current.position;
        scene.traverse(obj => {
          if (!(obj instanceof THREE.Mesh) || !obj.userData?.archflow) return;
          if (obj.userData?.entityType === 'wall' || obj.userData?.entityType === 'slab' || obj.userData?.entityType === 'roof') {
            obj.visible = true;
            return;
          }
          const distSq = obj.position.distanceToSquared(cam);
          obj.visible = distSq < 2500;
        });
      }

      // Section clipping plane
      if (sectionClipRef.current && renderer.clippingPlanes.length > 0) {
        renderer.clippingPlanes = [sectionClipRef.current];
      }
      if (ssaoPass.enabled || ssrPass.enabled || taaPass.enabled) {
        composer.render();
      } else {
        renderer.render(scene, camera);
      }
    };
    animate();

    // Resize observer
    const obs = new ResizeObserver(() => {
      const nW = mount.clientWidth, nH = mount.clientHeight;
      renderer.setSize(nW, nH);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, qualityProfile.pixelRatioCap));
      composer.setSize(nW, nH);
      camera.aspect = nW / nH;
      camera.updateProjectionMatrix();
    });
    obs.observe(mount);

    return () => {
      cancelAnimationFrame(frameRef.current);
      obs.disconnect();
      renderer.dispose();
      csm.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [effectiveQuality, enableCSM, enableGovernor, enableOcclusionThrottle, qualityProfile.pixelRatioCap, qualityProfile.shadowMapSize]);

  // ─── Renderer quality profile ─────────────────────────────────────
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, qualityProfile.pixelRatioCap));

    const sun = sceneRef.current?.getObjectByName('sun') as THREE.DirectionalLight | undefined;
    if (sun) {
      sun.shadow.mapSize.set(qualityProfile.shadowMapSize, qualityProfile.shadowMapSize);
      if (sun.shadow.map) sun.shadow.map.dispose();
      sun.shadow.needsUpdate = true;
    }

    if (ssaoPassRef.current) {
      ssaoPassRef.current.kernelRadius = qualityProfile.ssaoKernelRadius;
      ssaoPassRef.current.minDistance = qualityProfile.ssaoMinDistance;
      ssaoPassRef.current.maxDistance = qualityProfile.ssaoMaxDistance;
    }
  }, [qualityProfile]);

  // ─── Grid / Axes visibility ─────────────────────────────────────────
  useEffect(() => {
    if (gridRef.current) gridRef.current.visible = showGrid;
    if (axesRef.current) axesRef.current.visible = showAxes;
  }, [showGrid, showAxes]);

  // ─── Shadow toggle ─────────────────────────────────────────────────
  useEffect(() => {
    if (!rendererRef.current) return;
    rendererRef.current.shadowMap.enabled = showShadows;
    sceneRef.current?.traverse(c => {
      if (c instanceof THREE.Mesh) { c.castShadow = showShadows; c.receiveShadow = showShadows; }
    });
  }, [showShadows]);

  // ─── SSAO toggle ─────────────────────────────────────────────────
  useEffect(() => {
    if (ssaoPassRef.current) ssaoPassRef.current.enabled = enableSSAO && qualityProfile.allowSSAO;
  }, [enableSSAO, qualityProfile.allowSSAO]);

  // ─── Advanced post-process toggles ──────────────────────────────
  useEffect(() => {
    if (taaPassRef.current) {
      taaPassRef.current.enabled = enableTAA && effectiveQuality !== 'performance';
      taaPassRef.current.sampleLevel = effectiveQuality === 'ultra' ? 2 : 1;
    }
  }, [enableTAA, effectiveQuality]);

  useEffect(() => {
    if (ssrPassRef.current) {
      ssrPassRef.current.enabled = enableSSR && effectiveQuality !== 'performance';
    }
  }, [enableSSR, effectiveQuality]);

  useEffect(() => {
    if (csmRef.current) {
      csmRef.current.fade = true;
      csmRef.current.lightIntensity = enableCSM ? 1.3 : 0.0;
    }
  }, [enableCSM]);

  useEffect(() => {
    if (enableOcclusionThrottle) return;
    occlusionCullRef.current = false;
    sceneRef.current?.traverse(obj => {
      if (obj.userData?.archflow) {
        obj.visible = true;
      }
    });
  }, [enableOcclusionThrottle]);

  useEffect(() => {
    if (skyRef.current) {
      skyRef.current.visible = enableSky;
      if (sceneRef.current) {
        sceneRef.current.fog = enableSky
          ? new THREE.FogExp2(0x90a4bf, 0.003)
          : new THREE.FogExp2(0x0a0f15, 0.008);
      }
    }
  }, [enableSky]);

  // ─── Section plane ─────────────────────────────────────────────────
  useEffect(() => {
    const r = rendererRef.current;
    if (!r) return;
    if (showSectionPlane) {
      const heights = activeSectionHeights.length > 0 ? activeSectionHeights : [sectionHeight];
      const planes = heights.map(h => new THREE.Plane(new THREE.Vector3(0, -1, 0), h));
      sectionClipRef.current = planes[0] || null;
      r.clippingPlanes = planes;
      r.localClippingEnabled = true;
    } else {
      sectionClipRef.current = null;
      r.clippingPlanes = [];
    }
  }, [showSectionPlane, sectionHeight, activeSectionHeights]);

  // ─── Camera controls ──────────────────────────────────────────────
  const updateCamera = useCallback(() => {
    if (!cameraRef.current) return;
    const a = orbitAngles.current, t = orbitTarget.current;
    cameraRef.current.position.set(
      t.x + a.radius * Math.sin(a.theta) * Math.cos(a.phi),
      t.y + a.radius * Math.sin(a.phi),
      t.z + a.radius * Math.cos(a.theta) * Math.cos(a.phi)
    );
    cameraRef.current.lookAt(t);
  }, []);

  const setView = useCallback((view: ViewMode) => {
    setViewMode(view);
    const a = orbitAngles.current;
    switch (view) {
      case 'perspective': a.theta = Math.PI / 4; a.phi = Math.PI / 4; break;
      case 'top':         a.theta = 0; a.phi = Math.PI / 2 - 0.001; break;
      case 'front':       a.theta = 0; a.phi = 0.001; break;
      case 'back':        a.theta = Math.PI; a.phi = 0.001; break;
      case 'left':        a.theta = -Math.PI / 2; a.phi = 0.001; break;
      case 'right':       a.theta = Math.PI / 2; a.phi = 0.001; break;
      case 'iso_nw':      a.theta = 3 * Math.PI / 4; a.phi = Math.PI / 5; break;
      case 'iso_ne':      a.theta = Math.PI / 4; a.phi = Math.PI / 5; break;
      case 'iso_sw':      a.theta = -3 * Math.PI / 4; a.phi = Math.PI / 5; break;
      case 'iso_se':      a.theta = -Math.PI / 4; a.phi = Math.PI / 5; break;
    }
    updateCamera();
  }, [updateCamera]);

  const focusSelectedObject = useCallback(() => {
    if (!selectedObjectId || !cameraRef.current) return;
    const obj = entityMeshMap.current.get(selectedObjectId);
    if (!obj) return;
    const box = new THREE.Box3().setFromObject(obj);
    if (box.isEmpty()) return;
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    orbitTarget.current.copy(center);
    orbitAngles.current.radius = Math.max(2.5, Math.max(size.x, size.y, size.z) * 2.2);
    updateCamera();
    onStatusChange(`Focused: ${selectedObjectId}`);
  }, [onStatusChange, selectedObjectId, updateCamera]);

  const isolateSelectedObject = useCallback(() => {
    if (!selectedObjectId || !sceneRef.current) return;
    sceneRef.current.traverse(obj => {
      if (!obj.userData?.archflow) return;
      obj.visible = obj.userData?.id === selectedObjectId;
    });
    setIsIsolationActive(true);
    onStatusChange(`Isolated: ${selectedObjectId}`);
  }, [onStatusChange, selectedObjectId]);

  const clearIsolation = useCallback(() => {
    if (!sceneRef.current) return;
    sceneRef.current.traverse(obj => {
      if (obj.userData?.archflow) obj.visible = true;
    });
    setIsIsolationActive(false);
    onStatusChange('Isolation cleared');
  }, [onStatusChange]);

  const saveCurrentViewPreset = useCallback(() => {
    if (!cameraRef.current) return;
    const name = newPresetName.trim() || `Scene ${viewPresets.length + 1}`;
    const cam = cameraRef.current.position;
    const t = orbitTarget.current;
    const preset: ViewPreset = {
      id: `view_${Date.now().toString(36)}`,
      name,
      cameraPosition: [cam.x, cam.y, cam.z],
      target: [t.x, t.y, t.z],
      renderMode,
      renderQuality,
      sunPosition,
    };
    setViewPresets(prev => [...prev.slice(-7), preset]);
    setNewPresetName('');
    onStatusChange(`Saved view preset: ${name}`);
  }, [newPresetName, onStatusChange, renderMode, renderQuality, sunPosition, viewPresets.length]);

  const applyViewPreset = useCallback((preset: ViewPreset) => {
    if (!cameraRef.current) return;
    const [cx, cy, cz] = preset.cameraPosition;
    const [tx, ty, tz] = preset.target;
    const dx = cx - tx;
    const dy = cy - ty;
    const dz = cz - tz;
    const radius = Math.max(0.001, Math.sqrt(dx * dx + dy * dy + dz * dz));
    const theta = Math.atan2(dx, dz);
    const phi = Math.asin(Math.max(-1, Math.min(1, dy / radius)));

    orbitTarget.current.set(tx, ty, tz);
    orbitAngles.current = { theta, phi, radius };
    cameraRef.current.position.set(cx, cy, cz);
    cameraRef.current.lookAt(tx, ty, tz);
    setRenderMode(preset.renderMode);
    setRenderQuality(preset.renderQuality);
    setSunPosition(preset.sunPosition);
    onStatusChange(`Applied view preset: ${preset.name}`);
  }, [onStatusChange]);

  const deleteViewPreset = useCallback((id: string) => {
    setViewPresets(prev => prev.filter(p => p.id !== id));
  }, []);

  const saveSectionPreset = useCallback(() => {
    const name = newSectionPresetName.trim() || `Cut ${sectionPresets.length + 1}`;
    const preset: SectionPreset = {
      id: `section_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      height: sectionHeight,
    };
    setSectionPresets(prev => [...prev.slice(-5), preset]);
    setNewSectionPresetName('');
    onStatusChange(`Saved section preset: ${name}`);
  }, [newSectionPresetName, onStatusChange, sectionHeight, sectionPresets.length]);

  const applySectionPreset = useCallback((preset: SectionPreset) => {
    setShowSectionPlane(true);
    setActiveSectionHeights([]);
    setSectionHeight(preset.height);
    onStatusChange(`Applied section preset: ${preset.name}`);
  }, [onStatusChange]);

  const removeSectionPreset = useCallback((id: string) => {
    setSectionPresets(prev => prev.filter(p => p.id !== id));
  }, []);

  const saveSectionSetPreset = useCallback(() => {
    const count = Math.max(2, Math.min(10, sectionSetCount));
    const spacing = Math.max(0.2, Math.min(3, sectionSetSpacing));
    const heights = Array.from({ length: count }, (_, i) => sectionHeight + i * spacing);
    const name = newSectionSetName.trim() || `Stack ${sectionSetPresets.length + 1}`;
    const preset: SectionSetPreset = {
      id: `section_set_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      heights,
    };
    setSectionSetPresets(prev => [...prev.slice(-5), preset]);
    setNewSectionSetName('');
    onStatusChange(`Saved section set: ${name}`);
  }, [newSectionSetName, onStatusChange, sectionHeight, sectionSetCount, sectionSetPresets.length, sectionSetSpacing]);

  const applySectionSetPreset = useCallback((preset: SectionSetPreset) => {
    setShowSectionPlane(true);
    setActiveSectionHeights(preset.heights);
    if (preset.heights[0] !== undefined) setSectionHeight(preset.heights[0]);
    onStatusChange(`Applied section set: ${preset.name}`);
  }, [onStatusChange]);

  const clearSectionSetPreset = useCallback(() => {
    setActiveSectionHeights([]);
    onStatusChange('Returned to single section plane mode.');
  }, [onStatusChange]);

  const removeSectionSetPreset = useCallback((id: string) => {
    setSectionSetPresets(prev => prev.filter(p => p.id !== id));
  }, []);

  const saveElevationPreset = useCallback(() => {
    const name = newElevationPresetName.trim() || `Elevation ${elevationPresets.length + 1}`;
    const preset: ElevationPreset = {
      id: `elevation_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      direction: newElevationDirection,
    };
    setElevationPresets(prev => [...prev.slice(-7), preset]);
    setNewElevationPresetName('');
    onStatusChange(`Saved elevation preset: ${name}`);
  }, [elevationPresets.length, newElevationDirection, newElevationPresetName, onStatusChange]);

  const applyElevationPreset = useCallback((preset: ElevationPreset) => {
    setView(preset.direction);
    onStatusChange(`Applied elevation preset: ${preset.name}`);
  }, [onStatusChange, setView]);

  const removeElevationPreset = useCallback((id: string) => {
    setElevationPresets(prev => prev.filter(p => p.id !== id));
  }, []);

  const saveWorldPreset = useCallback(() => {
    const name = newWorldPresetName.trim() || `World ${worldPresets.length + 1}`;
    const preset: WorldPreset = {
      id: `world_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      renderMode,
      renderQuality,
      sunPosition,
      useGeoSun,
      geoSunParams,
      toggles: {
        showGrid,
        showAxes,
        showShadows,
        enableSSAO,
        enableSSR,
        enableTAA,
        enableCSM,
        enableSky,
      },
    };
    setWorldPresets(prev => [...prev.slice(-5), preset]);
    setNewWorldPresetName('');
    onStatusChange(`Saved world preset: ${name}`);
  }, [newWorldPresetName, worldPresets.length, renderMode, renderQuality, sunPosition, useGeoSun, geoSunParams, showGrid, showAxes, showShadows, enableSSAO, enableSSR, enableTAA, enableCSM, enableSky, onStatusChange]);

  const applyWorldPreset = useCallback((preset: WorldPreset) => {
    setRenderMode(preset.renderMode);
    setRenderQuality(preset.renderQuality);
    setSunPosition(preset.sunPosition);
    setUseGeoSun(preset.useGeoSun);
    setGeoSunParams(preset.geoSunParams);
    setShowGrid(preset.toggles.showGrid);
    setShowAxes(preset.toggles.showAxes);
    setShowShadows(preset.toggles.showShadows);
    setEnableSSAO(preset.toggles.enableSSAO);
    setEnableSSR(preset.toggles.enableSSR);
    setEnableTAA(preset.toggles.enableTAA);
    setEnableCSM(preset.toggles.enableCSM);
    setEnableSky(preset.toggles.enableSky);
    onStatusChange(`Applied world preset: ${preset.name}`);
  }, [onStatusChange]);

  const removeWorldPreset = useCallback((id: string) => {
    setWorldPresets(prev => prev.filter(p => p.id !== id));
  }, []);

  const sharePresetBundle = useCallback(async () => {
    const payload = {
      version: 1,
      viewPresets,
      sectionPresets,
      sectionSetPresets,
      elevationPresets,
      worldPresets,
    };
    const text = JSON.stringify(payload);
    try {
      await navigator.clipboard.writeText(text);
      onStatusChange('3D preset bundle copied to clipboard.');
    } catch {
      window.prompt('Copy shared preset JSON:', text);
      onStatusChange('Preset bundle ready to share.');
    }
  }, [elevationPresets, onStatusChange, sectionPresets, sectionSetPresets, viewPresets, worldPresets]);

  const importPresetBundle = useCallback(() => {
    const raw = window.prompt('Paste shared preset JSON');
    if (!raw) return;
    try {
      const payload = JSON.parse(raw) as {
        viewPresets?: ViewPreset[];
        sectionPresets?: SectionPreset[];
        sectionSetPresets?: SectionSetPreset[];
        elevationPresets?: ElevationPreset[];
        worldPresets?: WorldPreset[];
      };
      if (Array.isArray(payload.viewPresets)) setViewPresets(payload.viewPresets.slice(-8));
      if (Array.isArray(payload.sectionPresets)) setSectionPresets(payload.sectionPresets.slice(-6));
      if (Array.isArray(payload.sectionSetPresets)) setSectionSetPresets(payload.sectionSetPresets.slice(-6));
      if (Array.isArray(payload.elevationPresets)) setElevationPresets(payload.elevationPresets.slice(-8));
      if (Array.isArray(payload.worldPresets)) setWorldPresets(payload.worldPresets.slice(-6));
      onStatusChange('Imported shared 3D presets.');
    } catch {
      onStatusChange('Invalid preset JSON.');
    }
  }, [onStatusChange]);

  const insertQuickAsset = useCallback((kind: QuickAssetKind) => {
    const anchor = orbitTarget.current;
    const baseX = Math.round(anchor.x * 1000);
    const baseY = Math.round(anchor.z * 1000);
    const offset = (Math.random() - 0.5) * 1200;
    const id = `${kind}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    let entity: AnyEntity | null = null;

    switch (kind) {
      case 'chair':
        entity = { id, type: 'furniture', layer: 'A-Furniture', x: baseX + offset, y: baseY + offset, width: 500, depth: 500, rotation: 0, category: 'chair', name: 'Chair' } as FurnitureEntity;
        break;
      case 'desk':
        entity = { id, type: 'furniture', layer: 'A-Furniture', x: baseX + offset, y: baseY + offset, width: 1600, depth: 700, rotation: 0, category: 'desk', name: 'Desk' } as FurnitureEntity;
        break;
      case 'sofa':
        entity = { id, type: 'furniture', layer: 'A-Furniture', x: baseX + offset, y: baseY + offset, width: 2000, depth: 900, rotation: 0, category: 'sofa', name: 'Sofa' } as FurnitureEntity;
        break;
      case 'bed':
        entity = { id, type: 'furniture', layer: 'A-Furniture', x: baseX + offset, y: baseY + offset, width: 2000, depth: 1600, rotation: 0, category: 'bed', name: 'Bed' } as FurnitureEntity;
        break;
      case 'fridge':
        entity = { id, type: 'appliance', layer: 'A-Appliance', x: baseX + offset, y: baseY + offset, width: 900, depth: 800, rotation: 0, category: 'fridge', name: 'Fridge' } as ApplianceEntity;
        break;
      case 'washer':
        entity = { id, type: 'appliance', layer: 'A-Appliance', x: baseX + offset, y: baseY + offset, width: 700, depth: 700, rotation: 0, category: 'washer', name: 'Washer' } as ApplianceEntity;
        break;
      case 'sink':
        entity = { id, type: 'fixture', layer: 'A-Fixture', x: baseX + offset, y: baseY + offset, width: 800, depth: 500, rotation: 0, category: 'sink', name: 'Sink' } as FixtureEntity;
        break;
      case 'toilet':
        entity = { id, type: 'fixture', layer: 'A-Fixture', x: baseX + offset, y: baseY + offset, width: 400, depth: 700, rotation: 0, category: 'toilet', name: 'Toilet' } as FixtureEntity;
        break;
    }

    if (!entity) return;
    pushUndo3D(`Insert ${kind}`);
    floor.entities.push(entity);
    if (onEntityUpdate) onEntityUpdate([...floor.entities]);
    buildFromEntities();
    onStatusChange(`Inserted library asset: ${kind}`);
  }, [floor.entities, onEntityUpdate, onStatusChange, pushUndo3D]);

  const fitSunShadowToModel = useCallback(() => {
    const scene = sceneRef.current;
    const sun = scene?.getObjectByName('sun') as THREE.DirectionalLight | null;
    if (!scene || !sun) return;

    const box = new THREE.Box3();
    let found = false;
    scene.traverse(obj => {
      if (!obj.userData?.archflow) return;
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Group) {
        box.expandByObject(obj);
        found = true;
      }
    });
    if (!found || box.isEmpty()) return;

    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const radius = Math.max(8, Math.max(size.x, size.z) * 0.7);
    sun.target.position.set(center.x, 0, center.z);
    sun.target.updateMatrixWorld();

    sun.shadow.camera.left = -radius;
    sun.shadow.camera.right = radius;
    sun.shadow.camera.top = radius;
    sun.shadow.camera.bottom = -radius;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = Math.max(80, size.y * 2 + radius);
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.needsUpdate = true;
  }, []);

  // Orbit controls via mouse
  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    if ((activeTool === 'move' || activeTool === 'rotate') && selectedObjectId) {
      handleGizmoStart(e);
    }
  };
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!cameraRef.current) return;

    // Update creation preview when dragging in creation mode
    if (creationStartRef.current && creationStep === 1) {
      const ground = raycastGround(e);
      if (ground) {
        updateCreationPreview(creationStartRef.current, ground);
      }
    }

    // Move/rotate gizmo drag
    if (isDragging.current && (activeTool === 'move' || activeTool === 'rotate') && selectedObjectId && moveStartRef.current) {
      // Gizmo drag is handled inline here to avoid declaration order issues
      const entity = floor.entities.find(en => en.id === selectedObjectId);
      const ground = raycastGround(e);
      if (entity && ground) {
        if (activeTool === 'move' && moveEntityStartRef.current) {
          const mdx = (ground.x - moveStartRef.current.x) * 1000;
          const mdy = (ground.z - moveStartRef.current.z) * 1000;
          const snap = snapToGrid ? gridSnapSize : 1;
          const snapDx = Math.round(mdx / snap) * snap;
          const snapDy = Math.round(mdy / snap) * snap;
          const start = moveEntityStartRef.current;
          if ('x1' in entity && 'x2' in entity && start.x1 !== undefined && start.x2 !== undefined) {
            (entity as any).x1 = start.x1 + snapDx; (entity as any).x2 = start.x2 + snapDx;
          } else if ('x' in entity) { (entity as any).x = start.x + snapDx; }
          if ('y1' in entity && 'y2' in entity && start.y1 !== undefined && start.y2 !== undefined) {
            (entity as any).y1 = start.y1 + snapDy; (entity as any).y2 = start.y2 + snapDy;
          } else if ('y' in entity && (entity.type as string) !== 'wall') { (entity as any).y = start.y + snapDy; }
          if ('points' in entity && start.points) {
            (entity as any).points = start.points.map((p: Vec2) => ({ x: p.x + snapDx, y: p.y + snapDy }));
          }
          if (onEntityUpdate) onEntityUpdate([...floor.entities]);
          buildFromEntities();
        } else if (activeTool === 'rotate') {
          const cx = ((entity as any).x1 !== undefined && (entity as any).x2 !== undefined)
            ? ((entity as any).x1 + (entity as any).x2) / 2 : (entity as any).x ?? 0;
          const cy = ((entity as any).y1 !== undefined && (entity as any).y2 !== undefined)
            ? ((entity as any).y1 + (entity as any).y2) / 2 : (entity as any).y ?? 0;
          const rdx = ground.x * 1000 - cx, rdy = ground.z * 1000 - cy;
          const currentAngle = Math.atan2(rdy, rdx);
          const delta = currentAngle - rotateStartAngleRef.current;
          (entity as any).rotation = rotateEntityStartRef.current + delta * (180 / Math.PI);
          if (onEntityUpdate) onEntityUpdate([...floor.entities]);
          buildFromEntities();
        }
      }
      return;
    }

    if (!isDragging.current) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    lastMouse.current = { x: e.clientX, y: e.clientY };

    if (walkthroughMode) {
      // Mouse look in walkthrough
      orbitAngles.current.theta -= dx * 0.003;
      return;
    }

    if (activeTool === 'pan' || e.buttons === 4) {
      // Middle-click or pan tool: pan
      const panSpeed = orbitAngles.current.radius * 0.001;
      const right = new THREE.Vector3();
      const up = new THREE.Vector3(0, 1, 0);
      cameraRef.current.getWorldDirection(right);
      right.cross(up).normalize();
      orbitTarget.current.add(right.multiplyScalar(-dx * panSpeed));
      orbitTarget.current.y += dy * panSpeed;
    } else {
      // Orbit
      const a = orbitAngles.current;
      a.theta -= dx * 0.008;
      a.phi = Math.max(0.01, Math.min(Math.PI / 2 - 0.01, a.phi - dy * 0.008));
    }
    updateCamera();
  }, [activeTool, updateCamera, walkthroughMode, creationStep, selectedObjectId]);
  const handleMouseUp = () => { isDragging.current = false; };
  const handleWheel = useCallback((e: React.WheelEvent) => {
    const a = orbitAngles.current;
    const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
    a.radius = Math.max(1, Math.min(200, a.radius * zoomFactor));
    updateCamera();
  }, [updateCamera]);

  // ─── Zoom to fit ─────────────────────────────────────────────────
  const zoomToFit = useCallback(() => {
    if (!sceneRef.current || !cameraRef.current) return;
    const box = new THREE.Box3();
    sceneRef.current.children.forEach(c => {
      if (c.userData['archflow']) box.expandByObject(c);
    });
    if (box.isEmpty()) return;
    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    orbitTarget.current.copy(center);
    orbitAngles.current.radius = maxDim * 1.5;
    updateCamera();
    onStatusChange('Zoomed to fit');
  }, [updateCamera, onStatusChange]);

  // ─── Ground plane raycast helper ──────────────────────────────
  const raycastGround = useCallback((e: React.MouseEvent): THREE.Vector3 | null => {
    if (!cameraRef.current || !mountRef.current) return null;
    const rect = mountRef.current.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, cameraRef.current);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const target = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, target);
    if (!target) return null;
    // Snap to grid
    if (snapToGrid) {
      const snapMM = gridSnapSize;
      const snapM = snapMM * mmToM;
      target.x = Math.round(target.x / snapM) * snapM;
      target.z = Math.round(target.z / snapM) * snapM;
    }
    return target;
  }, [snapToGrid]);

  // ─── Create entity from 3D tool ───────────────────────────────
  const createEntityFromTool = useCallback((tool: Tool3D, start: THREE.Vector3, end: THREE.Vector3) => {
    pushUndo3D(`Create ${tool}`);
    const mToMM = 1000;
    const id = `${tool}_${Date.now().toString(36)}`;
    const x1 = start.x * mToMM, y1 = start.z * mToMM;
    const x2 = end.x * mToMM, y2 = end.z * mToMM;
    let newEntity: AnyEntity | null = null;

    switch (tool) {
      case 'wall':
        newEntity = {
          id, type: 'wall', layer: 'A-Wall',
          x1, y1, x2, y2,
          thickness: 200, height: floor.floorHeight || 3000,
          material: 'concrete', structuralUsage: 'bearing',
        } as WallEntity;
        break;
      case 'column': {
        newEntity = {
          id, type: 'column', layer: 'A-Column',
          x: x1, y: y1, width: 400, depth: 400,
          height: floor.floorHeight || 3000,
          shape: 'rectangular', material: 'concrete', rotation: 0,
        } as ColumnEntity;
        break;
      }
      case 'beam': {
        newEntity = {
          id, type: 'beam', layer: 'S-Beam',
          x1, y1, x2, y2,
          width: 300, depth: 500,
          material: 'concrete', profile: '300x500',
          elevation: floor.floorHeight || 3000,
        } as BeamEntity;
        break;
      }
      case 'slab': {
        const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
        const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
        newEntity = {
          id, type: 'slab', layer: 'A-Slab',
          points: [
            { x: minX, y: minY }, { x: maxX, y: minY },
            { x: maxX, y: maxY }, { x: minX, y: maxY },
          ],
          thickness: 200, elevation: 0, material: 'concrete', slabType: 'floor',
        } as SlabEntity;
        break;
      }
      case 'roof': {
        const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
        const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
        newEntity = {
          id, type: 'roof', layer: 'A-Roof',
          points: [
            { x: minX, y: minY }, { x: maxX, y: minY },
            { x: maxX, y: maxY }, { x: minX, y: maxY },
          ],
          thickness: 150, elevation: floor.floorHeight || 3000,
          roofType: 'gable', pitch: 30, material: 'tile',
        } as RoofEntity;
        break;
      }
      case 'door': {
        newEntity = {
          id, type: 'door', layer: 'A-Door',
          x: x1, y: y1, width: 900, height: 2100,
          doorType: 'single', swing: 0, rotation: 0,
        } as DoorEntity;
        break;
      }
      case 'window': {
        newEntity = {
          id, type: 'window', layer: 'A-Window',
          x: x1, y: y1, width: 1200, height: 1200,
          sillHeight: 900, windowType: 'casement', rotation: 0,
        } as WindowEntity;
        break;
      }
      case 'stair': {
        newEntity = {
          id, type: 'stair', layer: 'A-Stair',
          x: x1, y: y1,
          width: 1000, length: Math.max(2000, Math.abs(x2 - x1)),
          height: floor.floorHeight || 3000,
          treadNumber: 16, riserHeight: 187, treadDepth: 280,
          stairType: 'straight', rotation: 0,
        } as StairEntity;
        break;
      }
      case 'ramp': {
        newEntity = {
          id, type: 'ramp', layer: 'A-Ramp',
          x: x1, y: y1,
          width: 1200, length: Math.max(3000, Math.abs(x2 - x1)),
          height: 600, slope: 1 / 12, rotation: 0,
        } as RampEntity;
        break;
      }
      case 'curtainwall': {
        newEntity = {
          id, type: 'curtainwall', layer: 'A-CurtainWall',
          x1, y1, x2, y2,
          height: floor.floorHeight || 3000,
          mullionSpacing: 1500, transomSpacing: 1200,
        } as CurtainWallEntity;
        break;
      }
      case 'railing': {
        newEntity = {
          id, type: 'railing', layer: 'A-Railing',
          points: [{ x: x1, y: y1 }, { x: x2, y: y2 }],
          height: 1100, railType: 'metal', balusterSpacing: 120,
        } as RailingEntity;
        break;
      }
      case 'ceiling': {
        const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
        const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
        newEntity = {
          id, type: 'ceiling', layer: 'A-Ceiling',
          points: [
            { x: minX, y: minY }, { x: maxX, y: minY },
            { x: maxX, y: maxY }, { x: minX, y: maxY },
          ],
          height: (floor.floorHeight || 3000) - 300, material: 'drywall',
        } as CeilingEntity;
        break;
      }
      case 'furniture': {
        newEntity = {
          id, type: 'furniture', layer: 'A-Furniture',
          x: x1, y: y1, width: 600, depth: 600,
          category: 'table', rotation: 0,
        } as FurnitureEntity;
        break;
      }
      case 'fixture': {
        newEntity = {
          id, type: 'fixture', layer: 'A-Fixture',
          x: x1, y: y1, width: 500, depth: 400,
          category: 'sink', rotation: 0,
        } as FixtureEntity;
        break;
      }
      case 'pipe': {
        newEntity = {
          id, type: 'pipe', layer: 'M-Pipe',
          points: [{ x: x1, y: y1 }, { x: x2, y: y2 }],
          diameter: 100, material: 'PVC', system: 'water',
        } as PipeEntity;
        break;
      }
      case 'duct': {
        newEntity = {
          id, type: 'duct', layer: 'M-Duct',
          points: [{ x: x1, y: y1 }, { x: x2, y: y2 }],
          width: 300, height: 200, system: 'supply',
        } as DuctEntity;
        break;
      }
    }

    if (newEntity) {
      floor.entities.push(newEntity);
      if (onEntityUpdate) onEntityUpdate([...floor.entities]);
      buildFromEntities();
      onStatusChange(`Created ${tool} — ${floor.entities.length} entities`);
    }
  }, [floor, onEntityUpdate, onStatusChange]);

  // ─── Update creation preview while dragging ──────────────────
  const updateCreationPreview = useCallback((start: THREE.Vector3, end: THREE.Vector3) => {
    if (!sceneRef.current) return;
    // Remove old preview
    if (creationPreviewRef.current) {
      sceneRef.current.remove(creationPreviewRef.current);
      creationPreviewRef.current.geometry.dispose();
      (creationPreviewRef.current.material as THREE.Material).dispose();
      creationPreviewRef.current = null;
    }
    const previewMat = new THREE.MeshStandardMaterial({
      color: 0x58a6ff, transparent: true, opacity: 0.4, depthWrite: false,
    });
    let geo: THREE.BufferGeometry | null = null;
    const pos = new THREE.Vector3();

    if (activeTool === 'wall' || activeTool === 'beam' || activeTool === 'curtainwall' || activeTool === 'railing') {
      const len = start.distanceTo(end);
      geo = new THREE.BoxGeometry(len, activeTool === 'railing' ? 1.1 : 3.0, 0.2);
      pos.copy(start).add(end).multiplyScalar(0.5);
      pos.y = activeTool === 'railing' ? 0.55 : 1.5;
    } else if (activeTool === 'slab' || activeTool === 'roof' || activeTool === 'ceiling') {
      const w = Math.abs(end.x - start.x), d = Math.abs(end.z - start.z);
      geo = new THREE.BoxGeometry(w, 0.2, d);
      pos.set((start.x + end.x) / 2, activeTool === 'roof' ? 3.0 : 0.1, (start.z + end.z) / 2);
    } else if (activeTool === 'pipe' || activeTool === 'duct') {
      const len = start.distanceTo(end);
      geo = activeTool === 'pipe'
        ? new THREE.CylinderGeometry(0.05, 0.05, len, 8)
        : new THREE.BoxGeometry(len, 0.2, 0.3);
      pos.copy(start).add(end).multiplyScalar(0.5);
      pos.y = 2.5;
    } else {
      // Single-click tools: column, door, window, furniture, etc.
      geo = new THREE.BoxGeometry(0.4, 3.0, 0.4);
      pos.copy(start);
      pos.y = 1.5;
    }

    if (geo) {
      const mesh = new THREE.Mesh(geo, previewMat);
      mesh.position.copy(pos);
      if (activeTool === 'wall' || activeTool === 'beam' || activeTool === 'curtainwall' || activeTool === 'railing' || activeTool === 'pipe' || activeTool === 'duct') {
        mesh.rotation.y = -Math.atan2(end.z - start.z, end.x - start.x);
      }
      mesh.userData['preview'] = true;
      sceneRef.current.add(mesh);
      creationPreviewRef.current = mesh;
    }
  }, [activeTool]);

  // ─── Walkthrough (first-person) mode ──────────────────────────
  useEffect(() => {
    if (!walkthroughMode) return;
    const speed = 0.15;
    const cam = cameraRef.current;
    if (!cam) return;
    
    let yaw = orbitAngles.current.theta;
    let pitch = 0;
    
    cam.position.y = 1.7; // eye height
    
    const onKeyDown = (e: KeyboardEvent) => walkthroughKeys.current.add(e.key.toLowerCase());
    const onKeyUp = (e: KeyboardEvent) => walkthroughKeys.current.delete(e.key.toLowerCase());
    
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    
    const walkFrame = () => {
      if (!walkthroughMode) return;
      const keys = walkthroughKeys.current;
      const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      
      if (keys.has('w') || keys.has('arrowup'))    cam.position.addScaledVector(forward, speed);
      if (keys.has('s') || keys.has('arrowdown'))   cam.position.addScaledVector(forward, -speed);
      if (keys.has('a') || keys.has('arrowleft'))   cam.position.addScaledVector(right, -speed);
      if (keys.has('d') || keys.has('arrowright'))  cam.position.addScaledVector(right, speed);
      if (keys.has('q')) cam.position.y += speed * 0.5;
      if (keys.has('e')) cam.position.y -= speed * 0.5;
      
      // Mouse look handled via orbit controls (reused)
      cam.position.y = Math.max(0.3, cam.position.y);
      const lookTarget = cam.position.clone().add(forward);
      lookTarget.y = cam.position.y + Math.sin(pitch);
      cam.lookAt(lookTarget);
      
      requestAnimationFrame(walkFrame);
    };
    const frameId = requestAnimationFrame(walkFrame);
    
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      cancelAnimationFrame(frameId);
    };
  }, [walkthroughMode]);

  // ─── Sun position control ────────────────────────────────────
  useEffect(() => {
    if (useGeoSun) return;
    if (!sceneRef.current) return;
    const sun = sceneRef.current.getObjectByName('sun') as THREE.DirectionalLight;
    if (!sun) return;
    const azRad = sunPosition.azimuth * Math.PI / 180;
    const altRad = sunPosition.altitude * Math.PI / 180;
    const r = 30;
    sun.position.set(
      r * Math.cos(altRad) * Math.sin(azRad),
      r * Math.sin(altRad),
      r * Math.cos(altRad) * Math.cos(azRad)
    );
    // Update light intensity based on altitude (sunrise/set are dimmer)
    sun.intensity = Math.max(0.3, 3.0 * Math.sin(altRad));
    // Warm at low angles, cool at high
    const warmth = 1 - Math.sin(altRad);
    sun.color.setRGB(1.0, 0.96 - warmth * 0.1, 0.9 - warmth * 0.2);
  }, [sunPosition, useGeoSun]);

  useEffect(() => {
    if (!useGeoSun) return;
    const latRad = geoSunParams.latitude * (Math.PI / 180);
    const decl = 23.45 * Math.sin((2 * Math.PI * (284 + geoSunParams.dayOfYear)) / 365);
    const declRad = decl * (Math.PI / 180);
    const hourAngle = (geoSunParams.hour - 12) * 15;
    const hRad = hourAngle * (Math.PI / 180);

    const altitude = Math.asin(
      Math.sin(latRad) * Math.sin(declRad) +
      Math.cos(latRad) * Math.cos(declRad) * Math.cos(hRad)
    );

    const azimuth = Math.atan2(
      Math.sin(hRad),
      Math.cos(hRad) * Math.sin(latRad) - Math.tan(declRad) * Math.cos(latRad)
    );

    const azimuthDeg = ((azimuth * 180) / Math.PI + 180 + 360) % 360;
    const altitudeDeg = Math.max(2, ((altitude * 180) / Math.PI));
    setSunPosition({ azimuth: Math.round(azimuthDeg), altitude: Math.round(altitudeDeg) });
  }, [geoSunParams, useGeoSun]);

  useEffect(() => {
    if (!sceneRef.current || !skyRef.current) return;
    const azRad = sunPosition.azimuth * Math.PI / 180;
    const altRad = sunPosition.altitude * Math.PI / 180;
    const sunDir = new THREE.Vector3(
      Math.cos(altRad) * Math.sin(azRad),
      Math.sin(altRad),
      Math.cos(altRad) * Math.cos(azRad)
    );
    const skyUniforms = (skyRef.current.material as THREE.ShaderMaterial).uniforms;
    skyUniforms['sunPosition'].value.copy(sunDir);
  }, [sunPosition]);

  // ─── Measurement helper ──────────────────────────────────────
  const addMeasurePoint = useCallback((pt: THREE.Vector3) => {
    const pts = [...measurePoints, pt];
    setMeasurePoints(pts);

    if (pts.length === 2) {
      const d = pts[0].distanceTo(pts[1]);
      setMeasureDistance(d);
      // Draw line
      if (measureLineRef.current && sceneRef.current) {
        sceneRef.current.remove(measureLineRef.current);
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({ color: 0xff4444, linewidth: 2 });
      const line = new THREE.Line(geo, mat);
      line.userData['measure'] = true;
      sceneRef.current?.add(line);
      measureLineRef.current = line;
      onStatusChange(`Distance: ${(d).toFixed(3)} m (${(d * 1000).toFixed(0)} mm)`);
    } else if (pts.length > 2) {
      // Reset
      setMeasurePoints([pt]);
      setMeasureDistance(null);
      if (measureLineRef.current && sceneRef.current) {
        sceneRef.current.remove(measureLineRef.current);
        measureLineRef.current = null;
      }
    }
  }, [measurePoints, onStatusChange]);

  // ─── Clash detection ──────────────────────────────────────────
  const runClashDetection = useCallback(() => {
    const archObjects = sceneRef.current?.children.filter(c => c.userData['archflow']) || [];
    const boxes: { id: string; box: THREE.Box3 }[] = [];
    
    for (const obj of archObjects) {
      const box = new THREE.Box3().setFromObject(obj);
      if (!box.isEmpty()) {
        boxes.push({ id: obj.userData['id'] || 'unknown', box });
      }
    }

    const clashes: { a: string; b: string; point: THREE.Vector3 }[] = [];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        if (boxes[i].box.intersectsBox(boxes[j].box)) {
          // Check they're different entity types (same-type overlaps are intentional, e.g. wall-wall connections)
          const eA = floor.entities.find(e => e.id === boxes[i].id);
          const eB = floor.entities.find(e => e.id === boxes[j].id);
          if (eA && eB && eA.type !== eB.type) {
            const center = new THREE.Vector3();
            const intersection = boxes[i].box.clone().intersect(boxes[j].box);
            intersection.getCenter(center);
            clashes.push({ a: boxes[i].id, b: boxes[j].id, point: center });
          }
        }
      }
    }

    // Visualize clashes
    clearClashMarkers();
    for (const clash of clashes) {
      const geo = new THREE.SphereGeometry(0.15, 8, 8);
      const mat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.7 });
      const marker = new THREE.Mesh(geo, mat);
      marker.position.copy(clash.point);
      marker.userData['clash'] = true;
      sceneRef.current?.add(marker);
      clashMarkersRef.current.push(marker);
    }

    setClashResults(clashes);
    setShowClashes(true);
    onStatusChange(`Clash detection: ${clashes.length} clashes found`);
  }, [floor, onStatusChange]);

  const clearClashMarkers = useCallback(() => {
    for (const m of clashMarkersRef.current) {
      sceneRef.current?.remove(m);
      if (m instanceof THREE.Mesh) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    }
    clashMarkersRef.current = [];
  }, []);

  // ─── Exploded view ──────────────────────────────────────────
  const applyExplodedView = useCallback((factor: number) => {
    if (!sceneRef.current) return;
    const categoryOffsets: Record<string, number> = {
      footing: -2, slab: 0, wall: 1, column: 1, beam: 2, door: 1, window: 1,
      ceiling: 3, roof: 4, pipe: 2.5, duct: 2.8, furniture: 0.5,
      stair: 1, ramp: 1, railing: 1.5, fence: 0, landscape: 0,
      curtainwall: 1, structural_member: 2, room: 0,
    };
    sceneRef.current.children.forEach(c => {
      if (!c.userData['archflow']) return;
      const et = c.userData['entityType'] as string;
      const offset = (categoryOffsets[et] || 0) * (factor - 1) * 2;
      if (c.userData['originalY'] === undefined) {
        c.userData['originalY'] = c.position.y;
      }
      c.position.y = (c.userData['originalY'] as number) + offset;
    });
  }, []);

  useEffect(() => {
    applyExplodedView(explodedView ? explodeFactor : 1.0);
  }, [explodedView, explodeFactor, applyExplodedView]);

  // ─── Multi-story visualization ────────────────────────────────
  const multiStoryGroupRef = useRef<THREE.Group | null>(null);

  const buildMultiStory = useCallback(() => {
    if (!sceneRef.current) return;
    // Remove existing multi-story group
    if (multiStoryGroupRef.current) {
      sceneRef.current.remove(multiStoryGroupRef.current);
      multiStoryGroupRef.current = null;
    }
    if (!showMultiStory) return;

    const group = new THREE.Group();
    group.userData['multiStory'] = true;

    // Build ghost versions of other floors
    const currentFloorIdx = project.floors.indexOf(floor);
    for (let fi = 0; fi < project.floors.length; fi++) {
      if (fi === currentFloorIdx) continue;
      const otherFloor = project.floors[fi];
      const floorOffset = fi * (floor.floorHeight * mmToM);
      
      // Create ghost geometry for the other floor
      for (const entity of otherFloor.entities) {
        if (entity.type !== 'wall' && entity.type !== 'slab' && entity.type !== 'column') continue;
        
        let geo: THREE.BufferGeometry | null = null;
        const pos = new THREE.Vector3();
        let rotY = 0;

        if (entity.type === 'wall') {
          const w = entity as WallEntity;
          const dx = w.x2 - w.x1, dy = w.y2 - w.y1;
          const len = Math.hypot(dx, dy) * mmToM;
          const h = w.height * mmToM;
          if (len < 0.01) continue;
          geo = new THREE.BoxGeometry(len, h, w.thickness * mmToM);
          pos.set((w.x1 + w.x2) / 2 * mmToM, floorOffset + h / 2, (w.y1 + w.y2) / 2 * mmToM);
          rotY = -Math.atan2(dy, dx);
        } else if (entity.type === 'column') {
          const c = entity as ColumnEntity;
          const w = c.width * mmToM, d = c.depth * mmToM, h = c.height * mmToM;
          geo = c.shape === 'circular'
            ? new THREE.CylinderGeometry(w / 2, w / 2, h, 12)
            : new THREE.BoxGeometry(w, h, d);
          pos.set(c.x * mmToM + w / 2, floorOffset + h / 2, c.y * mmToM + d / 2);
        } else if (entity.type === 'slab') {
          const s = entity as SlabEntity;
          if (s.points.length < 3) continue;
          const shape = new THREE.Shape();
          shape.moveTo(s.points[0].x * mmToM, s.points[0].y * mmToM);
          for (let i = 1; i < s.points.length; i++) shape.lineTo(s.points[i].x * mmToM, s.points[i].y * mmToM);
          shape.closePath();
          geo = new THREE.ExtrudeGeometry(shape, { depth: s.thickness * mmToM, bevelEnabled: false });
        }

        if (geo) {
          const mat = new THREE.MeshStandardMaterial({
            color: 0x6080a0, transparent: true, opacity: 0.15,
            wireframe: false, depthWrite: false,
          });
          const mesh = new THREE.Mesh(geo, mat);
          mesh.position.copy(pos);
          mesh.rotation.y = rotY;
          if (entity.type === 'slab') {
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.y = floorOffset + (entity as SlabEntity).elevation * mmToM;
          }
          group.add(mesh);
        }
      }

      // Floor level indicator
      const levelGeo = new THREE.PlaneGeometry(50, 50);
      const levelMat = new THREE.MeshBasicMaterial({
        color: 0x58a6ff, transparent: true, opacity: 0.03, side: THREE.DoubleSide,
      });
      const levelPlane = new THREE.Mesh(levelGeo, levelMat);
      levelPlane.rotation.x = -Math.PI / 2;
      levelPlane.position.y = floorOffset;
      group.add(levelPlane);
    }

    sceneRef.current.add(group);
    multiStoryGroupRef.current = group;
  }, [showMultiStory, project, floor]);

  useEffect(() => {
    if (hasModel) buildMultiStory();
  }, [showMultiStory, hasModel, buildMultiStory]);

  // ─── Property editing ────────────────────────────────────────
  const applyPropertyEdit = useCallback((entityId: string, field: string, value: string) => {
    const entity = floor.entities.find(e => e.id === entityId);
    if (!entity) return;
    pushUndo3D(`Edit ${field}`);
    
    const numValue = parseFloat(value);
    const isNum = !isNaN(numValue);
    
    // Apply the edit based on entity type and field
    if (field === 'thickness' && isNum) (entity as any).thickness = numValue;
    else if (field === 'height' && isNum) (entity as any).height = numValue;
    else if (field === 'width' && isNum) (entity as any).width = numValue;
    else if (field === 'depth' && isNum) (entity as any).depth = numValue;
    else if (field === 'material') (entity as any).material = value;
    else if (field === 'pitch' && isNum) (entity as any).pitch = numValue;
    else if (field === 'roofType') (entity as any).roofType = value;
    else if (field === 'doorType') (entity as any).doorType = value;
    else if (field === 'windowType') (entity as any).windowType = value;
    else if (field === 'sillHeight' && isNum) (entity as any).sillHeight = numValue;
    else if (field === 'elevation' && isNum) (entity as any).elevation = numValue;
    else if (field === 'stairType') (entity as any).stairType = value;
    else if (field === 'shape') (entity as any).shape = value;
    else if (field === 'name') (entity as any).name = value;
    else if (field === 'structuralUsage') (entity as any).structuralUsage = value;
    
    if (onEntityUpdate) onEntityUpdate([...floor.entities]);
    buildFromEntities();
    setEditingProperty(null);
    onStatusChange(`Updated ${field} to ${value}`);
  }, [floor, onEntityUpdate, onStatusChange]);

  // ─── Delete selected entity ──────────────────────────────────
  const deleteSelectedEntity = useCallback(() => {
    if (!selectedObjectId) return;
    pushUndo3D('Delete entity');
    const idx = floor.entities.findIndex(e => e.id === selectedObjectId);
    if (idx >= 0) {
      floor.entities.splice(idx, 1);
      if (onEntityUpdate) onEntityUpdate([...floor.entities]);
      setSelectedObjectId(null);
      buildFromEntities();
      onStatusChange(`Deleted entity — ${floor.entities.length} remaining`);
    }
  }, [selectedObjectId, floor, onEntityUpdate, onStatusChange]);

  // ─── Copy selected entity ────────────────────────────────────
  const copySelectedEntity = useCallback(() => {
    if (!selectedObjectId) return;
    const entity = floor.entities.find(e => e.id === selectedObjectId);
    if (!entity) return;
    pushUndo3D(`Copy ${entity.type}`);
    const copy = JSON.parse(JSON.stringify(entity));
    copy.id = `${entity.type}_copy_${Date.now().toString(36)}`;
    // Offset the copy slightly
    if ('x' in copy) copy.x += 500;
    if ('y' in copy && copy.type !== 'wall') copy.y += 500;
    if ('x1' in copy) { copy.x1 += 500; copy.x2 += 500; }
    if ('y1' in copy && 'y2' in copy) { copy.y1 += 500; copy.y2 += 500; }
    if ('points' in copy && Array.isArray(copy.points)) {
      copy.points = copy.points.map((p: Vec2) => ({ x: p.x + 500, y: p.y + 500 }));
    }
    floor.entities.push(copy);
    if (onEntityUpdate) onEntityUpdate([...floor.entities]);
    buildFromEntities();
    onStatusChange(`Copied ${entity.type}`);
  }, [selectedObjectId, floor, onEntityUpdate, onStatusChange]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!sceneRef.current || !cameraRef.current || !mountRef.current) return;
    
    // ─── Measurement tool ─────
    if (activeTool === 'measure') {
      const ground = raycastGround(e);
      if (ground) addMeasurePoint(ground);
      return;
    }

    // ─── Creation tools: place entity ─────
    const creationTools: Tool3D[] = ['wall', 'slab', 'column', 'beam', 'roof', 'stair', 'ramp', 'door', 'window', 'curtainwall', 'railing', 'ceiling', 'furniture', 'fixture', 'pipe', 'duct'];
    if (creationTools.includes(activeTool)) {
      const ground = raycastGround(e);
      if (!ground) return;
      
      const singleClickTools: Tool3D[] = ['column', 'door', 'window', 'furniture', 'fixture'];
      if (singleClickTools.includes(activeTool)) {
        createEntityFromTool(activeTool, ground, ground);
        return;
      }
      
      // Two-click tools (wall, slab, beam, etc.)
      if (!creationStartRef.current) {
        creationStartRef.current = ground.clone();
        setCreationStep(1);
        onStatusChange(`${activeTool}: click second point…`);
        return;
      } else {
        createEntityFromTool(activeTool, creationStartRef.current, ground);
        // Remove preview
        if (creationPreviewRef.current && sceneRef.current) {
          sceneRef.current.remove(creationPreviewRef.current);
          creationPreviewRef.current.geometry.dispose();
          (creationPreviewRef.current.material as THREE.Material).dispose();
          creationPreviewRef.current = null;
        }
        creationStartRef.current = null;
        setCreationStep(0);
        return;
      }
    }

    // ─── Delete tool ─────
    if (activeTool === 'delete' && selectedObjectId) {
      deleteSelectedEntity();
      return;
    }

    // ─── Copy tool ─────
    if (activeTool === 'copy' && selectedObjectId) {
      copySelectedEntity();
      return;
    }

    // ─── Select tool (default) ─────
    const rect = mountRef.current.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    (raycaster as any).firstHitOnly = true;
    raycaster.setFromCamera(mouse, cameraRef.current);

    const archObjects = sceneRef.current.children.filter(c => c.userData['archflow']);
    const candidates = archObjects.filter(obj => {
      const sphere = new THREE.Sphere();
      const box = new THREE.Box3().setFromObject(obj);
      if (box.isEmpty()) return false;
      box.getBoundingSphere(sphere);
      return raycaster.ray.intersectsSphere(sphere);
    });
    const intersects = raycaster.intersectObjects(candidates, true);
    
    // Reset all highlights
    archObjects.forEach(c => {
      c.traverse(child => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
          child.material.emissive.setHex(0x000000);
        }
      });
    });

    if (intersects.length > 0) {
      let target = intersects[0].object;
      while (target.parent && !target.userData['archflow']) target = target.parent;
      
      setSelectedObjectId(target.userData['id'] || null);
      target.traverse(child => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
          child.material.emissive.setHex(0x112244);
        }
      });
      onStatusChange(`Selected: ${target.userData['entityType'] || 'Object'} [${target.userData['id']}]`);
    } else {
      setSelectedObjectId(null);
    }
  }, [activeTool, onStatusChange, raycastGround, addMeasurePoint, createEntityFromTool, deleteSelectedEntity, copySelectedEntity, selectedObjectId]);

  // ─── 3D Keyboard shortcuts (undo/redo, Delete) ───────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (walkthroughMode) return;
      // Don't capture when typing in input fields
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo3D(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo3D(); }
      if (e.key === 'Delete' && selectedObjectId) { deleteSelectedEntity(); }
      if (e.key === 'Escape') {
        setActiveTool('select');
        creationStartRef.current = null;
        setCreationStep(0);
        if (creationPreviewRef.current && sceneRef.current) {
          sceneRef.current.remove(creationPreviewRef.current);
          creationPreviewRef.current.geometry.dispose();
          (creationPreviewRef.current.material as THREE.Material).dispose();
          creationPreviewRef.current = null;
        }
        moveStartRef.current = null;
        moveEntityStartRef.current = null;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [walkthroughMode, undo3D, redo3D, selectedObjectId, deleteSelectedEntity]);

  // ─── App‐menu event bridge for undo/redo/delete/zoomfit ──────
  useEffect(() => {
    const onUndo = () => undo3D();
    const onRedo = () => redo3D();
    const onDel = () => { if (selectedObjectId) deleteSelectedEntity(); };
    const onZoom = () => zoomToFit();
    window.addEventListener('archflow:undo', onUndo);
    window.addEventListener('archflow:redo', onRedo);
    window.addEventListener('archflow:delete', onDel);
    window.addEventListener('archflow:zoomfit', onZoom);
    return () => {
      window.removeEventListener('archflow:undo', onUndo);
      window.removeEventListener('archflow:redo', onRedo);
      window.removeEventListener('archflow:delete', onDel);
      window.removeEventListener('archflow:zoomfit', onZoom);
    };
  }, [undo3D, redo3D, selectedObjectId, deleteSelectedEntity]);

  // ─── Move/Rotate gizmo interaction ────────────────────────────
  const handleGizmoStart = useCallback((e: React.MouseEvent) => {
    if (!selectedObjectId) return;
    const entity = floor.entities.find(en => en.id === selectedObjectId);
    if (!entity) return;
    const ground = raycastGround(e);
    if (!ground) return;

    if (activeTool === 'move') {
      pushUndo3D('Move entity');
      moveStartRef.current = ground.clone();
      moveEntityStartRef.current = {
        x: (entity as any).x ?? 0,
        y: (entity as any).y ?? 0,
        x1: (entity as any).x1,
        y1: (entity as any).y1,
        x2: (entity as any).x2,
        y2: (entity as any).y2,
        points: (entity as any).points ? JSON.parse(JSON.stringify((entity as any).points)) : undefined,
      };
    } else if (activeTool === 'rotate') {
      pushUndo3D('Rotate entity');
      const cx = ((entity as any).x1 !== undefined && (entity as any).x2 !== undefined)
        ? ((entity as any).x1 + (entity as any).x2) / 2 : (entity as any).x ?? 0;
      const cy = ((entity as any).y1 !== undefined && (entity as any).y2 !== undefined)
        ? ((entity as any).y1 + (entity as any).y2) / 2 : (entity as any).y ?? 0;
      const dx = ground.x * 1000 - cx, dy = ground.z * 1000 - cy;
      rotateStartAngleRef.current = Math.atan2(dy, dx);
      rotateEntityStartRef.current = (entity as any).rotation ?? 0;
    }
  }, [activeTool, selectedObjectId, floor, raycastGround, pushUndo3D]);

  const handleGizmoDrag = useCallback((e: React.MouseEvent) => {
    if (!selectedObjectId) return;
    const entity = floor.entities.find(en => en.id === selectedObjectId);
    if (!entity) return;
    const ground = raycastGround(e);
    if (!ground) return;

    if (activeTool === 'move' && moveStartRef.current && moveEntityStartRef.current) {
      const dx = (ground.x - moveStartRef.current.x) * 1000;
      const dy = (ground.z - moveStartRef.current.z) * 1000;
      const snap = snapToGrid ? gridSnapSize : 1;
      const snapDx = Math.round(dx / snap) * snap;
      const snapDy = Math.round(dy / snap) * snap;
      const start = moveEntityStartRef.current;

      if ('x1' in entity && 'x2' in entity && start.x1 !== undefined && start.x2 !== undefined) {
        (entity as any).x1 = start.x1 + snapDx;
        (entity as any).x2 = start.x2 + snapDx;
      } else if ('x' in entity) {
        (entity as any).x = start.x + snapDx;
      }
      if ('y1' in entity && 'y2' in entity && start.y1 !== undefined && start.y2 !== undefined) {
        (entity as any).y1 = start.y1 + snapDy;
        (entity as any).y2 = start.y2 + snapDy;
      } else if ('y' in entity && (entity.type as string) !== 'wall') {
        (entity as any).y = start.y + snapDy;
      }
      if ('points' in entity && start.points) {
        (entity as any).points = start.points.map((p: Vec2) => ({ x: p.x + snapDx, y: p.y + snapDy }));
      }
      if (onEntityUpdate) onEntityUpdate([...floor.entities]);
      buildFromEntities();
    } else if (activeTool === 'rotate' && rotateStartAngleRef.current !== undefined) {
      const cx = ((entity as any).x1 !== undefined && (entity as any).x2 !== undefined)
        ? ((entity as any).x1 + (entity as any).x2) / 2 : (entity as any).x ?? 0;
      const cy = ((entity as any).y1 !== undefined && (entity as any).y2 !== undefined)
        ? ((entity as any).y1 + (entity as any).y2) / 2 : (entity as any).y ?? 0;
      const dx = ground.x * 1000 - cx, dy = ground.z * 1000 - cy;
      const currentAngle = Math.atan2(dy, dx);
      const delta = currentAngle - rotateStartAngleRef.current;
      (entity as any).rotation = rotateEntityStartRef.current + delta * (180 / Math.PI);
      if (onEntityUpdate) onEntityUpdate([...floor.entities]);
      buildFromEntities();
    }
  }, [activeTool, selectedObjectId, floor, raycastGround, snapToGrid, onEntityUpdate]);

  const handleGizmoEnd = useCallback(() => {
    moveStartRef.current = null;
    moveEntityStartRef.current = null;
  }, []);

  // ─── Generate 3D model ────────────────────────────────────────────
  const handleGenerate3D = async () => {
    const generationId = nativeGenerationRef.current + 1;
    nativeGenerationRef.current = generationId;
    setIsGenerating(true);
    try {
      if (sceneData?.scene_id) {
        try {
          await invoke('release_3d_scene', { sceneId: sceneData.scene_id });
        } catch {
          // Best-effort cache cleanup; generation should continue.
        }
      }

      if (useNativeMesher) {
        onStatusChange('Syncing 3D via native Rust mesher…');
        const result = await invoke<NativeScenePayload>('convert_to_3d', {
          floorData: { entities: floor.entities, floor_height: floor.floorHeight },
        });

        if (nativeGenerationRef.current !== generationId) return;

        if (result && Array.isArray(result.scene_objects)) {
          const instanceBatches = result.native?.instance_batches || [];
          const skipObjectIds = new Set<string>();
          for (const batch of instanceBatches) {
            for (const inst of batch.instances || []) {
              skipObjectIds.add(inst.id);
            }
          }
          instancedObjectIdsRef.current = skipObjectIds;

          const firstChunk = Array.isArray(result.first_chunk) && result.first_chunk.length > 0
            ? result.first_chunk
            : result.scene_objects;
          const combinedObjects = [...firstChunk];
          const totalChunks = Math.max(result.chunk_count || 0, firstChunk.length > 0 ? 1 : 0);

          buildThreeScene({ ...result, scene_objects: firstChunk }, {
            clearExisting: true,
            finalize: totalChunks <= 1,
            skipObjectIds,
          });

          if (instanceBatches.length > 0) {
            buildInstanceBatches(instanceBatches);
          }

          if (totalChunks > 1) {
            onStatusChange(`Native 3D chunk 1/${totalChunks} loaded…`);
          }

          for (let chunkIndex = 1; chunkIndex < totalChunks; chunkIndex += 1) {
            const chunk = await invoke<ChunkPayload>('convert_to_3d_chunk', {
              sceneId: result.scene_id,
              chunkIndex,
              chunkSize: result.chunk_size,
            });

            if (nativeGenerationRef.current !== generationId) return;
            if (!chunk || !Array.isArray(chunk.scene_objects)) continue;

            combinedObjects.push(...chunk.scene_objects);
            buildThreeScene({ scene_objects: chunk.scene_objects } as NativeScenePayload, {
              clearExisting: false,
              finalize: chunk.is_final || chunkIndex === totalChunks - 1,
              skipObjectIds,
            });

            onStatusChange(`Native 3D chunk ${chunkIndex + 1}/${totalChunks} loaded…`);

            if (chunk.is_final) break;
          }

          const finalScene = { ...result, scene_objects: combinedObjects, first_chunk: firstChunk };
          setSceneData(finalScene);
          setHasModel(combinedObjects.length > 0);
          onStatusChange(`Native 3D sync complete — ${combinedObjects.length} objects from ${floor.entities.length} source entities`);
          return;
        }
      }

      onStatusChange('Rebuilding 3D base model from current floor…');
      instancedObjectIdsRef.current.clear();
      setSceneData(null);
      buildFromEntities();
      setHasModel(true);
      onStatusChange(`3D base model synced from 2D — ${floor.entities.length} entities`);
    } catch {
      if (nativeGenerationRef.current !== generationId) return;
      instancedObjectIdsRef.current.clear();
      setSceneData(null);
      buildFromEntities();
      setHasModel(true);
      onStatusChange(`Native mesher unavailable, fell back to local renderer — ${floor.entities.length} entities`);
    } finally {
      if (nativeGenerationRef.current === generationId) {
        setIsGenerating(false);
      }
    }
  };

  // ─── Import glTF/GLB model ────────────────────────────────────────
  const handleImportGLTF = async () => {
    try {
      const filePath = await open({ filters: [{ name: 'glTF', extensions: ['gltf', 'glb'] }] });
      if (!filePath || !sceneRef.current) return;
      onStatusChange('Importing glTF…');
      const loader = new GLTFLoader();
      // Read file via fetch from Tauri's file system
      const response = await fetch(`asset://localhost/${encodeURIComponent(filePath)}`);
      const buffer = await response.arrayBuffer();
      loader.parse(buffer, '', (gltf) => {
        const model = gltf.scene;
        model.userData['archflow'] = true;
        model.userData['imported'] = true;
        model.userData['entityType'] = 'imported_gltf';
        model.userData['id'] = `gltf_${Date.now().toString(36)}`;
        // Enable shadows
        model.traverse(child => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        sceneRef.current!.add(model);
        setHasModel(true);
        onStatusChange(`Imported glTF model (${gltf.scene.children.length} objects)`);
      }, (err) => {
        onStatusChange(`glTF import error: ${err}`);
      });
    } catch (err) {
      onStatusChange(`glTF import: ${err}`);
    }
  };

  // ─── Import IFC via backend bridge ────────────────────────────────
  const handleImportIFC = async () => {
    try {
      const filePath = await open({ filters: [{ name: 'IFC', extensions: ['ifc'] }] });
      if (!filePath) return;
      onStatusChange('Importing IFC…');
      const result = await invoke<Record<string, unknown>>('import_ifc', { filePath });
      if (result && result.entities) {
        const entities = result.entities as AnyEntity[];
        floor.entities.push(...entities);
        if (onEntityUpdate) onEntityUpdate([...floor.entities]);
        buildFromEntities();
        setHasModel(true);
        onStatusChange(`IFC imported — ${entities.length} entities added`);
      } else {
        onStatusChange('IFC import returned no entities');
      }
    } catch (err) {
      onStatusChange(`IFC import: ${err}`);
    }
  };

  const clearArchObjects = () => {
    const scene = sceneRef.current;
    if (!scene) return;
    const toRemove = scene.children.filter(c => c.userData['archflow'] === true);
    toRemove.forEach(c => {
      scene.remove(c);
      c.traverse(child => {
        if (child instanceof THREE.Mesh) {
          (child.geometry as any)?.disposeBoundsTree?.();
          child.geometry?.dispose();
          if (child.material instanceof THREE.Material) child.material.dispose();
        }
      });
    });
    entityMeshMap.current.clear();
  };

  const addArchMesh = (geo: THREE.BufferGeometry, material: THREE.Material, id: string, entityType: string) => {
    const scene = sceneRef.current;
    if (!scene) return null;
    (geo as any).computeBoundsTree?.();
    if (enableCSM && csmRef.current && material instanceof THREE.MeshStandardMaterial) {
      csmRef.current.setupMaterial(material);
    }
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = showShadows;
    mesh.receiveShadow = true;
    mesh.userData['archflow'] = true;
    mesh.userData['id'] = id;
    mesh.userData['entityType'] = entityType;
    mesh.frustumCulled = true;
    scene.add(mesh);
    entityMeshMap.current.set(id, mesh);
    return mesh;
  };

  const addArchGroup = (id: string, entityType: string) => {
    const group = new THREE.Group();
    group.userData['archflow'] = true;
    group.userData['id'] = id;
    group.userData['entityType'] = entityType;
    group.frustumCulled = true;
    sceneRef.current?.add(group);
    entityMeshMap.current.set(id, group);
    return group;
  };

  // ─── Build 3D from wall configuration ─────────────────────────────
  const buildWall3D = (w: WallEntity) => {
    const dx = w.x2 - w.x1, dy = w.y2 - w.y1;
    const len = Math.hypot(dx, dy) * mmToM;
    const thick = w.thickness * mmToM;
    const h = w.height * mmToM;
    if (len < 0.01) return;

    const matKey = w.material || 'concrete';
    const group = addArchGroup(w.id, 'wall');

    // Find doors/windows in this wall
    const wallAngle = Math.atan2(dy, dx);
    const wallDir = { x: dx / Math.hypot(dx, dy), y: dy / Math.hypot(dx, dy) };
    
    const openings: { tStart: number; tEnd: number; sillH: number; topH: number }[] = [];
    for (const e of floor.entities) {
      if (e.type === 'door' && (e as DoorEntity).wallId === w.id) {
        const d = e as DoorEntity;
        const t = ((d.x - w.x1) * wallDir.x + (d.y - w.y1) * wallDir.y) / Math.hypot(dx, dy);
        openings.push({ tStart: t, tEnd: t + d.width / Math.hypot(dx, dy), sillH: 0, topH: d.height });
      }
      if (e.type === 'window' && (e as WindowEntity).wallId === w.id) {
        const wn = e as WindowEntity;
        const t = ((wn.x - w.x1) * wallDir.x + (wn.y - w.y1) * wallDir.y) / Math.hypot(dx, dy);
        openings.push({ tStart: t, tEnd: t + wn.width / Math.hypot(dx, dy), sillH: wn.sillHeight, topH: wn.sillHeight + wn.height });
      }
    }

    if (openings.length === 0) {
      // Simple wall box
      const geo = new THREE.BoxGeometry(len, h, thick);
      const mesh = new THREE.Mesh(geo, makeMaterial(matKey));
      mesh.castShadow = showShadows; mesh.receiveShadow = true;
      const cx = (w.x1 + w.x2) / 2 * mmToM, cy = (w.y1 + w.y2) / 2 * mmToM;
      mesh.position.set(cx, h / 2, cy);
      mesh.rotation.y = -wallAngle;
      group.add(mesh);
    } else {
      // Wall with openings — use CSG-like approach with shape extrusion
      openings.sort((a, b) => a.tStart - b.tStart);
      const wallLen = Math.hypot(dx, dy);
      
      // Create wall face shape with holes
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(len, 0);
      shape.lineTo(len, h);
      shape.lineTo(0, h);
      shape.closePath();
      
      for (const op of openings) {
        const hx0 = op.tStart * wallLen * mmToM;
        const hx1 = op.tEnd * wallLen * mmToM;
        const hy0 = op.sillH * mmToM;
        const hy1 = op.topH * mmToM;
        if (hx0 >= 0 && hx1 <= len && hy0 >= 0 && hy1 <= h) {
          const hole = new THREE.Path();
          hole.moveTo(hx0, hy0);
          hole.lineTo(hx1, hy0);
          hole.lineTo(hx1, hy1);
          hole.lineTo(hx0, hy1);
          hole.closePath();
          shape.holes.push(hole);
        }
      }
      
      const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false });
      const mesh = new THREE.Mesh(geo, makeMaterial(matKey));
      mesh.castShadow = showShadows; mesh.receiveShadow = true;
      mesh.position.set(w.x1 * mmToM, 0, w.y1 * mmToM);
      mesh.rotation.y = -wallAngle;
      // Shift so extrude is centered on wall thickness
      mesh.translateZ(-thick / 2);
      group.add(mesh);
    }
  };

  // ─── Build roof with pitch ────────────────────────────────────────
  const buildRoof3D = (r: RoofEntity) => {
    if (r.points.length < 3) return;
    const group = addArchGroup(r.id, 'roof');
    const pitchRad = (r.pitch || 0) * Math.PI / 180;
    const elev = r.elevation * mmToM;
    const thick = r.thickness * mmToM;

    if (r.roofType === 'flat' || pitchRad < 0.01) {
      // Flat roof — simple extrude
      const shape = new THREE.Shape();
      shape.moveTo(r.points[0].x * mmToM, r.points[0].y * mmToM);
      for (let i = 1; i < r.points.length; i++) shape.lineTo(r.points[i].x * mmToM, r.points[i].y * mmToM);
      shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false });
      const mesh = new THREE.Mesh(geo, makeMaterial('concrete'));
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = elev;
      mesh.castShadow = showShadows; mesh.receiveShadow = true;
      group.add(mesh);
    } else if (r.roofType === 'gable') {
      // Gable roof — find bounding box, create ridgeline, extrude gable profile
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of r.points) {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      }
      const w = (maxX - minX) * mmToM, d = (maxY - minY) * mmToM;
      const ridgeH = (w / 2) * Math.tan(pitchRad);
      
      // Left slope
      const geo1 = new THREE.PlaneGeometry(w / 2 / Math.cos(pitchRad), d);
      const m1 = new THREE.Mesh(geo1, makeMaterial(r.material || 'tile'));
      m1.position.set((minX + (maxX - minX) / 4) * mmToM, elev + ridgeH / 2, (minY + maxY) / 2 * mmToM);
      m1.rotation.z = pitchRad;
      m1.rotation.y = 0;
      m1.castShadow = showShadows; m1.receiveShadow = true;
      group.add(m1);
      
      // Right slope
      const geo2 = new THREE.PlaneGeometry(w / 2 / Math.cos(pitchRad), d);
      const m2 = new THREE.Mesh(geo2, makeMaterial(r.material || 'tile'));
      m2.position.set((minX + 3 * (maxX - minX) / 4) * mmToM, elev + ridgeH / 2, (minY + maxY) / 2 * mmToM);
      m2.rotation.z = -pitchRad;
      m2.castShadow = showShadows; m2.receiveShadow = true;
      group.add(m2);
      
      // Gable end triangles
      const triShape = new THREE.Shape();
      triShape.moveTo(0, 0);
      triShape.lineTo(w, 0);
      triShape.lineTo(w / 2, ridgeH);
      triShape.closePath();
      const gableGeo = new THREE.ShapeGeometry(triShape);
      
      const g1 = new THREE.Mesh(gableGeo, makeMaterial(r.material || 'concrete'));
      g1.position.set(minX * mmToM, elev, minY * mmToM);
      g1.castShadow = showShadows;
      group.add(g1);
      
      const g2 = new THREE.Mesh(gableGeo.clone(), makeMaterial(r.material || 'concrete'));
      g2.position.set(minX * mmToM, elev, maxY * mmToM);
      g2.castShadow = showShadows;
      group.add(g2);
    } else if (r.roofType === 'hip') {
      // Hip roof with 4 sloped faces
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of r.points) {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      }
      const cx = (minX + maxX) / 2 * mmToM, cz = (minY + maxY) / 2 * mmToM;
      const w = (maxX - minX) * mmToM, d = (maxY - minY) * mmToM;
      const ridgeH = Math.min(w, d) / 2 * Math.tan(pitchRad);
      
      const apex = new THREE.Vector3(cx, elev + ridgeH, cz);
      const corners = [
        new THREE.Vector3(minX * mmToM, elev, minY * mmToM),
        new THREE.Vector3(maxX * mmToM, elev, minY * mmToM),
        new THREE.Vector3(maxX * mmToM, elev, maxY * mmToM),
        new THREE.Vector3(minX * mmToM, elev, maxY * mmToM),
      ];
      const mat = makeMaterial(r.material || 'tile');
      for (let i = 0; i < 4; i++) {
        const a = corners[i], b = corners[(i + 1) % 4];
        const triGeo = new THREE.BufferGeometry();
        const verts = new Float32Array([
          a.x, a.y, a.z, b.x, b.y, b.z, apex.x, apex.y, apex.z
        ]);
        triGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
        triGeo.computeVertexNormals();
        const triMesh = new THREE.Mesh(triGeo, mat);
        triMesh.castShadow = showShadows; triMesh.receiveShadow = true;
        group.add(triMesh);
      }
    } else if (r.roofType === 'shed') {
      // Single slope shed roof
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of r.points) {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      }
      const w = (maxX - minX) * mmToM, d = (maxY - minY) * mmToM;
      const riseH = w * Math.tan(pitchRad);
      
      const shedGeo = new THREE.BufferGeometry();
      const v = new Float32Array([
        minX * mmToM, elev, minY * mmToM,
        maxX * mmToM, elev, minY * mmToM,
        maxX * mmToM, elev, maxY * mmToM,
        minX * mmToM, elev, minY * mmToM,
        maxX * mmToM, elev, maxY * mmToM,
        minX * mmToM, elev + riseH, maxY * mmToM,
      ]);
      shedGeo.setAttribute('position', new THREE.BufferAttribute(v, 3));
      shedGeo.computeVertexNormals();
      const shedMesh = new THREE.Mesh(shedGeo, makeMaterial(r.material || 'tile'));
      shedMesh.castShadow = showShadows; shedMesh.receiveShadow = true;
      group.add(shedMesh);
    } else {
      // Fallback: flat extrude for mansard/butterfly/other
      const shape = new THREE.Shape();
      shape.moveTo(r.points[0].x * mmToM, r.points[0].y * mmToM);
      for (let i = 1; i < r.points.length; i++) shape.lineTo(r.points[i].x * mmToM, r.points[i].y * mmToM);
      shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false });
      const mesh = new THREE.Mesh(geo, makeMaterial(r.material || 'concrete'));
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = elev;
      mesh.castShadow = showShadows; mesh.receiveShadow = true;
      group.add(mesh);
    }
  };

  // ─── Build stair with proper geometry ───────────────────────────
  const buildStair3D = (st: StairEntity) => {
    const w = st.width * mmToM, l = st.length * mmToM, h = st.height * mmToM;
    const n = Math.max(1, st.treadNumber);
    const group = addArchGroup(st.id, 'stair');
    const mat = makeMaterial('timber');

    if (st.stairType === 'spiral') {
      const radius = w / 2;
      const anglePerStep = (2 * Math.PI) / n;
      for (let i = 0; i < n; i++) {
        const tH = h / n;
        const treadGeo = new THREE.CylinderGeometry(radius, radius, tH * 0.3, 16, 1, false, i * anglePerStep, anglePerStep * 0.9);
        const tread = new THREE.Mesh(treadGeo, mat);
        tread.position.y = tH * (i + 0.5);
        tread.castShadow = showShadows; tread.receiveShadow = true;
        group.add(tread);
      }
      // Center pole
      const poleGeo = new THREE.CylinderGeometry(0.05, 0.05, h, 8);
      const pole = new THREE.Mesh(poleGeo, makeMaterial('steel'));
      pole.position.y = h / 2;
      pole.castShadow = showShadows;
      group.add(pole);
    } else {
      // Straight / L / U stairs
      for (let i = 0; i < n; i++) {
        const treadH = h / n;
        const treadD = l / n;
        const geo = new THREE.BoxGeometry(w, treadH, treadD);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(w / 2, treadH * (i + 0.5), treadD * (i + 0.5));
        mesh.castShadow = showShadows; mesh.receiveShadow = true;
        group.add(mesh);
      }
      // Stringer sides
      const stringerShape = new THREE.Shape();
      stringerShape.moveTo(0, 0);
      stringerShape.lineTo(l, 0);
      stringerShape.lineTo(l, h);
      stringerShape.closePath();
      const strGeo = new THREE.ExtrudeGeometry(stringerShape, { depth: 0.04, bevelEnabled: false });
      const strMat = makeMaterial('timber');
      const str1 = new THREE.Mesh(strGeo, strMat);
      str1.position.z = 0;
      str1.castShadow = showShadows;
      group.add(str1);
      const str2 = new THREE.Mesh(strGeo.clone(), strMat);
      str2.position.z = w;
      str2.castShadow = showShadows;
      group.add(str2);
    }

    group.position.set(st.x * mmToM, 0, st.y * mmToM);
    group.rotation.y = -(st.rotation || 0);
  };

  // ─── Build curtain wall with mullions ───────────────────────────
  const buildCurtainWall3D = (cw: CurtainWallEntity) => {
    const dx = cw.x2 - cw.x1, dy = cw.y2 - cw.y1;
    const len = Math.hypot(dx, dy) * mmToM;
    const h = cw.height * mmToM;
    if (len < 0.01) return;

    const group = addArchGroup(cw.id, 'curtainwall');
    const cx = (cw.x1 + cw.x2) / 2 * mmToM, cz = (cw.y1 + cw.y2) / 2 * mmToM;
    const angle = -Math.atan2(dy, dx);

    // Glass panels
    const mullionW = 0.05;
    const transomW = 0.04;
    const mSpacing = Math.max(0.3, cw.mullionSpacing * mmToM);
    const tSpacing = Math.max(0.3, cw.transomSpacing * mmToM);
    const nMullions = Math.floor(len / mSpacing);
    const nTransoms = Math.floor(h / tSpacing);

    // Full glass
    const glassGeo = new THREE.BoxGeometry(len, h, 0.02);
    const glassMesh = new THREE.Mesh(glassGeo, makeMaterial('glass'));
    glassMesh.position.set(cx, h / 2, cz);
    glassMesh.rotation.y = angle;
    glassMesh.receiveShadow = true;
    group.add(glassMesh);

    // Mullions (vertical)
    const mullionMat = makeMaterial('aluminium');
    for (let i = 0; i <= nMullions; i++) {
      const t = i / nMullions;
      const mx = (cw.x1 + dx * t) * mmToM;
      const mz = (cw.y1 + dy * t) * mmToM;
      const mGeo = new THREE.BoxGeometry(mullionW, h, mullionW);
      const m = new THREE.Mesh(mGeo, mullionMat);
      m.position.set(mx, h / 2, mz);
      m.castShadow = showShadows;
      group.add(m);
    }

    // Transoms (horizontal)
    for (let i = 0; i <= nTransoms; i++) {
      const y = i * tSpacing;
      const tGeo = new THREE.BoxGeometry(len, transomW, transomW);
      const t = new THREE.Mesh(tGeo, mullionMat);
      t.position.set(cx, y, cz);
      t.rotation.y = angle;
      t.castShadow = showShadows;
      group.add(t);
    }
  };

  // ─── Build railing with balusters ────────────────────────────────
  const buildRailing3D = (rail: RailingEntity) => {
    if (rail.points.length < 2) return;
    const group = addArchGroup(rail.id, 'railing');
    const h = rail.height * mmToM;
    const railMatKey = rail.railType === 'glass' ? 'glass' : rail.railType === 'wood' ? 'timber' : 'steel';

    for (let i = 0; i < rail.points.length - 1; i++) {
      const p1 = rail.points[i], p2 = rail.points[i + 1];
      const dx = p2.x - p1.x, dy = p2.y - p1.y;
      const segLen = Math.hypot(dx, dy) * mmToM;
      const angle = -Math.atan2(dy, dx);
      const cx = (p1.x + p2.x) / 2 * mmToM, cz = (p1.y + p2.y) / 2 * mmToM;

      // Top rail
      const topGeo = new THREE.BoxGeometry(segLen, 0.04, 0.04);
      const topMesh = new THREE.Mesh(topGeo, makeMaterial(railMatKey));
      topMesh.position.set(cx, h, cz);
      topMesh.rotation.y = angle;
      topMesh.castShadow = showShadows;
      group.add(topMesh);

      // Balusters
      if (rail.railType !== 'glass') {
        const spacing = Math.max(0.1, rail.balusterSpacing * mmToM);
        const nBal = Math.floor(segLen / spacing);
        for (let b = 0; b <= nBal; b++) {
          const t = nBal > 0 ? b / nBal : 0;
          const bx = (p1.x + dx * t) * mmToM;
          const bz = (p1.y + dy * t) * mmToM;
          const balGeo = new THREE.CylinderGeometry(0.012, 0.012, h, 6);
          const bal = new THREE.Mesh(balGeo, makeMaterial(railMatKey));
          bal.position.set(bx, h / 2, bz);
          bal.castShadow = showShadows;
          group.add(bal);
        }
      } else {
        // Glass panel
        const glassGeo = new THREE.BoxGeometry(segLen, h * 0.9, 0.01);
        const glassMesh = new THREE.Mesh(glassGeo, makeMaterial('glass'));
        glassMesh.position.set(cx, h * 0.45, cz);
        glassMesh.rotation.y = angle;
        group.add(glassMesh);
      }
    }
  };

  // ─── Build MEP pipes in 3D ──────────────────────────────────────
  const buildPipe3D = (pipe: PipeEntity) => {
    if (pipe.points.length < 2) return;
    const group = addArchGroup(pipe.id, 'pipe');
    const r = (pipe.diameter || 100) * mmToM / 2;
    const pMat = pipe.system === 'gas' ? makeMaterial('copper') : makeMaterial('pvc');

    for (let i = 0; i < pipe.points.length - 1; i++) {
      const p1 = pipe.points[i], p2 = pipe.points[i + 1];
      const dx = p2.x - p1.x, dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy) * mmToM;
      if (len < 0.001) continue;

      const pipeGeo = new THREE.CylinderGeometry(r, r, len, 12);
      const pipeMesh = new THREE.Mesh(pipeGeo, pMat);
      const cx = (p1.x + p2.x) / 2 * mmToM, cz = (p1.y + p2.y) / 2 * mmToM;
      pipeMesh.position.set(cx, 2.5, cz); // pipes at ceiling height
      pipeMesh.rotation.z = Math.PI / 2;
      pipeMesh.rotation.y = -Math.atan2(dy, dx);
      pipeMesh.castShadow = showShadows;
      group.add(pipeMesh);

      // Elbow joints
      if (i > 0) {
        const jointGeo = new THREE.SphereGeometry(r * 1.2, 8, 8);
        const joint = new THREE.Mesh(jointGeo, pMat);
        joint.position.set(p1.x * mmToM, 2.5, p1.y * mmToM);
        group.add(joint);
      }
    }
  };

  // ─── Build duct in 3D ──────────────────────────────────────────
  const buildDuct3D = (duct: DuctEntity) => {
    if (duct.points.length < 2) return;
    const group = addArchGroup(duct.id, 'duct');
    const dW = (duct.width || 300) * mmToM, dH = (duct.height || 200) * mmToM;
    const dMat = makeMaterial('metal_panel');

    for (let i = 0; i < duct.points.length - 1; i++) {
      const p1 = duct.points[i], p2 = duct.points[i + 1];
      const dx = p2.x - p1.x, dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy) * mmToM;
      if (len < 0.001) continue;

      const ductGeo = new THREE.BoxGeometry(len, dH, dW);
      const ductMesh = new THREE.Mesh(ductGeo, dMat);
      const cx = (p1.x + p2.x) / 2 * mmToM, cz = (p1.y + p2.y) / 2 * mmToM;
      ductMesh.position.set(cx, 2.7, cz); // above pipes
      ductMesh.rotation.y = -Math.atan2(dy, dx);
      ductMesh.castShadow = showShadows; ductMesh.receiveShadow = true;
      group.add(ductMesh);
    }
  };

  // ─── Build furniture/fixture 3D ────────────────────────────────
  const buildFurniture3D = (f: FurnitureEntity | ApplianceEntity | FixtureEntity) => {
    const w = f.width * mmToM, d = f.depth * mmToM;
    let h = 0.75; // default desk/table height
    if (f.category === 'chair') h = 0.45;
    else if (f.category === 'bed') h = 0.5;
    else if (f.category === 'cabinet' || f.category === 'shelf') h = 1.8;
    else if (f.category === 'sofa') h = 0.7;
    else if (f.category === 'fridge') h = 1.7;
    else if (f.category === 'toilet') h = 0.4;
    else if (f.category === 'bathtub') h = 0.55;
    else if (f.category === 'shower') h = 2.1;
    else if (f.category === 'sink' || f.category === 'vanity') h = 0.85;
    else if (f.category === 'oven' || f.category === 'washer' || f.category === 'dryer') h = 0.9;

    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = addArchMesh(geo, makeMaterial('timber'), f.id, f.type);
    if (mesh) {
      mesh.position.set(f.x * mmToM + w / 2, h / 2, f.y * mmToM + d / 2);
      mesh.rotation.y = -(f.rotation || 0);
    }
  };

  // ─── Build landscape (trees) ───────────────────────────────────
  const buildLandscape3D = (ls: LandscapeEntity) => {
    const group = addArchGroup(ls.id, 'landscape');
    const r = ls.radius * mmToM;

    if (ls.plantType === 'tree') {
      // Trunk
      const trunkGeo = new THREE.CylinderGeometry(r * 0.1, r * 0.15, r * 2, 8);
      const trunk = new THREE.Mesh(trunkGeo, makeMaterial('timber'));
      trunk.position.set(ls.x * mmToM, r, ls.y * mmToM);
      trunk.castShadow = showShadows;
      group.add(trunk);
      // Canopy
      const canopyGeo = new THREE.SphereGeometry(r, 12, 12);
      const canopyMat = new THREE.MeshStandardMaterial({ color: 0x2d6b2f, roughness: 0.9 });
      if (renderMode === 'wireframe') canopyMat.wireframe = true;
      const canopy = new THREE.Mesh(canopyGeo, canopyMat);
      canopy.position.set(ls.x * mmToM, r * 2.5, ls.y * mmToM);
      canopy.castShadow = showShadows; canopy.receiveShadow = true;
      group.add(canopy);
    } else if (ls.plantType === 'shrub') {
      const shrubGeo = new THREE.SphereGeometry(r * 0.6, 8, 8);
      const shrubMat = new THREE.MeshStandardMaterial({ color: 0x3a7a3a, roughness: 0.9 });
      if (renderMode === 'wireframe') shrubMat.wireframe = true;
      const shrub = new THREE.Mesh(shrubGeo, shrubMat);
      shrub.position.set(ls.x * mmToM, r * 0.6, ls.y * mmToM);
      shrub.castShadow = showShadows;
      group.add(shrub);
    }
  };

  // ─── Build fence 3D ───────────────────────────────────────────
  const buildFence3D = (f: FenceSiteEntity) => {
    if (f.points.length < 2) return;
    const group = addArchGroup(f.id, 'fence');
    const h = f.height * mmToM;
    const fMat = f.fenceType === 'wood' ? makeMaterial('timber') : makeMaterial('steel');

    for (let i = 0; i < f.points.length - 1; i++) {
      const p1 = f.points[i], p2 = f.points[i + 1];
      const dx = p2.x - p1.x, dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy) * mmToM;
      const cx = (p1.x + p2.x) / 2 * mmToM, cz = (p1.y + p2.y) / 2 * mmToM;
      const angle = -Math.atan2(dy, dx);

      // Fence panel
      const panelGeo = new THREE.BoxGeometry(len, h, 0.02);
      const panel = new THREE.Mesh(panelGeo, fMat);
      panel.position.set(cx, h / 2, cz);
      panel.rotation.y = angle;
      panel.castShadow = showShadows;
      group.add(panel);

      // Posts
      for (const p of [p1, p2]) {
        const postGeo = new THREE.BoxGeometry(0.06, h + 0.1, 0.06);
        const post = new THREE.Mesh(postGeo, fMat);
        post.position.set(p.x * mmToM, (h + 0.1) / 2, p.y * mmToM);
        post.castShadow = showShadows;
        group.add(post);
      }
    }
  };

  // ─── Build footing 3D ────────────────────────────────────────
  const buildFooting3D = (ft: FootingEntity) => {
    const w = ft.width * mmToM, d = ft.depth * mmToM, t = ft.thickness * mmToM;
    const geo = new THREE.BoxGeometry(w, t, d);
    const mesh = addArchMesh(geo, makeMaterial('concrete'), ft.id, 'footing');
    if (mesh) {
      mesh.position.set(ft.x * mmToM + w / 2, -t / 2, ft.y * mmToM + d / 2);
    }
  };

  // ─── Build structural member 3D ──────────────────────────────
  const buildStructuralMember3D = (sm: StructuralMemberEntity) => {
    const dx = sm.x2 - sm.x1, dy = sm.y2 - sm.y1;
    const len = Math.hypot(dx, dy) * mmToM;
    const w = sm.width * mmToM, d = sm.depth * mmToM;
    if (len < 0.01) return;
    const geo = new THREE.BoxGeometry(len, d, w);
    const mesh = addArchMesh(geo, makeMaterial('steel'), sm.id, 'structural_member');
    if (mesh) {
      const cx = (sm.x1 + sm.x2) / 2 * mmToM, cz = (sm.y1 + sm.y2) / 2 * mmToM;
      mesh.position.set(cx, 3.0, cz); // structural level
      mesh.rotation.y = -Math.atan2(dy, dx);
    }
  };

  // ═══════════════════════════════════════════════════════════════════
  // MAIN BUILD: Convert all entities to 3D
  // ═══════════════════════════════════════════════════════════════════
  const buildFromEntities = () => {
    clearArchObjects();

    for (const entity of floor.entities) {
      // Category visibility filter
      if (entity.type === 'wall' && !visibleCategories.walls) continue;
      if (entity.type === 'slab' && !visibleCategories.slabs) continue;
      if (entity.type === 'roof' && !visibleCategories.roofs) continue;
      if ((entity.type === 'column') && !visibleCategories.columns) continue;
      if (entity.type === 'beam' && !visibleCategories.beams) continue;
      if ((entity.type === 'stair' || entity.type === 'ramp') && !visibleCategories.stairs) continue;
      if (entity.type === 'door' && !visibleCategories.doors) continue;
      if (entity.type === 'window' && !visibleCategories.windows) continue;
      if ((entity.type === 'furniture' || entity.type === 'appliance' || entity.type === 'fixture') && !visibleCategories.furniture) continue;
      if (entity.type === 'room' && !visibleCategories.rooms) continue;

      switch (entity.type) {
        case 'wall': { buildWall3D(entity as WallEntity); break; }
        case 'column': {
          const col = entity as ColumnEntity;
          const w = col.width * mmToM, d = col.depth * mmToM, h = col.height * mmToM;
          let geo: THREE.BufferGeometry;
          if (col.shape === 'circular') {
            geo = new THREE.CylinderGeometry(w / 2, w / 2, h, 24);
          } else if (col.shape === 'steel_h' || col.shape === 'steel_i') {
            // H/I-beam profile column
            const group = addArchGroup(col.id, 'column');
            const flangeT = Math.min(w * 0.15, d * 0.15);
            const webT = flangeT * 0.6;
            // Top flange
            const tf = new THREE.Mesh(new THREE.BoxGeometry(w, h, flangeT), makeMaterial('steel'));
            tf.position.y = h / 2;
            tf.position.z = (d - flangeT) / 2;
            group.add(tf);
            // Bottom flange
            const bf = new THREE.Mesh(new THREE.BoxGeometry(w, h, flangeT), makeMaterial('steel'));
            bf.position.y = h / 2;
            bf.position.z = -(d - flangeT) / 2;
            group.add(bf);
            // Web
            const wb = new THREE.Mesh(new THREE.BoxGeometry(webT, h, d - 2 * flangeT), makeMaterial('steel'));
            wb.position.y = h / 2;
            group.add(wb);
            group.position.set(col.x * mmToM + w / 2, 0, col.y * mmToM + d / 2);
            group.rotation.y = -(col.rotation || 0);
            break;
          } else {
            geo = new THREE.BoxGeometry(w, h, d);
          }
          const mesh = addArchMesh(geo, makeMaterial(col.material || 'concrete'), col.id, 'column');
          if (mesh) {
            mesh.position.set(col.x * mmToM + w / 2, h / 2, col.y * mmToM + d / 2);
            mesh.rotation.y = -(col.rotation || 0);
          }
          break;
        }
        case 'beam': {
          const b = entity as BeamEntity;
          const dx = b.x2 - b.x1, dy = b.y2 - b.y1;
          const len = Math.hypot(dx, dy) * mmToM;
          const bW = b.width * mmToM, bD = b.depth * mmToM;
          if (len < 0.01) break;
          const geo = new THREE.BoxGeometry(len, bD, bW);
          const mesh = addArchMesh(geo, makeMaterial(b.material || 'concrete'), b.id, 'beam');
          if (mesh) {
            const cx = (b.x1 + b.x2) / 2 * mmToM, cy = (b.y1 + b.y2) / 2 * mmToM;
            mesh.position.set(cx, b.elevation * mmToM, cy);
            mesh.rotation.y = -Math.atan2(dy, dx);
          }
          break;
        }
        case 'slab': {
          const s = entity as SlabEntity;
          if (s.points.length < 3) break;
          const shape = new THREE.Shape();
          shape.moveTo(s.points[0].x * mmToM, s.points[0].y * mmToM);
          for (let i = 1; i < s.points.length; i++) shape.lineTo(s.points[i].x * mmToM, s.points[i].y * mmToM);
          shape.closePath();
          const geo = new THREE.ExtrudeGeometry(shape, { depth: s.thickness * mmToM, bevelEnabled: false });
          const mesh = addArchMesh(geo, makeMaterial(s.material || 'concrete'), s.id, 'slab');
          if (mesh) {
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.y = s.elevation * mmToM;
          }
          break;
        }
        case 'roof':      { buildRoof3D(entity as RoofEntity); break; }
        case 'stair':     { buildStair3D(entity as StairEntity); break; }
        case 'ramp': {
          const rp = entity as RampEntity;
          const w = rp.width * mmToM, l = rp.length * mmToM, h = rp.height * mmToM;
          const shape = new THREE.Shape();
          shape.moveTo(0, 0); shape.lineTo(l, 0); shape.lineTo(l, h); shape.closePath();
          const geo = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
          const mesh = addArchMesh(geo, makeMaterial('concrete'), rp.id, 'ramp');
          if (mesh) {
            mesh.position.set(rp.x * mmToM, 0, rp.y * mmToM);
            mesh.rotation.y = -(rp.rotation || 0);
          }
          break;
        }
        case 'door': {
          const d = entity as DoorEntity;
          if (d.wallId) break; // handled by wall with openings
          const dW = d.width * mmToM, dH = d.height * mmToM;
          const group = addArchGroup(d.id, 'door');
          // Door frame
          const frameMat = makeMaterial('timber');
          // Left post
          const lp = new THREE.Mesh(new THREE.BoxGeometry(0.04, dH, 0.04), frameMat);
          lp.position.set(0, dH / 2, 0); group.add(lp);
          // Right post
          const rp = new THREE.Mesh(new THREE.BoxGeometry(0.04, dH, 0.04), frameMat);
          rp.position.set(dW, dH / 2, 0); group.add(rp);
          // Header
          const hp = new THREE.Mesh(new THREE.BoxGeometry(dW + 0.08, 0.04, 0.04), frameMat);
          hp.position.set(dW / 2, dH, 0); group.add(hp);
          // Door leaf
          const leafMat = makeMaterial('timber');
          const leaf = new THREE.Mesh(new THREE.BoxGeometry(dW - 0.02, dH - 0.02, 0.04), leafMat);
          leaf.position.set(dW / 2, dH / 2, 0);
          leaf.castShadow = showShadows;
          group.add(leaf);
          group.position.set(d.x * mmToM, 0, d.y * mmToM);
          break;
        }
        case 'window': {
          const wn = entity as WindowEntity;
          if (wn.wallId) break; // handled by wall
          const wW = wn.width * mmToM, wH = wn.height * mmToM;
          const sillH = wn.sillHeight * mmToM;
          const group = addArchGroup(wn.id, 'window');
          // Frame
          const frameMat = makeMaterial('aluminium');
          const frameShape = new THREE.Shape();
          frameShape.moveTo(0, 0); frameShape.lineTo(wW, 0); frameShape.lineTo(wW, wH); frameShape.lineTo(0, wH); frameShape.closePath();
          const holeShape = new THREE.Path();
          holeShape.moveTo(0.03, 0.03); holeShape.lineTo(wW - 0.03, 0.03); holeShape.lineTo(wW - 0.03, wH - 0.03); holeShape.lineTo(0.03, wH - 0.03); holeShape.closePath();
          frameShape.holes.push(holeShape);
          const frameGeo = new THREE.ExtrudeGeometry(frameShape, { depth: 0.06, bevelEnabled: false });
          const frame = new THREE.Mesh(frameGeo, frameMat);
          frame.castShadow = showShadows;
          group.add(frame);
          // Glass
          const glassGeo = new THREE.BoxGeometry(wW - 0.06, wH - 0.06, 0.01);
          const glass = new THREE.Mesh(glassGeo, makeMaterial('glass'));
          glass.position.set(wW / 2, wH / 2, 0.03);
          group.add(glass);
          group.position.set(wn.x * mmToM, sillH, wn.y * mmToM);
          break;
        }
        case 'curtainwall': { buildCurtainWall3D(entity as CurtainWallEntity); break; }
        case 'railing':     { buildRailing3D(entity as RailingEntity); break; }
        case 'ceiling': {
          const c = entity as CeilingEntity;
          if (c.points.length < 3) break;
          const shape = new THREE.Shape();
          shape.moveTo(c.points[0].x * mmToM, c.points[0].y * mmToM);
          for (let i = 1; i < c.points.length; i++) shape.lineTo(c.points[i].x * mmToM, c.points[i].y * mmToM);
          shape.closePath();
          const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: false });
          const mesh = addArchMesh(geo, makeMaterial(c.material || 'drywall'), c.id, 'ceiling');
          if (mesh) {
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.y = c.height * mmToM;
          }
          break;
        }
        case 'room': {
          const rm = entity as RoomEntity;
          if (rm.points.length < 3) break;
          const shape = new THREE.Shape();
          shape.moveTo(rm.points[0].x * mmToM, rm.points[0].y * mmToM);
          for (let i = 1; i < rm.points.length; i++) shape.lineTo(rm.points[i].x * mmToM, rm.points[i].y * mmToM);
          shape.closePath();
          const geo = new THREE.ShapeGeometry(shape);
          const mat = new THREE.MeshStandardMaterial({ color: 0x22c55e, transparent: true, opacity: 0.06, side: THREE.DoubleSide });
          const mesh = new THREE.Mesh(geo, mat);
          mesh.rotation.x = -Math.PI / 2;
          mesh.position.y = 0.01;
          mesh.userData['archflow'] = true; mesh.userData['id'] = rm.id; mesh.userData['entityType'] = 'room';
          sceneRef.current?.add(mesh);
          entityMeshMap.current.set(rm.id, mesh);
          break;
        }
        case 'zone': {
          const ze = entity as ZoneEntity;
          if (ze.points.length < 3) break;
          const zShape = new THREE.Shape();
          zShape.moveTo(ze.points[0].x * mmToM, ze.points[0].y * mmToM);
          for (let i = 1; i < ze.points.length; i++) zShape.lineTo(ze.points[i].x * mmToM, ze.points[i].y * mmToM);
          zShape.closePath();
          const zGeo = new THREE.ShapeGeometry(zShape);
          const zColor = new THREE.Color(ze.fillColor || '#58a6ff');
          const zMat = new THREE.MeshStandardMaterial({ color: zColor, transparent: true, opacity: ze.fillOpacity ?? 0.15, side: THREE.DoubleSide });
          const zMesh = new THREE.Mesh(zGeo, zMat);
          zMesh.rotation.x = -Math.PI / 2;
          zMesh.position.y = 0.02;
          zMesh.userData['archflow'] = true; zMesh.userData['id'] = ze.id; zMesh.userData['entityType'] = 'zone';
          sceneRef.current?.add(zMesh);
          entityMeshMap.current.set(ze.id, zMesh);
          break;
        }
        case 'furniture':
        case 'appliance':
        case 'fixture':
          buildFurniture3D(entity as FurnitureEntity);
          break;
        case 'pipe':      { if (visibleCategories.mep) buildPipe3D(entity as PipeEntity); break; }
        case 'duct':      { if (visibleCategories.mep) buildDuct3D(entity as DuctEntity); break; }
        case 'conduit': {
          if (visibleCategories.mep) {
            const cd = entity as ConduitEntity;
            if (cd.points.length >= 2) {
              const pipeEquiv: PipeEntity = { ...cd, type: 'pipe', diameter: cd.diameter, material: 'PVC', system: 'electrical' };
              buildPipe3D(pipeEquiv);
            }
          }
          break;
        }
        case 'landscape':  { if (visibleCategories.site) buildLandscape3D(entity as LandscapeEntity); break; }
        case 'fence_site': { if (visibleCategories.site) buildFence3D(entity as FenceSiteEntity); break; }
        case 'paving': {
          if (!visibleCategories.site) break;
          const pv = entity as PavingEntity;
          if (pv.points.length < 3) break;
          const shape = new THREE.Shape();
          shape.moveTo(pv.points[0].x * mmToM, pv.points[0].y * mmToM);
          for (let i = 1; i < pv.points.length; i++) shape.lineTo(pv.points[i].x * mmToM, pv.points[i].y * mmToM);
          shape.closePath();
          const geo = new THREE.ExtrudeGeometry(shape, { depth: pv.thickness * mmToM, bevelEnabled: false });
          const mesh = addArchMesh(geo, makeMaterial(pv.material === 'brick' ? 'brick' : 'stone'), pv.id, 'paving');
          if (mesh) {
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.y = 0.01;
          }
          break;
        }
        case 'footing':           { buildFooting3D(entity as FootingEntity); break; }
        case 'structural_member': { buildStructuralMember3D(entity as StructuralMemberEntity); break; }
        case 'retaining_wall': {
          const rw = entity as RetainingWallEntity;
          if (rw.points.length < 2) break;
          const rwH = rw.height * mmToM, rwT = rw.thickness * mmToM;
          for (let i = 0; i < rw.points.length - 1; i++) {
            const p1 = rw.points[i], p2 = rw.points[i + 1];
            const dx2 = p2.x - p1.x, dy2 = p2.y - p1.y;
            const len = Math.hypot(dx2, dy2) * mmToM;
            if (len < 0.01) continue;
            const geo = new THREE.BoxGeometry(len, rwH, rwT);
            const mesh = addArchMesh(geo, makeMaterial('concrete'), rw.id + '_' + i, 'retaining_wall');
            if (mesh) {
              mesh.position.set((p1.x + p2.x) / 2 * mmToM, rwH / 2, (p1.y + p2.y) / 2 * mmToM);
              mesh.rotation.y = -Math.atan2(dy2, dx2);
            }
          }
          break;
        }
        case 'elevator': {
          const el = entity as any;
          const w = (el.width || 2000) * mmToM, d = (el.depth || 2000) * mmToM;
          const h = floor.floorHeight * mmToM;
          const group = addArchGroup(el.id, 'elevator');
          // Shaft walls (3 sides)
          const wallMat = makeMaterial('concrete');
          const wt = 0.2;
          // Back wall
          const bw = new THREE.Mesh(new THREE.BoxGeometry(w, h, wt), wallMat);
          bw.position.set(w / 2, h / 2, 0); group.add(bw);
          // Left wall
          const lw = new THREE.Mesh(new THREE.BoxGeometry(wt, h, d), wallMat);
          lw.position.set(0, h / 2, d / 2); group.add(lw);
          // Right wall
          const rw = new THREE.Mesh(new THREE.BoxGeometry(wt, h, d), wallMat);
          rw.position.set(w, h / 2, d / 2); group.add(rw);
          // Door opening (front - just the frame)
          const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, 0.05), makeMaterial('steel'));
          doorFrame.position.set(w / 2, 2.1, d); group.add(doorFrame);
          group.position.set(el.x * mmToM, 0, el.y * mmToM);
          break;
        }
        // MEP devices rendered as small boxes
        case 'sprinkler': case 'diffuser': case 'outlet': case 'switch_mep':
        case 'panel_board': case 'transformer': case 'valve': case 'pump': {
          if (!visibleCategories.mep) break;
          const dev = entity as MEPDeviceEntity;
          const sz = entity.type === 'panel_board' ? 0.4 : entity.type === 'transformer' ? 0.6 : 0.1;
          const geo = entity.type === 'sprinkler' || entity.type === 'valve' || entity.type === 'pump'
            ? new THREE.SphereGeometry(sz / 2, 8, 8)
            : new THREE.BoxGeometry(sz, sz, sz * 0.5);
          const mesh = addArchMesh(geo, makeMaterial('steel'), dev.id, entity.type);
          const devH = entity.type === 'sprinkler' || entity.type === 'diffuser' ? 2.8 : 1.2;
          if (mesh) {
            mesh.position.set(dev.x * mmToM, devH, dev.y * mmToM);
            mesh.rotation.y = -(dev.rotation || 0);
          }
          break;
        }
      }
    }

    if (rendererRef.current && showShadows) {
      rendererRef.current.shadowMap.needsUpdate = true;
    }
    fitSunShadowToModel();
  };

  useEffect(() => {
    if (!sceneRef.current) return;

    if (floor.entities.length === 0) {
      clearArchObjects();
      setSceneData(null);
      setHasModel(false);
      return;
    }

    buildFromEntities();
    setHasModel(true);
  }, [floor.entities, floor.floorHeight, visibleCategories, showShadows]);

  // ─── Build from backend scene data ────────────────────────────
  const buildInstanceBatches = (batches: InstanceBatchPayload[]) => {
    const scene = sceneRef.current;
    if (!scene || batches.length === 0) return;

    for (const batch of batches) {
      const size = batch.prototype_size;
      if (!Array.isArray(size) || size.length !== 3) continue;
      const geo = batch.prototype_type === 'cylinder'
        ? new THREE.CylinderGeometry(size[0] / 2, size[0] / 2, size[1], 16)
        : new THREE.BoxGeometry(size[0], size[1], size[2]);
      (geo as any).computeBoundsTree?.();

      const count = batch.instances?.length || 0;
      if (count === 0) {
        geo.dispose();
        continue;
      }

      const instancedMaterial = makeMaterial(batch.material || 'concrete');
      if (enableCSM && csmRef.current && instancedMaterial instanceof THREE.MeshStandardMaterial) {
        csmRef.current.setupMaterial(instancedMaterial);
      }
      const iMesh = new THREE.InstancedMesh(geo, instancedMaterial, count);
      iMesh.castShadow = showShadows;
      iMesh.receiveShadow = true;
      iMesh.userData['archflow'] = true;
      iMesh.userData['id'] = `inst_${batch.prototype_type}_${Math.random().toString(36).slice(2, 7)}`;
      iMesh.userData['entityType'] = `instanced_${batch.prototype_type}`;

      const mat = new THREE.Matrix4();
      batch.instances.forEach((inst, idx) => {
        if (Array.isArray(inst.matrix) && inst.matrix.length === 16) {
          mat.fromArray(inst.matrix);
          iMesh.setMatrixAt(idx, mat);
        }
      });
      iMesh.instanceMatrix.needsUpdate = true;
      scene.add(iMesh);
    }
  };

  const buildThreeScene = (
    data: Pick<NativeScenePayload, 'scene_objects'>,
    options?: { clearExisting?: boolean; finalize?: boolean; skipObjectIds?: Set<string> }
  ) => {
    if (options?.clearExisting !== false) {
      clearArchObjects();
    }
    const objects = data.scene_objects || [];
    objects.forEach(obj => {
      if (options?.skipObjectIds?.has(obj.id)) return;
      const [w, h, d] = obj.size;
      const geo = obj.type === 'cylinder'
        ? new THREE.CylinderGeometry(w / 2, w / 2, h, 16)
        : new THREE.BoxGeometry(w, h, d);
      const matKey = obj.material || 'concrete';
      const mesh = addArchMesh(geo, makeMaterial(matKey), obj.id, obj.type);
      if (mesh) {
        mesh.position.set(...obj.position);
        if (obj.rotation_y) mesh.rotation.y = obj.rotation_y;
      }
    });
    if (options?.finalize !== false) {
      fitSunShadowToModel();
    }
  };

  // ─── Reapply render mode ────────────────────────────────────────
  useEffect(() => {
    if (!sceneRef.current || !hasModel) return;
    sceneRef.current.traverse(c => {
      if (c.userData['archflow'] && c instanceof THREE.Mesh && c.material instanceof THREE.MeshStandardMaterial) {
        const mat = c.material;
        mat.wireframe = renderMode === 'wireframe';
        if (renderMode === 'clay') { mat.color.set(0xd0c8c0); mat.roughness = 1; mat.metalness = 0; mat.transparent = false; mat.opacity = 1; }
        if (renderMode === 'xray') { mat.transparent = true; mat.opacity = 0.15; mat.depthWrite = false; }
        if (renderMode === 'solid' || renderMode === 'realistic') { mat.depthWrite = true; }
        mat.needsUpdate = true;
      }
    });
    // Realistic mode — boost exposure
    if (rendererRef.current) {
      const modeExposure = renderMode === 'realistic' ? qualityProfile.exposure + 0.2 : qualityProfile.exposure;
      rendererRef.current.toneMappingExposure = modeExposure;
    }
  }, [renderMode, hasModel, qualityProfile.exposure]);

  // ─── Section / Elevation generation ────────────────────────────
  const generateSection = useCallback(() => {
    // Find section marks in the floor plan
    const sectionMarks = floor.entities.filter(e => e.type === 'section_mark') as SectionMarkEntity[];
    if (sectionMarks.length === 0) {
      // Auto-generate a section through the center
      const walls = floor.entities.filter(e => e.type === 'wall') as WallEntity[];
      if (walls.length === 0) { onStatusChange('No walls found for section'); return; }
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const w of walls) {
        minX = Math.min(minX, w.x1, w.x2); maxX = Math.max(maxX, w.x1, w.x2);
        minY = Math.min(minY, w.y1, w.y2); maxY = Math.max(maxY, w.y1, w.y2);
      }
      const cy = (minY + maxY) / 2;
      
      // Generate section entities: project walls that cross the section line
      const sectionEntities: AnyEntity[] = [];
      const sectionY = cy;
      
      for (const w of walls) {
        // Check if wall crosses the section line (horizontal at sectionY)
        const yMin = Math.min(w.y1, w.y2), yMax = Math.max(w.y1, w.y2);
        if (yMin <= sectionY && yMax >= sectionY) {
          // Wall crosses — show as filled rectangle in section
          const h = w.height * mmToM;
          const thick = w.thickness * mmToM;
          // Project: X stays, Z becomes the section height axis
          const xMid = (w.x1 + w.x2) / 2;
          sectionEntities.push({
            id: 'sec_' + w.id,
            type: 'rectangle' as const,
            layer: 'Section-Cut',
            x: xMid - w.thickness / 2,
            y: 0,
            width: w.thickness,
            height: w.height,
            rotation: 0,
          } as any);
        }
        // Walls behind section line — show as lines
        if (yMin > sectionY) {
          sectionEntities.push({
            id: 'secbg_' + w.id,
            type: 'line' as const,
            layer: 'Section-Background',
            color: '#808080',
            x1: w.x1, y1: 0,
            x2: w.x2, y2: 0,
          } as any);
        }
      }

      // Add slab lines
      const slabs = floor.entities.filter(e => e.type === 'slab') as SlabEntity[];
      for (const s of slabs) {
        if (s.points.length < 2) continue;
        let minSX = Infinity, maxSX = -Infinity;
        for (const p of s.points) { minSX = Math.min(minSX, p.x); maxSX = Math.max(maxSX, p.x); }
        sectionEntities.push({
          id: 'secslab_' + s.id,
          type: 'rectangle' as const,
          layer: 'Section-Cut',
          x: minSX, y: s.elevation,
          width: maxSX - minSX,
          height: s.thickness,
          rotation: 0,
        } as any);
      }

      // Roofs in section
      const roofs = floor.entities.filter(e => e.type === 'roof') as RoofEntity[];
      for (const r of roofs) {
        if (r.points.length < 2) continue;
        let minRX = Infinity, maxRX = -Infinity;
        for (const p of r.points) { minRX = Math.min(minRX, p.x); maxRX = Math.max(maxRX, p.x); }
        sectionEntities.push({
          id: 'secroof_' + r.id,
          type: 'line' as const,
          layer: 'Section-Cut',
          x1: minRX, y1: r.elevation,
          x2: maxRX, y2: r.elevation + r.thickness,
        } as any);
      }

      setSectionResults(prev => [...prev, {
        type: 'section', entities: sectionEntities, label: `Section A-A`
      }]);
      onStatusChange(`Generated section with ${sectionEntities.length} entities`);
    } else {
      onStatusChange(`Processing ${sectionMarks.length} section marks...`);
      // Use existing section marks
      for (const mark of sectionMarks) {
        const sectionEntities: AnyEntity[] = [];
        const lineY = (mark as any).y || 0;
        const walls = floor.entities.filter(e => e.type === 'wall') as WallEntity[];
        for (const w of walls) {
          const yMin = Math.min(w.y1, w.y2), yMax = Math.max(w.y1, w.y2);
          if (yMin <= lineY && yMax >= lineY) {
            sectionEntities.push({
              id: 'sec_' + w.id, type: 'rectangle' as const, layer: 'Section-Cut',
              x: Math.min(w.x1, w.x2) - w.thickness / 2, y: 0,
              width: w.thickness, height: w.height, rotation: 0,
            } as any);
          }
        }
        setSectionResults(prev => [...prev, {
          type: 'section', entities: sectionEntities, label: `Section ${mark.sectionId || 'A'}`
        }]);
      }
    }
  }, [floor, onStatusChange]);

  const generateElevation = useCallback((direction: 'front' | 'back' | 'left' | 'right') => {
    const walls = floor.entities.filter(e => e.type === 'wall') as WallEntity[];
    const doors = floor.entities.filter(e => e.type === 'door') as DoorEntity[];
    const windows = floor.entities.filter(e => e.type === 'window') as WindowEntity[];
    const roofs = floor.entities.filter(e => e.type === 'roof') as RoofEntity[];
    
    if (walls.length === 0) { onStatusChange('No entities for elevation'); return; }

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const w of walls) {
      minX = Math.min(minX, w.x1, w.x2); maxX = Math.max(maxX, w.x1, w.x2);
      minY = Math.min(minY, w.y1, w.y2); maxY = Math.max(maxY, w.y1, w.y2);
    }

    const elevEntities: AnyEntity[] = [];
    const isHorizontalView = direction === 'front' || direction === 'back';
    const targetEdge = direction === 'front' ? minY : direction === 'back' ? maxY : direction === 'left' ? minX : maxX;
    const tolerance = 500; // mm

    for (const w of walls) {
      // For front/back elevation: walls near minY/maxY
      const relevant = isHorizontalView
        ? (Math.abs(Math.min(w.y1, w.y2) - targetEdge) < tolerance || Math.abs(Math.max(w.y1, w.y2) - targetEdge) < tolerance)
        : (Math.abs(Math.min(w.x1, w.x2) - targetEdge) < tolerance || Math.abs(Math.max(w.x1, w.x2) - targetEdge) < tolerance);
      
      if (relevant) {
        const projStart = isHorizontalView ? w.x1 : w.y1;
        const projEnd = isHorizontalView ? w.x2 : w.y2;
        // Wall outline
        elevEntities.push({
          id: 'elev_' + w.id, type: 'rectangle' as const, layer: 'Elevation',
          x: Math.min(projStart, projEnd), y: 0,
          width: Math.abs(projEnd - projStart) || w.thickness,
          height: w.height, rotation: 0,
        } as any);
      }
    }

    // Doors/windows in elevation
    for (const d of doors) {
      elevEntities.push({
        id: 'elevd_' + d.id, type: 'rectangle' as const, layer: 'Elevation-Openings',
        color: '#4a9eff',
        x: d.x, y: 0, width: d.width, height: d.height, rotation: 0,
      } as any);
    }
    for (const w of windows) {
      elevEntities.push({
        id: 'elevw_' + w.id, type: 'rectangle' as const, layer: 'Elevation-Openings',
        color: '#7dd3fc',
        x: w.x, y: w.sillHeight, width: w.width, height: w.height, rotation: 0,
      } as any);
    }

    // Roof in elevation
    for (const r of roofs) {
      if (r.points.length < 2) continue;
      let rMinX = Infinity, rMaxX = -Infinity;
      for (const p of r.points) { rMinX = Math.min(rMinX, p.x); rMaxX = Math.max(rMaxX, p.x); }
      const pitchRad = (r.pitch || 0) * Math.PI / 180;
      const rW = rMaxX - rMinX;
      const ridgeH = (rW / 2) * Math.tan(pitchRad);
      
      if (r.roofType === 'gable' && ridgeH > 0) {
        // Triangular gable end
        elevEntities.push({
          id: 'elevr_' + r.id, type: 'polyline' as const, layer: 'Elevation-Roof',
          points: [
            { x: rMinX, y: r.elevation },
            { x: rMinX + rW / 2, y: r.elevation + ridgeH },
            { x: rMaxX, y: r.elevation },
          ],
          closed: true,
        } as any);
      } else {
        elevEntities.push({
          id: 'elevr_' + r.id, type: 'line' as const, layer: 'Elevation-Roof',
          x1: rMinX, y1: r.elevation, x2: rMaxX, y2: r.elevation,
        } as any);
      }
    }

    setSectionResults(prev => [...prev, {
      type: 'elevation', entities: elevEntities,
      label: `${direction.charAt(0).toUpperCase() + direction.slice(1)} Elevation`
    }]);
    onStatusChange(`Generated ${direction} elevation with ${elevEntities.length} entities`);
  }, [floor, onStatusChange]);

  // ─── Quantity Takeoff ──────────────────────────────────────────
  const calculateQTO = useCallback(() => {
    const walls = floor.entities.filter(e => e.type === 'wall') as WallEntity[];
    const slabs = floor.entities.filter(e => e.type === 'slab') as SlabEntity[];
    const columns = floor.entities.filter(e => e.type === 'column') as ColumnEntity[];
    const doors = floor.entities.filter(e => e.type === 'door') as DoorEntity[];
    const windows = floor.entities.filter(e => e.type === 'window') as WindowEntity[];

    let wallArea = 0, wallVolume = 0;
    for (const w of walls) {
      const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) / 1000;
      const h = w.height / 1000;
      wallArea += len * h;
      wallVolume += len * h * w.thickness / 1000;
    }

    let slabArea = 0, slabVolume = 0;
    for (const s of slabs) {
      if (s.points.length < 3) continue;
      let a = 0;
      for (let i = 0; i < s.points.length; i++) {
        const j = (i + 1) % s.points.length;
        a += s.points[i].x * s.points[j].y - s.points[j].x * s.points[i].y;
      }
      const area = Math.abs(a / 2) / 1e6;
      slabArea += area;
      slabVolume += area * s.thickness / 1000;
    }

    const report = [
      `=== QUANTITY TAKEOFF ===`,
      `Walls: ${walls.length} — Area: ${wallArea.toFixed(2)} m² — Volume: ${wallVolume.toFixed(2)} m³`,
      `Slabs: ${slabs.length} — Area: ${slabArea.toFixed(2)} m² — Volume: ${slabVolume.toFixed(2)} m³`,
      `Columns: ${columns.length}`,
      `Doors: ${doors.length}`,
      `Windows: ${windows.length}`,
      `Total entities: ${floor.entities.length}`,
    ].join('\n');
    onStatusChange(report);
  }, [floor, onStatusChange]);

  // ─── Export IFC ───────────────────────────────────────────────
  const handleExportIFC = useCallback(async () => {
    onStatusChange('Exporting IFC4...');
    try {
      await invoke('export_ifc', {
        floorData: JSON.stringify({ entities: floor.entities, name: floor.name }),
        outPath: `${project.projectName}_${floor.name}.ifc`,
      });
      onStatusChange('IFC export complete');
    } catch (err) {
      onStatusChange(`IFC export: ${err}`);
    }
  }, [floor, project, onStatusChange]);

  // ─── Selected entity info ─────────────────────────────────────
  const selectedEntity = selectedObjectId
    ? floor.entities.find(e => e.id === selectedObjectId)
    : null;

  return (
    <div className="threed-tab">
      {/* ─── Left Sidebar: BIM Tools & Categories ─── */}
      <div className="threed-sidebar">
        {/* Tool mode */}
        <div className="tool-group">
          <div className="tool-group-label" style={{textAlign:'left',paddingLeft:12}}>Navigate</div>
          {([['select','Select',MousePointer],['orbit','Orbit',RotateCw],['pan','Pan',Move]] as const).map(([tool,label,Icon]) => (
            <button key={tool} className={`sidebar-btn${activeTool === tool ? ' active' : ''}`}
              onClick={() => setActiveTool(tool as Tool3D)}>
              <Icon size={14}/> <span>{label}</span>
            </button>
          ))}
          <button className="sidebar-btn" onClick={zoomToFit}><Maximize size={14}/> <span>Zoom Fit</span></button>
          <button className={`sidebar-btn${walkthroughMode ? ' active' : ''}`}
            onClick={() => {
              setWalkthroughMode(!walkthroughMode);
              if (!walkthroughMode) { setActiveTool('walkthrough'); onStatusChange('Walkthrough: WASD to move, Q/E up/down, drag to look'); }
              else { setActiveTool('orbit'); }
            }}>
            <Navigation size={14}/> <span>Walkthrough</span>
          </button>
        </div>

        <div className="sidebar-divider"/>

        <div className="tool-group">
          <div className="tool-group-label" style={{textAlign:'left',paddingLeft:12}}>Quick Asset Library</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, padding: '2px 10px' }}>
            <button className="btn ghost" style={{ fontSize: 10 }} onClick={() => insertQuickAsset('chair')}>Chair</button>
            <button className="btn ghost" style={{ fontSize: 10 }} onClick={() => insertQuickAsset('desk')}>Desk</button>
            <button className="btn ghost" style={{ fontSize: 10 }} onClick={() => insertQuickAsset('sofa')}>Sofa</button>
            <button className="btn ghost" style={{ fontSize: 10 }} onClick={() => insertQuickAsset('bed')}>Bed</button>
            <button className="btn ghost" style={{ fontSize: 10 }} onClick={() => insertQuickAsset('fridge')}>Fridge</button>
            <button className="btn ghost" style={{ fontSize: 10 }} onClick={() => insertQuickAsset('washer')}>Washer</button>
            <button className="btn ghost" style={{ fontSize: 10 }} onClick={() => insertQuickAsset('sink')}>Sink</button>
            <button className="btn ghost" style={{ fontSize: 10 }} onClick={() => insertQuickAsset('toilet')}>Toilet</button>
          </div>
        </div>

        <div className="sidebar-divider"/>

        <div className="tool-group">
          <div className="tool-group-label" style={{textAlign:'left',paddingLeft:12}}>BIM Create</div>
          {([['wall','Wall'],['slab','Slab'],['column','Column'],['beam','Beam'],
             ['roof','Roof'],['stair','Stair'],['ramp','Ramp'],
             ['door','Door'],['window','Window'],['curtainwall','Curtain Wall'],
             ['railing','Railing'],['ceiling','Ceiling'],
             ['furniture','Furniture'],['fixture','Fixture']] as const).map(([tool,label]) => (
            <button key={tool} className={`sidebar-btn${activeTool === tool ? ' active' : ''}`}
              onClick={() => { setActiveTool(tool as Tool3D); onStatusChange(`3D tool: ${label} — click in viewport to place`); }}>
              <Box size={14}/> <span>{label}</span>
            </button>
          ))}
        </div>

        <div className="sidebar-divider"/>

        <div className="tool-group">
          <div className="tool-group-label" style={{textAlign:'left',paddingLeft:12}}>MEP</div>
          {([['pipe','Pipe'],['duct','Duct']] as const).map(([tool,label]) => (
            <button key={tool} className={`sidebar-btn${activeTool === tool ? ' active' : ''}`}
              onClick={() => setActiveTool(tool as Tool3D)}>
              <Minus size={14}/> <span>{label}</span>
            </button>
          ))}
        </div>

        <div className="sidebar-divider"/>

        <div className="tool-group">
          <div className="tool-group-label" style={{textAlign:'left',paddingLeft:12}}>Modify</div>
          {([['move','Move',Move],['rotate','Rotate',RotateCw],['copy','Copy',Copy],['delete','Delete',Trash2]] as const).map(([tool,label,Icon]) => (
            <button key={tool} className={`sidebar-btn${activeTool === tool ? ' active' : ''}`}
              onClick={() => setActiveTool(tool as Tool3D)}>
              <Icon size={14}/> <span>{label}</span>
            </button>
          ))}
          <button className={`sidebar-btn${activeTool === 'measure' ? ' active' : ''}`}
            onClick={() => { setActiveTool('measure'); setMeasurePoints([]); setMeasureDistance(null); onStatusChange('Measure: click two points'); }}>
            <Ruler size={14}/> <span>Measure</span>
          </button>
          <div className="sidebar-divider" style={{margin:'4px 0'}}/>
          <button className="sidebar-btn" onClick={undo3D} disabled={undoCount === 0} title="Undo (Ctrl+Z)">
            <RotateCcw size={14}/> <span>Undo ({undoCount})</span>
          </button>
          <button className="sidebar-btn" onClick={redo3D} disabled={redoCount === 0} title="Redo (Ctrl+Y)">
            <RotateCw size={14}/> <span>Redo ({redoCount})</span>
          </button>
        </div>

        <div className="sidebar-divider"/>

        <div className="tool-group">
          <div className="tool-group-label" style={{textAlign:'left',paddingLeft:12}}>Analysis</div>
          <button className="sidebar-btn" onClick={runClashDetection}>
            <AlertTriangle size={14}/> <span>Clash Detect</span>
          </button>
          {clashResults.length > 0 && (
            <div style={{ padding: '2px 12px', fontSize: 10, color: clashResults.length > 0 ? '#ff6b6b' : 'var(--text-muted)' }}>
              {clashResults.length} clashes
            </div>
          )}
          <button className={`sidebar-btn${explodedView ? ' active' : ''}`}
            onClick={() => setExplodedView(!explodedView)}>
            <Split size={14}/> <span>Explode</span>
          </button>
          {explodedView && (
            <div style={{ padding: '4px 12px' }}>
              <input type="range" min={1} max={5} step={0.1} value={explodeFactor}
                     onChange={e => setExplodeFactor(parseFloat(e.target.value))}
                     style={{ width: '100%' }} />
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center' }}>{explodeFactor.toFixed(1)}x</div>
            </div>
          )}
          <button className={`sidebar-btn${showMultiStory ? ' active' : ''}`}
            onClick={() => setShowMultiStory(!showMultiStory)}>
            <Layers size={14}/> <span>Multi-Story</span>
          </button>
        </div>

        <div className="sidebar-divider"/>

        <div className="tool-group">
          <div className="tool-group-label" style={{textAlign:'left',paddingLeft:12}}>Views & Sections</div>
          <button className="sidebar-btn" onClick={generateSection}>
            <Scissors size={14}/> <span>Gen. Section</span>
          </button>
          <button className="sidebar-btn" onClick={() => generateElevation('front')}>
            <ArrowUp size={14}/> <span>Front Elev.</span>
          </button>
          <button className="sidebar-btn" onClick={() => generateElevation('back')}>
            <ArrowDown size={14}/> <span>Back Elev.</span>
          </button>
          <button className="sidebar-btn" onClick={() => generateElevation('left')}>
            <FileText size={14}/> <span>Left Elev.</span>
          </button>
          <button className="sidebar-btn" onClick={() => generateElevation('right')}>
            <FileText size={14}/> <span>Right Elev.</span>
          </button>
          <button className="sidebar-btn" onClick={() => {
            setShowSectionPlane(!showSectionPlane);
            onStatusChange(showSectionPlane ? 'Section plane hidden' : `Section plane at ${sectionHeight.toFixed(1)}m`);
          }}>
            <Layers size={14}/> <span>{showSectionPlane ? 'Hide Section' : 'Section Plane'}</span>
          </button>
          {showSectionPlane && (
            <div style={{ padding: '4px 12px' }}>
              <input type="range" min={0} max={6} step={0.1} value={sectionHeight}
                     onChange={e => setSectionHeight(parseFloat(e.target.value))}
                     style={{ width: '100%' }} />
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center' }}>{sectionHeight.toFixed(1)}m</div>
              {activeSectionHeights.length > 0 && (
                <div style={{ fontSize: 10, color: 'var(--accent)', textAlign: 'center', marginTop: 2 }}>
                  Stacked cuts: {activeSectionHeights.map(h => `${h.toFixed(1)}m`).join(', ')}
                </div>
              )}
              <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                <input
                  value={newSectionPresetName}
                  onChange={e => setNewSectionPresetName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveSectionPreset(); }}
                  placeholder="Save section preset"
                  style={{ flex: 1, minWidth: 0, fontSize: 10, padding: '2px 6px' }}
                />
                <button className="btn" style={{ fontSize: 10, padding: '2px 6px' }} onClick={saveSectionPreset}>
                  <Plus size={10}/> Save
                </button>
              </div>
              {sectionPresets.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4 }}>
                  {sectionPresets.map(preset => (
                    <div key={preset.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <button className="btn ghost" style={{ flex: 1, fontSize: 10, padding: '2px 6px', justifyContent: 'space-between' }} onClick={() => applySectionPreset(preset)}>
                        <span>{preset.name}</span>
                        <span>{preset.height.toFixed(1)}m</span>
                      </button>
                      <button className="btn ghost icon-only" style={{ padding: 2 }} onClick={() => removeSectionPreset(preset.id)}>
                        <Trash2 size={10}/>
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginTop: 6 }}>
                <input
                  type="number"
                  value={sectionSetCount}
                  min={2}
                  max={10}
                  onChange={e => setSectionSetCount(parseInt(e.target.value || '2', 10))}
                  title="Planes"
                  style={{ fontSize: 10, padding: '2px 6px' }}
                />
                <input
                  type="number"
                  value={sectionSetSpacing}
                  min={0.2}
                  max={3}
                  step={0.1}
                  onChange={e => setSectionSetSpacing(parseFloat(e.target.value || '0.6'))}
                  title="Spacing (m)"
                  style={{ fontSize: 10, padding: '2px 6px' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                <input
                  value={newSectionSetName}
                  onChange={e => setNewSectionSetName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveSectionSetPreset(); }}
                  placeholder="Save section set"
                  style={{ flex: 1, minWidth: 0, fontSize: 10, padding: '2px 6px' }}
                />
                <button className="btn" style={{ fontSize: 10, padding: '2px 6px' }} onClick={saveSectionSetPreset}>
                  <Plus size={10}/> Stack
                </button>
              </div>
              {sectionSetPresets.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4 }}>
                  {sectionSetPresets.map(preset => (
                    <div key={preset.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <button className="btn ghost" style={{ flex: 1, fontSize: 10, padding: '2px 6px', justifyContent: 'space-between' }} onClick={() => applySectionSetPreset(preset)}>
                        <span>{preset.name}</span>
                        <span>{preset.heights.length} cuts</span>
                      </button>
                      <button className="btn ghost icon-only" style={{ padding: 2 }} onClick={() => removeSectionSetPreset(preset.id)}>
                        <Trash2 size={10}/>
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {activeSectionHeights.length > 0 && (
                <button className="btn ghost" style={{ width: '100%', fontSize: 10, marginTop: 4 }} onClick={clearSectionSetPreset}>
                  Back to Single Plane
                </button>
              )}
            </div>
          )}
        </div>

        <div className="sidebar-divider"/>

        <div className="tool-group">
          <div className="tool-group-label" style={{textAlign:'left',paddingLeft:12}}>Export / QTO</div>
          <button className="sidebar-btn" onClick={calculateQTO}>
            <Settings2 size={14}/> <span>Quantities</span>
          </button>
          <button className="sidebar-btn" onClick={handleExportIFC}>
            <Download size={14}/> <span>Export IFC4</span>
          </button>
        </div>

        <div className="sidebar-divider"/>

        <div className="tool-group">
          <div className="tool-group-label" style={{textAlign:'left',paddingLeft:12}}>Sun Study</div>
          <div style={{ padding: '2px 12px' }}>
             <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, cursor: 'pointer' }}>
          <input type="checkbox" checked={useGeoSun} onChange={e => setUseGeoSun(e.target.checked)} /> Geolocated Sun
             </label>
             {useGeoSun && (
          <>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Latitude: {geoSunParams.latitude.toFixed(2)}°</div>
            <input type="range" min={-60} max={60} step={0.5} value={geoSunParams.latitude}
              onChange={e => setGeoSunParams(p => ({ ...p, latitude: parseFloat(e.target.value) }))}
              style={{ width: '100%' }} />
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2, marginTop: 4 }}>Day: {geoSunParams.dayOfYear}</div>
            <input type="range" min={1} max={365} step={1} value={geoSunParams.dayOfYear}
              onChange={e => setGeoSunParams(p => ({ ...p, dayOfYear: parseInt(e.target.value) }))}
              style={{ width: '100%' }} />
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2, marginTop: 4 }}>Hour: {geoSunParams.hour.toFixed(1)}</div>
            <input type="range" min={5} max={19} step={0.5} value={geoSunParams.hour}
              onChange={e => setGeoSunParams(p => ({ ...p, hour: parseFloat(e.target.value) }))}
              style={{ width: '100%' }} />
          </>
             )}
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Azimuth: {sunPosition.azimuth}°</div>
            <input type="range" min={0} max={360} step={5} value={sunPosition.azimuth}
                   onChange={e => setSunPosition(p => ({ ...p, azimuth: parseInt(e.target.value) }))}
               disabled={useGeoSun}
                   style={{ width: '100%' }} />
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2, marginTop: 4 }}>Altitude: {sunPosition.altitude}°</div>
            <input type="range" min={5} max={90} step={5} value={sunPosition.altitude}
                   onChange={e => setSunPosition(p => ({ ...p, altitude: parseInt(e.target.value) }))}
               disabled={useGeoSun}
                   style={{ width: '100%' }} />
          </div>
        </div>

        <div className="sidebar-divider"/>

        <div className="tool-group">
          <div className="tool-group-label" style={{textAlign:'left',paddingLeft:12}}>Settings</div>
          <label className="sidebar-btn" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={snapToGrid} onChange={e => setSnapToGrid(e.target.checked)} style={{ marginRight: 4 }} />
            <span>Snap to Grid ({gridSnapSize}mm)</span>
          </label>
          <label className="sidebar-btn" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={useNativeMesher} onChange={e => setUseNativeMesher(e.target.checked)} style={{ marginRight: 4 }} />
            <span>Use Native Rust Mesher</span>
          </label>
          <div style={{ padding: '4px 12px' }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Camera Angle Presets</div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
              <input
                value={newPresetName}
                onChange={e => setNewPresetName(e.target.value)}
                placeholder="Preset name"
                style={{ flex: 1, fontSize: 10 }}
              />
              <button className="btn ghost" style={{ fontSize: 10, padding: '4px 6px' }} onClick={saveCurrentViewPreset}>Save</button>
            </div>
            {viewPresets.slice(-4).map(p => (
              <div key={p.id} style={{ display: 'flex', gap: 4, marginBottom: 3 }}>
                <button className="btn ghost" style={{ fontSize: 10, flex: 1, textAlign: 'left' }} onClick={() => applyViewPreset(p)}>{p.name}</button>
                <button className="btn ghost" style={{ fontSize: 10, color: '#ff6b6b', padding: '4px 6px' }} onClick={() => deleteViewPreset(p.id)}>x</button>
              </div>
            ))}

            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8, marginBottom: 4 }}>Elevation Presets</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 4 }}>
              <input
                value={newElevationPresetName}
                onChange={e => setNewElevationPresetName(e.target.value)}
                placeholder="Name"
                style={{ fontSize: 10 }}
              />
              <select
                value={newElevationDirection}
                onChange={e => setNewElevationDirection(e.target.value as 'front' | 'back' | 'left' | 'right')}
                style={{ fontSize: 10 }}
              >
                <option value="front">Front</option>
                <option value="back">Back</option>
                <option value="left">Left</option>
                <option value="right">Right</option>
              </select>
            </div>
            <button className="btn ghost" style={{ width: '100%', fontSize: 10, marginBottom: 4 }} onClick={saveElevationPreset}>Save Elevation Preset</button>
            {elevationPresets.slice(-4).map(p => (
              <div key={p.id} style={{ display: 'flex', gap: 4, marginBottom: 3 }}>
                <button className="btn ghost" style={{ fontSize: 10, flex: 1, textAlign: 'left' }} onClick={() => applyElevationPreset(p)}>{p.name} ({p.direction})</button>
                <button className="btn ghost" style={{ fontSize: 10, color: '#ff6b6b', padding: '4px 6px' }} onClick={() => removeElevationPreset(p.id)}>x</button>
              </div>
            ))}

            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8, marginBottom: 4 }}>3D World Presets</div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
              <input
                value={newWorldPresetName}
                onChange={e => setNewWorldPresetName(e.target.value)}
                placeholder="World preset"
                style={{ flex: 1, fontSize: 10 }}
              />
              <button className="btn ghost" style={{ fontSize: 10, padding: '4px 6px' }} onClick={saveWorldPreset}>Save</button>
            </div>
            {worldPresets.slice(-4).map(p => (
              <div key={p.id} style={{ display: 'flex', gap: 4, marginBottom: 3 }}>
                <button className="btn ghost" style={{ fontSize: 10, flex: 1, textAlign: 'left' }} onClick={() => applyWorldPreset(p)}>{p.name}</button>
                <button className="btn ghost" style={{ fontSize: 10, color: '#ff6b6b', padding: '4px 6px' }} onClick={() => removeWorldPreset(p.id)}>x</button>
              </div>
            ))}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginTop: 6 }}>
              <button className="btn ghost" style={{ fontSize: 10 }} onClick={sharePresetBundle}>Share Presets</button>
              <button className="btn ghost" style={{ fontSize: 10 }} onClick={importPresetBundle}>Import Presets</button>
            </div>
          </div>
        </div>
      </div>

      {/* ─── 3D Viewport ─── */}
      <div className="viewport-container"
        ref={mountRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleClick}
        onWheel={handleWheel}
        style={{ cursor: activeTool === 'pan' ? 'grab' : activeTool === 'orbit' ? 'grab' : 'crosshair' }}
      >
        {!hasModel && !isGenerating && (
          <div className="viewport-empty">
            <div className="viewport-empty-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="var(--accent)" strokeWidth="1.5" strokeLinejoin="round"/>
                <path d="M2 17L12 22L22 17" stroke="var(--accent)" strokeWidth="1.5" strokeLinejoin="round" opacity="0.5"/>
                <path d="M2 12L12 17L22 12" stroke="var(--accent)" strokeWidth="1.5" strokeLinejoin="round" opacity="0.7"/>
              </svg>
            </div>
            <h3>No 2D Geometry Yet</h3>
            <p>Draw walls, slabs, roofs, doors, windows, and furniture in the Plans tab.<br/>The 3D base model will appear here automatically.</p>
            <button className="btn primary" onClick={handleGenerate3D}>
              <RefreshCw size={13}/> Rebuild Base Model
            </button>
          </div>
        )}
        {isGenerating && (
          <div className="viewport-loading">
            <div className="spinner" style={{ width: 32, height: 32 }} />
            <span>Generating 3D model…</span>
          </div>
        )}

        {/* ─── View cube ─── */}
        <div className="view-cube">
          {(['top','front','back','left','right','perspective'] as ViewMode[]).map(v => (
            <button key={v} className={`view-cube-btn${viewMode === v ? ' active' : ''}`}
              onClick={() => setView(v)}>
              {v.charAt(0).toUpperCase()}
            </button>
          ))}
        </div>

        {/* ─── Render controls overlay ─── */}
        <div className="viewport-controls">
          <div className="panel" style={{ padding: 8 }}>
            <div className="label" style={{ marginBottom: 6 }}>Render</div>
            {(['solid','wireframe','clay','realistic','xray'] as const).map(m => (
              <button key={m} className={`btn ghost${renderMode === m ? ' active' : ''}`}
                style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 2, fontSize: 11 }}
                onClick={() => setRenderMode(m)}>
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
            <div style={{ marginTop: 4, marginBottom: 4 }}>
              <div className="label" style={{ marginBottom: 4 }}>Quality</div>
              <select
                value={renderQuality}
                onChange={e => setRenderQuality(e.target.value as RenderQuality)}
                style={{ width: '100%', fontSize: 11 }}
              >
                <option value="auto">Auto</option>
                <option value="ultra">Ultra</option>
                <option value="balanced">Balanced</option>
                <option value="performance">Performance</option>
              </select>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
                Effective: {effectiveQuality}
              </div>
            </div>
            <div className="divider" />
            <div className="label" style={{ marginBottom: 4 }}>Display</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: 2 }}>
              <input type="checkbox" checked={showGrid} onChange={e => setShowGrid(e.target.checked)} /> Grid
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: 2 }}>
              <input type="checkbox" checked={showAxes} onChange={e => setShowAxes(e.target.checked)} /> Axes
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: 2 }}>
              <input type="checkbox" checked={showShadows} onChange={e => setShowShadows(e.target.checked)} /> Shadows
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: 2 }}>
              <input type="checkbox" checked={enableSSAO} onChange={e => setEnableSSAO(e.target.checked)} /> Ambient Occlusion
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: 2 }}>
              <input type="checkbox" checked={enableTAA} onChange={e => setEnableTAA(e.target.checked)} /> Temporal AA
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: 2 }}>
              <input type="checkbox" checked={enableSSR} onChange={e => setEnableSSR(e.target.checked)} /> Screen-Space Reflections
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: 2 }}>
              <input type="checkbox" checked={enableCSM} onChange={e => setEnableCSM(e.target.checked)} /> Cascaded Shadows
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: 2 }}>
              <input type="checkbox" checked={enableSky} onChange={e => setEnableSky(e.target.checked)} /> Physical Sky
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: 2 }}>
              <input type="checkbox" checked={enableGovernor} onChange={e => setEnableGovernor(e.target.checked)} /> Adaptive Governor
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: 2 }}>
              <input type="checkbox" checked={enableOcclusionThrottle} onChange={e => setEnableOcclusionThrottle(e.target.checked)} /> Occlusion Throttle
            </label>
            {!qualityProfile.allowSSAO && (
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>
                SSAO disabled for performance profile
              </div>
            )}
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>
              Frame: {frameTimeMs.toFixed(1)}ms {governorScaleRef.current < 0.99 ? `(scale ${governorScaleRef.current.toFixed(2)})` : ''}
            </div>
            <div className="divider" />
            <button className="btn primary" style={{ width: '100%', fontSize: 11 }}
              onClick={handleGenerate3D} disabled={isGenerating}>
              <RefreshCw size={11}/>
              {isGenerating ? 'Syncing…' : 'Resync from 2D'}
            </button>
            <button className="btn outline" style={{ width: '100%', fontSize: 11, marginTop: 4 }}
              onClick={zoomToFit}>
              <Maximize size={11}/> Zoom Fit
            </button>
            <button className="btn outline" style={{ width: '100%', fontSize: 11, marginTop: 4 }}
              onClick={focusSelectedObject} disabled={!selectedObjectId}>
              <Crosshair size={11}/> Focus Selected
            </button>
            {!isIsolationActive ? (
              <button className="btn outline" style={{ width: '100%', fontSize: 11, marginTop: 4 }}
                onClick={isolateSelectedObject} disabled={!selectedObjectId}>
                <EyeOff size={11}/> Isolate Selected
              </button>
            ) : (
              <button className="btn outline" style={{ width: '100%', fontSize: 11, marginTop: 4 }}
                onClick={clearIsolation}>
                <Eye size={11}/> Show All
              </button>
            )}
            <div className="divider" style={{ margin: '6px 0' }}/>
            <button className="btn outline" style={{ width: '100%', fontSize: 11 }} onClick={handleImportGLTF}>
              <Download size={11}/> Import glTF
            </button>
            <button className="btn outline" style={{ width: '100%', fontSize: 11, marginTop: 4 }} onClick={handleImportIFC}>
              <Download size={11}/> Import IFC
            </button>
          </div>
        </div>

        {/* ─── Category visibility ─── */}
        <div className="category-toggle">
          {Object.entries(visibleCategories).map(([cat, vis]) => (
            <button key={cat}
              className={`cat-btn${vis ? '' : ' hidden-cat'}`}
              onClick={() => setVisibleCategories(prev => ({ ...prev, [cat]: !prev[cat as keyof typeof prev] }))}
              title={vis ? `Hide ${cat}` : `Show ${cat}`}>
              {vis ? <Eye size={10}/> : <EyeOff size={10}/>}
              <span>{cat}</span>
            </button>
          ))}
        </div>

        {/* Navigation hint */}
        {hasModel && (
          <div className="viewport-hint">
            {walkthroughMode ? 'WASD: move | Q/E: up/down | Drag: look around' : (
              <>
                {creationStep === 1 ? `Click second point to create ${activeTool}` : (
                  <>Orbit: drag | Pan: middle-click | Zoom: scroll | {floor.entities.length} entities</>
                )}
                {measureDistance !== null && <> | Distance: {(measureDistance * 1000).toFixed(0)}mm</>}
              </>
            )}
          </div>
        )}
      </div>

      {/* ─── Right Properties Panel ─── */}
      <div className="threed-properties">
        {/* Selected object properties */}
        {selectedEntity ? (
          <div className="panel" style={{ margin: 8 }}>
            <div className="panel-header"><span>BIM Properties</span></div>
            <div style={{ padding: 8 }}>
              <div className="label">Type</div>
              <div style={{ fontSize: 12, color: 'var(--accent)', marginBottom: 6, textTransform: 'capitalize' }}>
                {selectedEntity.type.replace(/_/g, ' ')}
              </div>
              
              <div className="label">ID</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                {selectedEntity.id}
              </div>

              <div className="label">Layer</div>
              <div style={{ fontSize: 12, color: 'var(--text-primary)', marginBottom: 6 }}>{selectedEntity.layer}</div>

              {/* Type-specific properties with editing */}
              {selectedEntity.type === 'wall' && (() => {
                const w = selectedEntity as WallEntity;
                const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) / 1000;
                const PropertyRow = ({ label, field, value, unit, editable }: { label: string; field: string; value: string; unit?: string; editable?: boolean }) => (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <div className="label" style={{ marginBottom: 0 }}>{label}</div>
                    {editable && editingProperty?.field === field ? (
                      <input type="text" autoFocus defaultValue={editingProperty.value}
                        style={{ width: 60, fontSize: 11, padding: '1px 4px', background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--accent)', borderRadius: 3 }}
                        onBlur={e => applyPropertyEdit(selectedEntity.id, field, e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') applyPropertyEdit(selectedEntity.id, field, (e.target as HTMLInputElement).value); if (e.key === 'Escape') setEditingProperty(null); }}
                      />
                    ) : (
                      <div style={{ fontSize: 12, color: 'var(--text-primary)', cursor: editable ? 'pointer' : 'default' }}
                        onClick={() => editable && setEditingProperty({ field, value })}>
                        {value}{unit && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}> {unit}</span>}
                        {editable && <Edit3 size={9} style={{ marginLeft: 4, opacity: 0.5 }} />}
                      </div>
                    )}
                  </div>
                );
                return (<>
                  <PropertyRow label="Length" field="length" value={len.toFixed(2)} unit="m" />
                  <PropertyRow label="Height" field="height" value={String(w.height)} unit="mm" editable />
                  <PropertyRow label="Thickness" field="thickness" value={String(w.thickness)} unit="mm" editable />
                  <PropertyRow label="Material" field="material" value={w.material || 'concrete'} editable />
                  <PropertyRow label="Area" field="area" value={(len * w.height / 1000).toFixed(2)} unit="m²" />
                  <PropertyRow label="Volume" field="volume" value={(len * w.height / 1000 * w.thickness / 1000).toFixed(3)} unit="m³" />
                  <PropertyRow label="Structural" field="structuralUsage" value={w.structuralUsage || 'bearing'} editable />
                  <div style={{ marginTop: 6, display: 'flex', gap: 4 }}>
                    <button className="btn ghost" style={{ fontSize: 10, flex: 1 }} onClick={copySelectedEntity}><Copy size={10}/> Copy</button>
                    <button className="btn ghost" style={{ fontSize: 10, flex: 1, color: '#ff6b6b' }} onClick={deleteSelectedEntity}><Trash2 size={10}/> Delete</button>
                  </div>
                </>);
              })()}

              {selectedEntity.type === 'column' && (() => {
                const c = selectedEntity as ColumnEntity;
                return (<>
                  <div className="prop-row"><span className="label">Size</span><span style={{ fontSize: 12 }}>{c.width}×{c.depth} mm</span></div>
                  <div className="prop-row"><span className="label">Height</span>
                    {editingProperty?.field === 'height' ? (
                      <input type="text" autoFocus defaultValue={String(c.height)} style={{ width: 60, fontSize: 11, padding: '1px 4px', background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--accent)', borderRadius: 3 }}
                        onBlur={e => applyPropertyEdit(selectedEntity.id, 'height', e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') applyPropertyEdit(selectedEntity.id, 'height', (e.target as HTMLInputElement).value); if (e.key === 'Escape') setEditingProperty(null); }} />
                    ) : (
                      <span style={{ fontSize: 12, cursor: 'pointer' }} onClick={() => setEditingProperty({ field: 'height', value: String(c.height) })}>{(c.height / 1000).toFixed(2)} m <Edit3 size={9} style={{ opacity: 0.5 }}/></span>
                    )}
                  </div>
                  <div className="prop-row"><span className="label">Shape</span>
                    <span style={{ fontSize: 12, cursor: 'pointer' }} onClick={() => setEditingProperty({ field: 'shape', value: c.shape || 'rectangular' })}>{c.shape || 'rectangular'} <Edit3 size={9} style={{ opacity: 0.5 }}/></span>
                  </div>
                  <div className="prop-row"><span className="label">Material</span>
                    <span style={{ fontSize: 12, cursor: 'pointer' }} onClick={() => setEditingProperty({ field: 'material', value: c.material || 'concrete' })}>{c.material || 'concrete'} <Edit3 size={9} style={{ opacity: 0.5 }}/></span>
                  </div>
                  <div style={{ marginTop: 6, display: 'flex', gap: 4 }}>
                    <button className="btn ghost" style={{ fontSize: 10, flex: 1 }} onClick={copySelectedEntity}><Copy size={10}/> Copy</button>
                    <button className="btn ghost" style={{ fontSize: 10, flex: 1, color: '#ff6b6b' }} onClick={deleteSelectedEntity}><Trash2 size={10}/> Delete</button>
                  </div>
                </>);
              })()}

              {selectedEntity.type === 'slab' && (() => {
                const s = selectedEntity as SlabEntity;
                let area = 0;
                for (let i = 0; i < s.points.length; i++) {
                  const j = (i + 1) % s.points.length;
                  area += s.points[i].x * s.points[j].y - s.points[j].x * s.points[i].y;
                }
                area = Math.abs(area / 2) / 1e6;
                return (<>
                  <div className="label">Area</div>
                  <div style={{ fontSize: 12, color: 'var(--text-primary)', marginBottom: 4 }}>{area.toFixed(2)} m²</div>
                  <div className="label">Thickness</div>
                  <div style={{ fontSize: 12, color: 'var(--text-primary)', marginBottom: 4 }}>{s.thickness} mm</div>
                  <div className="label">Volume</div>
                  <div style={{ fontSize: 12, color: 'var(--text-primary)', marginBottom: 4 }}>{(area * s.thickness / 1000).toFixed(3)} m³</div>
                  <div className="label">Elevation</div>
                  <div style={{ fontSize: 12, color: 'var(--text-primary)', marginBottom: 4 }}>{s.elevation} mm</div>
                  <div className="label">Type</div>
                  <div style={{ fontSize: 12, color: 'var(--text-primary)', marginBottom: 4 }}>{s.slabType || 'floor'}</div>
                </>);
              })()}

              {selectedEntity.type === 'roof' && (() => {
                const r = selectedEntity as RoofEntity;
                return (<>
                  <div className="prop-row"><span className="label">Roof Type</span>
                    <span style={{ fontSize: 12, cursor: 'pointer' }} onClick={() => setEditingProperty({ field: 'roofType', value: r.roofType || 'flat' })}>{r.roofType || 'flat'} <Edit3 size={9} style={{ opacity: 0.5 }}/></span>
                  </div>
                  <div className="prop-row"><span className="label">Pitch</span>
                    {editingProperty?.field === 'pitch' ? (
                      <input type="text" autoFocus defaultValue={String(r.pitch)} style={{ width: 50, fontSize: 11, padding: '1px 4px', background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--accent)', borderRadius: 3 }}
                        onBlur={e => applyPropertyEdit(selectedEntity.id, 'pitch', e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') applyPropertyEdit(selectedEntity.id, 'pitch', (e.target as HTMLInputElement).value); if (e.key === 'Escape') setEditingProperty(null); }} />
                    ) : (
                      <span style={{ fontSize: 12, cursor: 'pointer' }} onClick={() => setEditingProperty({ field: 'pitch', value: String(r.pitch) })}>{r.pitch}° <Edit3 size={9} style={{ opacity: 0.5 }}/></span>
                    )}
                  </div>
                  <div className="prop-row"><span className="label">Elevation</span>
                    <span style={{ fontSize: 12, cursor: 'pointer' }} onClick={() => setEditingProperty({ field: 'elevation', value: String(r.elevation) })}>{r.elevation} mm <Edit3 size={9} style={{ opacity: 0.5 }}/></span>
                  </div>
                  <div style={{ marginTop: 6, display: 'flex', gap: 4 }}>
                    <button className="btn ghost" style={{ fontSize: 10, flex: 1 }} onClick={copySelectedEntity}><Copy size={10}/> Copy</button>
                    <button className="btn ghost" style={{ fontSize: 10, flex: 1, color: '#ff6b6b' }} onClick={deleteSelectedEntity}><Trash2 size={10}/> Delete</button>
                  </div>
                </>);
              })()}

              {selectedEntity.type === 'door' && (() => {
                const d = selectedEntity as DoorEntity;
                return (<>
                  <div className="prop-row"><span className="label">Size</span><span style={{ fontSize: 12 }}>{d.width}×{d.height} mm</span></div>
                  <div className="prop-row"><span className="label">Type</span>
                    <span style={{ fontSize: 12, cursor: 'pointer' }} onClick={() => setEditingProperty({ field: 'doorType', value: d.doorType || 'single' })}>{d.doorType || 'single'} <Edit3 size={9} style={{ opacity: 0.5 }}/></span>
                  </div>
                  <div style={{ marginTop: 6, display: 'flex', gap: 4 }}>
                    <button className="btn ghost" style={{ fontSize: 10, flex: 1 }} onClick={copySelectedEntity}><Copy size={10}/> Copy</button>
                    <button className="btn ghost" style={{ fontSize: 10, flex: 1, color: '#ff6b6b' }} onClick={deleteSelectedEntity}><Trash2 size={10}/> Delete</button>
                  </div>
                </>);
              })()}

              {selectedEntity.type === 'window' && (() => {
                const w = selectedEntity as WindowEntity;
                return (<>
                  <div className="prop-row"><span className="label">Size</span><span style={{ fontSize: 12 }}>{w.width}×{w.height} mm</span></div>
                  <div className="prop-row"><span className="label">Sill Height</span>
                    <span style={{ fontSize: 12, cursor: 'pointer' }} onClick={() => setEditingProperty({ field: 'sillHeight', value: String(w.sillHeight) })}>{w.sillHeight} mm <Edit3 size={9} style={{ opacity: 0.5 }}/></span>
                  </div>
                  <div className="prop-row"><span className="label">Type</span>
                    <span style={{ fontSize: 12, cursor: 'pointer' }} onClick={() => setEditingProperty({ field: 'windowType', value: w.windowType || 'fixed' })}>{w.windowType || 'fixed'} <Edit3 size={9} style={{ opacity: 0.5 }}/></span>
                  </div>
                  <div style={{ marginTop: 6, display: 'flex', gap: 4 }}>
                    <button className="btn ghost" style={{ fontSize: 10, flex: 1 }} onClick={copySelectedEntity}><Copy size={10}/> Copy</button>
                    <button className="btn ghost" style={{ fontSize: 10, flex: 1, color: '#ff6b6b' }} onClick={deleteSelectedEntity}><Trash2 size={10}/> Delete</button>
                  </div>
                </>);
              })()}

              {selectedEntity.type === 'stair' && (() => {
                const s = selectedEntity as StairEntity;
                return (<>
                  <div className="prop-row"><span className="label">Stair Type</span>
                    <span style={{ fontSize: 12, cursor: 'pointer' }} onClick={() => setEditingProperty({ field: 'stairType', value: s.stairType || 'straight' })}>{s.stairType || 'straight'} <Edit3 size={9} style={{ opacity: 0.5 }}/></span>
                  </div>
                  <div className="prop-row"><span className="label">Treads</span><span style={{ fontSize: 12 }}>{s.treadNumber}</span></div>
                  <div className="prop-row"><span className="label">Rise</span><span style={{ fontSize: 12 }}>{s.height} mm</span></div>
                  <div style={{ marginTop: 6, display: 'flex', gap: 4 }}>
                    <button className="btn ghost" style={{ fontSize: 10, flex: 1 }} onClick={copySelectedEntity}><Copy size={10}/> Copy</button>
                    <button className="btn ghost" style={{ fontSize: 10, flex: 1, color: '#ff6b6b' }} onClick={deleteSelectedEntity}><Trash2 size={10}/> Delete</button>
                  </div>
                </>);
              })()}

              {selectedEntity.type === 'beam' && (() => {
                const b = selectedEntity as BeamEntity;
                return (<>
                  <div className="prop-row"><span className="label">Profile</span><span style={{ fontSize: 12 }}>{b.profile || `${b.width}×${b.depth}`}</span></div>
                  <div className="prop-row"><span className="label">Length</span><span style={{ fontSize: 12 }}>{(Math.hypot(b.x2 - b.x1, b.y2 - b.y1) / 1000).toFixed(2)} m</span></div>
                  <div className="prop-row"><span className="label">Elevation</span>
                    <span style={{ fontSize: 12, cursor: 'pointer' }} onClick={() => setEditingProperty({ field: 'elevation', value: String(b.elevation) })}>{b.elevation} mm <Edit3 size={9} style={{ opacity: 0.5 }}/></span>
                  </div>
                  <div style={{ marginTop: 6, display: 'flex', gap: 4 }}>
                    <button className="btn ghost" style={{ fontSize: 10, flex: 1 }} onClick={copySelectedEntity}><Copy size={10}/> Copy</button>
                    <button className="btn ghost" style={{ fontSize: 10, flex: 1, color: '#ff6b6b' }} onClick={deleteSelectedEntity}><Trash2 size={10}/> Delete</button>
                  </div>
                </>);
              })()}

              {selectedEntity.type === 'room' && (() => {
                const rm = selectedEntity as RoomEntity;
                let area = 0;
                for (let i = 0; i < rm.points.length; i++) {
                  const j = (i + 1) % rm.points.length;
                  area += rm.points[i].x * rm.points[j].y - rm.points[j].x * rm.points[i].y;
                }
                area = Math.abs(area / 2) / 1e6;
                return (<>
                  <div className="prop-row"><span className="label">Room Name</span>
                    {editingProperty?.field === 'name' ? (
                      <input type="text" autoFocus defaultValue={rm.name} style={{ width: 80, fontSize: 11, padding: '1px 4px', background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--accent)', borderRadius: 3 }}
                        onBlur={e => applyPropertyEdit(selectedEntity.id, 'name', e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') applyPropertyEdit(selectedEntity.id, 'name', (e.target as HTMLInputElement).value); if (e.key === 'Escape') setEditingProperty(null); }} />
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--accent)', cursor: 'pointer' }} onClick={() => setEditingProperty({ field: 'name', value: rm.name })}>{rm.name} <Edit3 size={9} style={{ opacity: 0.5 }}/></span>
                    )}
                  </div>
                  <div className="prop-row"><span className="label">Area</span><span style={{ fontSize: 12 }}>{area.toFixed(2)} m²</span></div>
                </>);
              })()}

              {/* Generic action buttons for any selected entity */}
              {!['wall', 'column', 'roof', 'door', 'window', 'stair', 'beam', 'room'].includes(selectedEntity.type) && (
                <div style={{ marginTop: 6, display: 'flex', gap: 4 }}>
                  <button className="btn ghost" style={{ fontSize: 10, flex: 1 }} onClick={copySelectedEntity}><Copy size={10}/> Copy</button>
                  <button className="btn ghost" style={{ fontSize: 10, flex: 1, color: '#ff6b6b' }} onClick={deleteSelectedEntity}><Trash2 size={10}/> Delete</button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="panel" style={{ margin: 8 }}>
            <div className="panel-header"><span>Scene</span></div>
            <div style={{ padding: 8 }}>
              <div className="label">Building</div>
              <div style={{ fontSize: 12, color: 'var(--text-primary)', marginBottom: 8 }}>{project.projectName}</div>
              <div className="label">Floor</div>
              <div style={{ fontSize: 12, color: 'var(--text-primary)', marginBottom: 8 }}>{floor.name}</div>
              <div className="label">Floor Height</div>
              <div style={{ fontSize: 12, color: 'var(--text-primary)', marginBottom: 8 }}>{(floor.floorHeight / 1000).toFixed(2)} m</div>
              <div className="label">Entities</div>
              <div style={{ fontSize: 12, color: 'var(--text-primary)', marginBottom: 8 }}>{floor.entities.length}</div>
              <div className="label">3D Objects</div>
              <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>
                {hasModel ? entityMeshMap.current.size : 0}
              </div>
            </div>
          </div>
        )}

        {/* Entity breakdown */}
        <div className="panel" style={{ margin: 8, marginTop: 0 }}>
          <div className="panel-header"><span>Entity Summary</span></div>
          <div style={{ padding: 8 }}>
            {(() => {
              const counts: Record<string, number> = {};
              for (const e of floor.entities) counts[e.type] = (counts[e.type] || 0) + 1;
              return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t, n]) => (
                <div key={t} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2, color: 'var(--text-secondary)' }}>
                  <span style={{ textTransform: 'capitalize' }}>{t.replace(/_/g, ' ')}</span>
                  <span style={{ color: 'var(--text-primary)' }}>{n}</span>
                </div>
              ));
            })()}
          </div>
        </div>

        {/* Camera presets */}
        <div className="panel" style={{ margin: 8, marginTop: 0 }}>
          <div className="panel-header"><span>Camera</span><Camera size={12}/></div>
          <div style={{ padding: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            {[
              { label: 'Persp', view: 'perspective' as ViewMode },
              { label: 'Top',   view: 'top' as ViewMode },
              { label: 'Front', view: 'front' as ViewMode },
              { label: 'Back',  view: 'back' as ViewMode },
              { label: 'Left',  view: 'left' as ViewMode },
              { label: 'Right', view: 'right' as ViewMode },
              { label: 'ISO NW', view: 'iso_nw' as ViewMode },
              { label: 'ISO NE', view: 'iso_ne' as ViewMode },
            ].map(preset => (
              <button key={preset.label}
                className={`btn ghost${viewMode === preset.view ? ' active' : ''}`}
                style={{ fontSize: 10 }}
                onClick={() => setView(preset.view)}>
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Section results */}
        {sectionResults.length > 0 && (
          <div className="panel" style={{ margin: 8, marginTop: 0 }}>
            <div className="panel-header"><span>Generated Views</span></div>
            <div style={{ padding: 8 }}>
              {sectionResults.map((sr, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    {sr.label} ({sr.entities.length} ent.)
                  </span>
                  <button className="btn ghost" style={{ fontSize: 10, padding: '2px 6px' }}
                    onClick={() => {
                      if (onEntityUpdate) onEntityUpdate(sr.entities);
                      onStatusChange(`Applied ${sr.label} to 2D view`);
                    }}>
                    Apply
                  </button>
                </div>
              ))}
              <button className="btn outline" style={{ width: '100%', fontSize: 10, marginTop: 4 }}
                onClick={() => setSectionResults([])}>
                Clear All
              </button>
            </div>
          </div>
        )}

        {/* Clash detection results */}
        {showClashes && clashResults.length > 0 && (
          <div className="panel" style={{ margin: 8, marginTop: 0 }}>
            <div className="panel-header">
              <span style={{ color: '#ff6b6b' }}>Clashes ({clashResults.length})</span>
              <button className="btn ghost" style={{ fontSize: 10, padding: '1px 4px' }}
                onClick={() => { setShowClashes(false); clearClashMarkers(); setClashResults([]); }}>
                Clear
              </button>
            </div>
            <div style={{ padding: 8, maxHeight: 200, overflowY: 'auto' }}>
              {clashResults.slice(0, 20).map((clash, i) => {
                const eA = floor.entities.find(e => e.id === clash.a);
                const eB = floor.entities.find(e => e.id === clash.b);
                return (
                  <div key={i} style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 3, padding: '2px 4px',
                    background: 'rgba(255,100,100,0.05)', borderRadius: 3, cursor: 'pointer' }}
                    onClick={() => {
                      // Zoom to clash
                      orbitTarget.current.copy(clash.point);
                      orbitAngles.current.radius = 5;
                      updateCamera();
                    }}>
                    <span style={{ color: '#ff6b6b' }}>#{i + 1}</span>{' '}
                    {eA?.type || '?'} ↔ {eB?.type || '?'}
                  </div>
                );
              })}
              {clashResults.length > 20 && (
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center' }}>
                  ...and {clashResults.length - 20} more
                </div>
              )}
            </div>
          </div>
        )}

        {/* Measurement result */}
        {measureDistance !== null && (
          <div className="panel" style={{ margin: 8, marginTop: 0 }}>
            <div className="panel-header"><span>Measurement</span><Ruler size={12}/></div>
            <div style={{ padding: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--accent)' }}>
                {(measureDistance * 1000).toFixed(0)} mm
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                {measureDistance.toFixed(3)} m
              </div>
              <button className="btn ghost" style={{ fontSize: 10, marginTop: 4 }}
                onClick={() => {
                  setMeasurePoints([]);
                  setMeasureDistance(null);
                  if (measureLineRef.current && sceneRef.current) {
                    sceneRef.current.remove(measureLineRef.current);
                    measureLineRef.current = null;
                  }
                }}>
                Clear
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
