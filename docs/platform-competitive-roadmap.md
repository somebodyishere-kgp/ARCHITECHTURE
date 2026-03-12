# Platform Competitive Roadmap (Revit, AutoCAD, SketchUp, Rayon, others)

## Source Snapshot (publicly accessible pages)
- SketchUp for Web page: core messaging around easy 3D modeling, saved project views, and reference drawing outputs.
- Rayon marketing page: precision drafting, style/annotation, item/material libraries, schedules, collaboration, version history, AI helpers.
- Autodesk pages in this environment redirect through auth, so capability references below use public product positioning norms and established industry workflows.

## Capability Map

### Revit-style strengths to emulate
- BIM-first data model with parametric building elements.
- View templates and sheet-oriented documentation workflows.
- Schedules and quantity workflows tied to model metadata.
- Worksharing and model coordination across disciplines.
- Phasing/design options and robust section/elevation management.

### AutoCAD architecture strengths to emulate
- Fast precision drafting and annotation controls.
- Layer standards, blocks, xrefs, and drawing management.
- DWG-centered interoperability and detail production.
- Command-driven speed for repetitive modeling tasks.

### SketchUp strengths to emulate
- Very low-friction conceptual modeling.
- Scenes/saved views and storytelling workflow.
- Strong component ecosystem and reusable assets.
- Extension ecosystem and user customization.

### Rayon strengths to emulate
- Collaboration-first UX and low-friction sharing.
- Rich style/annotation output for communication.
- Asset/material libraries, schedules, and quick documentation.
- AI-assisted drafting and content generation patterns.

## What we implemented now
- Native chunk-streamed geometry pipeline with release API.
- Advanced render stack: SSAO, TAA, SSR, optional CSM, physical sky, geolocated sun.
- Runtime scale systems: adaptive governor, dynamic render scale, occlusion throttle, BVH picking.
- New competitive tools:
  - Saved view presets (scene-like workflow).
  - Quick asset library insertion (component-library workflow).

## Next high-impact builds (ranked)
1. BIM schedule table generator with exportable CSV/XLSX from live model entities.
2. Annotation/markup layer in 2D and 3D views (callouts, tags, keyed notes).
3. Collaboration baseline: shared comments + presence cursors + change feed.
4. Reusable component definitions (true block/family objects) with parameter editing.
5. Level/grid manager and phasing controls for documentation workflows.
6. Rule checks (clearance/code snippets) and clash workflow refinements.

## Integration Strategy
- Keep ArchFlow’s current speed advantages while adding BIM depth incrementally.
- Prefer feature slices that improve both design-time and document-time workflows.
- Gate expensive visual features under quality/governor profiles by default.
- Add model metadata fields only when they unlock downstream schedule or compliance value.
