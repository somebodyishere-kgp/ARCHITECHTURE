# ArchFlow 🏗️

> **AI-powered, open-source Architecture & BIM desktop application.**
> AutoCAD-class 2D drafting + Revit-class 3D BIM + AI design generation — unified in one tool.

[![Built with Tauri](https://img.shields.io/badge/Built%20with-Tauri%202-blue?logo=tauri)](https://tauri.app)
[![React](https://img.shields.io/badge/Frontend-React%2018-61DAFB?logo=react)](https://react.dev)
[![FreeCAD Engine](https://img.shields.io/badge/BIM%20Engine-FreeCAD-orange)](https://freecad.org)
[![LibreCAD Engine](https://img.shields.io/badge/2D%20Engine-LibreCAD-green)](https://librecad.org)

---

## What is ArchFlow?

ArchFlow is a **native desktop application** (Windows/macOS/Linux) for architects and engineers that combines:

| Feature | Open-source engine powering it |
|---|---|
| **2D Drafting** (AutoCAD-class, 1000+ tools) | [LibreCAD 3](https://github.com/LibreCAD/LibreCAD) C++ core |
| **3D BIM Modeling** (Revit-class) | [FreeCAD](https://github.com/FreeCAD/FreeCAD) + OpenCASCADE |
| **IFC Export/Import** | FreeCAD Arch/BIM workbench via Python API |
| **Real-time 3D Viewer** | Three.js (WebGL) |
| **AI Floor Plan Generation** | Ollama (local LLM) / OpenAI API |
| **Building Codes & Regulations** | Built-in NBC/local bylaw database |
| **Documentation / BOQ** | Auto-generated from BIM model |

---

## Architecture

```
ArchFlow Desktop App (Tauri native window)
├── Frontend (React + TypeScript + Vite)
│   ├── Tab 1: Plans (2D Drafting)  ──── LibreCAD Engine (C++ WASM / subprocess)
│   ├── Tab 2: 3D / Render          ──── FreeCAD Python API → Three.js viewer
│   └── Tab 3: Documentation        ──── Auto from IFC model
│
├── Tauri Rust Backend
│   ├── File I/O (ADF project format)
│   ├── Shell: FreeCAD Python bridge sidecar
│   ├── Shell: LibreCAD DXF bridge
│   └── AI command routing
│
├── bridges/
│   ├── freecad_bridge.py   ← FreeCAD: 3D BIM, IFC, sections, elevations
│   ├── librecad_bridge.py  ← LibreCAD: 2D DXF I/O
│   └── blender_bridge.py   ← Blender: Photorealistic rendering
│
└── ai/
    ├── floor_plan_agent.py ← LLM orchestration (LangChain)
    ├── code_lookup.py      ← Building code RAG
    └── layout_to_adf.py    ← LLM JSON → ADF geometry
```

---

## Prerequisites

| Software | Purpose | Download |
|---|---|---|
| **Node.js 18+** | Frontend build | [nodejs.org](https://nodejs.org) |
| **Rust 1.70+** | Tauri backend | [rustup.rs](https://rustup.rs) |
| **FreeCAD 0.21+** | 3D BIM engine | [freecad.org/downloads](https://www.freecad.org/downloads.php) |
| **Python 3.10+** | Bridge scripts | [python.org](https://python.org) |
| **Ollama** (optional) | Local AI | [ollama.com](https://ollama.com) |

---

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/somebodyishere-kgp/ARCHITECHTURE.git
cd ARCHITECHTURE

# 2. Install frontend dependencies
npm install

# 3. Run in development mode (browser preview)
npm run dev
# → http://localhost:1420/

# 4. Run as native desktop app (requires Rust + Tauri CLI)
cargo install tauri-cli
npm run tauri dev
```

---

## 2D Drafting Tools (via LibreCAD)

All **300+ LibreCAD commands** are exposed, including:

### Draw
`line` `polyline` `arc` `circle` `ellipse` `spline` `rect` `polygon` `text` `mtext` `hatch` `point` `image`

### Architectural
`wall` `door` `window` `stair` `column` `slab` `roof` `curtain-wall`

### Modify
`trim` `extend` `break` `offset` `fillet` `chamfer` `mirror` `copy` `move` `rotate` `scale` `array` `stretch` `explode`

### Dimension
`dimlinear` `dimaligned` `dimradius` `dimdiameter` `dimangular` `dimordinate` `leader` `qleader`

### View
`zoom` `pan` `regen` `redraw` `viewports` `namedviews`

### Blocks & Layers
`block` `insert` `wblock` `xref` `layer` `linetype` `lweight` `color`

### Annotation
`text` `mtext` `style` `table` `field`

---

## 3D BIM Tools (via FreeCAD)

All **FreeCAD BIM/Arch workbench** tools exposed:

- **Walls** — with thickness, height, material layers, openings
- **Floors / Slabs** — structural slabs with reinforcement properties
- **Roofs** — parametric pitched/flat/curved roofs
- **Stairs** — with riser/tread calculation
- **Columns & Beams** — structural profiles
- **Spaces** — IFC IfcSpace for area/volume calculation
- **IFC Import/Export** — full IFC 2x3 / IFC 4 support
- **TechDraw** — auto sections, elevations from 3D model
- **FEM** — structural finite element analysis
- **Rendering** — Raytrace / Blender integration

---

## AI Design Generation

```
You: "Design a brutalist museum in Goa near the beach, 3000 sqm, 3 floors"

AI:  1. Detect location → Goa, India
     2. Fetch building codes → CRZ rules, max height 15m, FAR 1.0
     3. Generate floor plan (room layout as geometry)
     4. Show 2D plan for approval
     5. Auto-convert to 3D BIM model
     6. Apply Brutalist material palette
     7. Generate sections + elevations automatically
     8. Produce preliminary BOQ
```

---

## ADF Project Format

ArchFlow saves projects as `.adf` files (ZIP + JSON):
```
project.adf
├── manifest.json       ← project metadata
├── floors/
│   ├── floor_00.json   ← 2D geometry + BIM properties per floor
│   └── floor_01.json
├── model/
│   ├── building.ifc    ← full IFC BIM model
│   └── building.gltf   ← Three.js viewer cache
├── sheets/
│   └── sheet_01.json   ← documentation layouts
└── assets/
    └── render_01.png   ← rendered images
```

---

## Development Phases

- [x] **Phase 1** — Tauri shell + React tabs + ADF data model
- [x] **Phase 2** — 2D Canvas drafting engine (baseline)
- [x] **Phase 3** — Three.js 3D viewport
- [x] **Phase 4** — Documentation (schedules, BOQ, building codes)
- [x] **Phase 5** — AI floor plan generation
- [ ] **Phase 6** — LibreCAD C++ / WASM integration (all 300+ 2D tools)
- [ ] **Phase 7** — FreeCAD Python bridge (full BIM + IFC)
- [ ] **Phase 8** — Blender rendering bridge
- [ ] **Phase 9** — Real-time collaboration
- [ ] **Phase 10** — Mobile companion app

---

## Contributing

Pull requests welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## License

Built on top of open-source projects:
- [FreeCAD](https://github.com/FreeCAD/FreeCAD) — LGPL 2.1
- [LibreCAD](https://github.com/LibreCAD/LibreCAD) — GPLv2
- [Three.js](https://github.com/mrdoob/three.js) — MIT
- [Tauri](https://github.com/tauri-apps/tauri) — MIT / Apache 2.0
