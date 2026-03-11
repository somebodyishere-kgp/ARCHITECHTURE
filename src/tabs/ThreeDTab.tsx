import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { invoke } from '@tauri-apps/api/core';
import { RefreshCw, Sun, Camera, Layers, Settings2, Play, Box, FileText, Download } from 'lucide-react';
import { FloorPlan, ADFProject } from '../lib/adf';
import './ThreeDTab.css';

interface Props {
  floor: FloorPlan;
  project: ADFProject;
  onStatusChange: (s: string) => void;
}

interface SceneObject {
  id: string; type: string;
  position: [number, number, number];
  size: [number, number, number];
  rotation_y?: number;
  material?: string;
  color: string;
}

export default function ThreeDTab({ floor, project, onStatusChange }: Props) {
  const mountRef   = useRef<HTMLDivElement>(null);
  const sceneRef   = useRef<THREE.Scene | null>(null);
  const cameraRef  = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const frameRef   = useRef<number>(0);
  const isDragging = useRef(false);
  const lastMouse  = useRef({ x: 0, y: 0 });
  const orbitAngles = useRef({ theta: Math.PI / 4, phi: Math.PI / 4, radius: 20 });

  const [isGenerating, setIsGenerating] = useState(false);
  const [hasModel, setHasModel]         = useState(false);
  const [renderMode, setRenderMode]     = useState<'solid' | 'wireframe' | 'clay'>('solid');
  const [sceneData, setSceneData]       = useState<Record<string, unknown> | null>(null);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);

  // Initialize Three.js scene
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const W = mount.clientWidth, H = mount.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0f15);
    scene.fog = new THREE.FogExp2(0x0a0f15, 0.015);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(55, W / H, 0.01, 500);
    camera.position.set(12, 8, 12);
    camera.lookAt(0, 1.5, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(W, H);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xfff5e6, 2.5);
    sun.position.set(15, 25, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 100;
    sun.shadow.camera.left = -30;
    sun.shadow.camera.right = 30;
    sun.shadow.camera.top = 30;
    sun.shadow.camera.bottom = -30;
    sun.shadow.bias = -0.001;
    scene.add(sun);

    const fill = new THREE.DirectionalLight(0x8bbfe8, 0.8);
    fill.position.set(-10, 5, -10);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffeedd, 0.4);
    rim.position.set(0, 3, -15);
    scene.add(rim);

    // Ground grid
    const grid = new THREE.GridHelper(40, 40, 0x1a2030, 0x1a2030);
    (grid.material as THREE.Material).opacity = 0.4;
    (grid.material as THREE.Material).transparent = true;
    scene.add(grid);

    // Ground plane (shadow receiver)
    const groundGeo = new THREE.PlaneGeometry(50, 50);
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x111820 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Animation loop
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    // Resize observer
    const obs = new ResizeObserver(() => {
      const nW = mount.clientWidth, nH = mount.clientHeight;
      renderer.setSize(nW, nH);
      camera.aspect = nW / nH;
      camera.updateProjectionMatrix();
    });
    obs.observe(mount);

    return () => {
      cancelAnimationFrame(frameRef.current);
      obs.disconnect();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  // Orbit controls via mouse
  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
  };
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current || !cameraRef.current) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    lastMouse.current = { x: e.clientX, y: e.clientY };

    const a = orbitAngles.current;
    a.theta -= dx * 0.008;
    a.phi = Math.max(0.05, Math.min(Math.PI / 2 - 0.01, a.phi - dy * 0.008));

    const r = a.radius;
    cameraRef.current.position.set(
      r * Math.sin(a.theta) * Math.cos(a.phi),
      r * Math.sin(a.phi),
      r * Math.cos(a.theta) * Math.cos(a.phi)
    );
    cameraRef.current.lookAt(0, 1.5, 0);
  }, []);
  const handleMouseUp = () => { isDragging.current = false; };
  const handleWheel = useCallback((e: React.WheelEvent) => {
    const a = orbitAngles.current;
    a.radius = Math.max(3, Math.min(80, a.radius + e.deltaY * 0.02));
    if (cameraRef.current) {
      cameraRef.current.position.set(
        a.radius * Math.sin(a.theta) * Math.cos(a.phi),
        a.radius * Math.sin(a.phi),
        a.radius * Math.cos(a.theta) * Math.cos(a.phi)
      );
      cameraRef.current.lookAt(0, 1.5, 0);
    }
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!sceneRef.current || !cameraRef.current || !mountRef.current) return;
    
    // Ignore clicks if we are dragging
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) return;

    const rect = mountRef.current.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, cameraRef.current);

    const intersects = raycaster.intersectObjects(sceneRef.current.children, true);
    const archObject = intersects.find(hit => hit.object.userData['archflow']);
    
    if (archObject) {
      setSelectedObjectId(archObject.object.userData['id']);
      
      // Reset highlights
      sceneRef.current.children.forEach(c => {
        if (c.userData['archflow'] && c instanceof THREE.Mesh) {
          (c.material as THREE.MeshPhongMaterial).emissive.setHex(0x000000);
        }
      });
      // Highlight selected
      if (archObject.object instanceof THREE.Mesh) {
        (archObject.object.material as THREE.MeshPhongMaterial).emissive.setHex(0x223344);
      }
    } else {
      setSelectedObjectId(null);
      sceneRef.current.children.forEach(c => {
        if (c.userData['archflow'] && c instanceof THREE.Mesh) {
          (c.material as THREE.MeshPhongMaterial).emissive.setHex(0x000000);
        }
      });
    }
  }, []);

  // Generate / update the 3D model from floor plan
  const handleGenerate3D = async () => {
    setIsGenerating(true);
    onStatusChange('Generating 3D model from floor plan…');
    try {
      const result = await invoke<Record<string, unknown>>('convert_to_3d', {
        floorData: {
          entities: floor.entities,
          floor_height: floor.floorHeight,
        }
      });
      setSceneData(result);
      buildThreeScene(result);
      setHasModel(true);
      onStatusChange('3D model generated successfully');
    } catch (err) {
      onStatusChange(`3D generation error: ${err}`);
    }
    setIsGenerating(false);
  };

  const buildThreeScene = (data: Record<string, unknown>) => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Clear old geometry (keep lights and grid)
    const toRemove = scene.children.filter(c => c.userData['archflow'] === true);
    toRemove.forEach(c => { scene.remove(c); (c as THREE.Mesh).geometry?.dispose(); });

    const objects = data.scene_objects as SceneObject[] || [];
    objects.forEach(obj => {
      let geo: THREE.BufferGeometry;
      if (obj.type === 'box') {
        const [w, h, d] = obj.size;
        geo = new THREE.BoxGeometry(w, h, d);
      } else return;

      const mat = new THREE.MeshPhongMaterial({
        color: new THREE.Color(obj.color),
        wireframe: renderMode === 'wireframe',
        specular: new THREE.Color(0x223344),
        shininess: renderMode === 'clay' ? 0 : 15,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(...obj.position);
      if (obj.rotation_y) mesh.rotation.y = obj.rotation_y;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData['archflow'] = true;
      mesh.userData['id'] = obj.id;
      scene.add(mesh);
    });
  };

  // Reapply render mode
  useEffect(() => {
    if (!sceneRef.current || !hasModel) return;
    sceneRef.current.children.forEach(c => {
      if (c.userData['archflow'] && c instanceof THREE.Mesh) {
        const mat = c.material as THREE.MeshPhongMaterial;
        mat.wireframe = renderMode === 'wireframe';
        mat.shininess = renderMode === 'clay' ? 0 : 15;
        mat.needsUpdate = true;
      }
    });
  }, [renderMode, hasModel]);

  return (
    <div className="threed-tab">
      {/* Left Toolbar (FreeCAD Features) */}
      <div className="threed-sidebar">
        <div className="tool-group">
          <div className="tool-group-label" style={{textAlign: 'left', paddingLeft: 12}}>BIM Elements</div>
          <button className="sidebar-btn"><Box size={14}/> <span>Wall</span></button>
          <button className="sidebar-btn"><Layers size={14}/> <span>Slab</span></button>
          <button className="sidebar-btn"><Box size={14}/> <span>Column</span></button>
        </div>
        <div className="divider" style={{width:'80%', margin:'8px auto', background:'var(--border)', height:1}} />
        <div className="tool-group">
          <div className="tool-group-label" style={{textAlign: 'left', paddingLeft: 12}}>TechDraw</div>
          <button className="sidebar-btn" onClick={() => onStatusChange('Generating TechDraw Sections via FreeCAD...')}>
            <FileText size={14}/> <span>Gen. Section</span>
          </button>
          <button className="sidebar-btn" onClick={() => onStatusChange('Generating TechDraw Elevations via FreeCAD...')}>
            <FileText size={14}/> <span>Gen. Elevation</span>
          </button>
        </div>
        <div className="divider" style={{width:'80%', margin:'8px auto', background:'var(--border)', height:1}} />
        <div className="tool-group">
          <div className="tool-group-label" style={{textAlign: 'left', paddingLeft: 12}}>Export / QTO</div>
          <button className="sidebar-btn" onClick={() => onStatusChange('Calculating Volume / BOQ via FreeCAD...')}>
            <Settings2 size={14}/> <span>Quantities (QTO)</span>
          </button>
          <button className="sidebar-btn" onClick={() => onStatusChange('Exporting IFC4 Model via FreeCAD...')}>
            <Download size={14}/> <span>Export IFC4</span>
          </button>
        </div>
      </div>

      {/* 3D Viewport */}
      <div className="viewport-container"
        ref={mountRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleClick}
        onWheel={handleWheel}
        style={{ cursor: isDragging.current ? 'grabbing' : 'grab' }}
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
            <h3>No 3D Model</h3>
            <p>Draw a floor plan in the Plans tab,<br/>then click "Generate 3D" to convert it.</p>
            <button className="btn primary" onClick={handleGenerate3D}>
              <RefreshCw size={13}/> Generate 3D from Floor Plan
            </button>
          </div>
        )}
        {isGenerating && (
          <div className="viewport-loading">
            <div className="spinner" style={{ width: 32, height: 32 }} />
            <span>Generating 3D model…</span>
          </div>
        )}

        {/* 3D overlay controls */}
        <div className="viewport-controls">
          <div className="panel" style={{ padding: 8 }}>
            <div className="label" style={{ marginBottom: 6 }}>Render</div>
            {(['solid','wireframe','clay'] as const).map(m => (
              <button key={m} className={`btn ghost${renderMode === m ? ' active' : ''}`}
                style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 2, fontSize: 11 }}
                onClick={() => setRenderMode(m)}>
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
            <div className="divider" />
            <button className="btn primary" style={{ width: '100%', fontSize: 11 }}
              onClick={handleGenerate3D} disabled={isGenerating}>
              <RefreshCw size={11}/>
              {isGenerating ? 'Generating…' : 'Update 3D'}
            </button>
          </div>
        </div>

        {/* Navigation hint */}
        {hasModel && (
          <div className="viewport-hint">
            Orbit: drag mouse &nbsp;|&nbsp; Zoom: scroll wheel
          </div>
        )}
      </div>

      {/* Right properties panel */}
      <div className="threed-properties">
        {selectedObjectId ? (
          <div className="panel" style={{ margin: 8 }}>
            <div className="panel-header"><span>BIM Properties</span></div>
            <div style={{ padding: 8 }}>
              <div className="label">Object ID</div>
              <div style={{ fontSize: 12, color: 'var(--text-primary)', marginBottom: 8, fontFamily: 'monospace' }}>{selectedObjectId}</div>
              
              <div className="label">FreeCAD Class</div>
              <div style={{ fontSize: 12, color: 'var(--text-primary)', marginBottom: 8 }}>Arch::Wall</div>

              <div className="label">Structural Material</div>
              <select style={{ width: '100%', marginBottom: 8, background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: 4, borderRadius: 4 }}>
                <option>Concrete C30/37</option>
                <option>Steel S355</option>
                <option>Timber C24</option>
                <option>Masonry Unit</option>
              </select>

              <div className="label">Fire Rating</div>
              <select style={{ width: '100%', marginBottom: 8, background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: 4, borderRadius: 4 }}>
                <option>REI 60</option>
                <option>REI 90</option>
                <option>REI 120</option>
                <option>Unrated</option>
              </select>

              <div className="label">Thermal Transmittance (U)</div>
              <div style={{ fontSize: 12, color: 'var(--text-primary)', marginBottom: 8 }}>0.28 W/(m²K)</div>

              <button className="btn outline" style={{ width: '100%', marginTop: 8 }} onClick={() => onStatusChange('Opening FreeCAD Property Editor...')}>
                <Settings2 size={12}/> Advanced Properties
              </button>
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
              <div className="label">Entities in Plan</div>
              <div style={{ fontSize: 12, color: 'var(--text-primary)', marginBottom: 8 }}>{floor.entities.length}</div>
              <div className="label">3D Objects</div>
              <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>
                {hasModel ? (sceneRef.current?.children.filter(c => c.userData['archflow']).length ?? 0) : 0}
              </div>
            </div>
          </div>
        )}

        {/* Camera presets */}
        <div className="panel" style={{ margin: 8, marginTop: 0 }}>
          <div className="panel-header"><span>Camera</span><Camera size={12}/></div>
          <div style={{ padding: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            {[
              { label: 'Orbit', fn: () => { orbitAngles.current = { theta: Math.PI/4, phi: Math.PI/4, radius: 20 }; } },
              { label: 'Top',   fn: () => { orbitAngles.current = { theta: 0, phi: Math.PI/2 - 0.01, radius: 20 }; } },
              { label: 'Front', fn: () => { orbitAngles.current = { theta: 0, phi: 0.2, radius: 20 }; } },
              { label: 'Right', fn: () => { orbitAngles.current = { theta: Math.PI/2, phi: 0.2, radius: 20 }; } },
            ].map(preset => (
              <button key={preset.label} className="btn ghost" style={{ fontSize: 11 }}
                onClick={() => {
                  preset.fn();
                  const a = orbitAngles.current, r = a.radius;
                  if (cameraRef.current) {
                    cameraRef.current.position.set(
                      r * Math.sin(a.theta) * Math.cos(a.phi),
                      r * Math.sin(a.phi),
                      r * Math.cos(a.theta) * Math.cos(a.phi)
                    );
                    cameraRef.current.lookAt(0, 1.5, 0);
                  }
                }}>
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
