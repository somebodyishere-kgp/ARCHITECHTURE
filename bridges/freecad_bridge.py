#!/usr/bin/env python3
"""
ArchFlow ↔ FreeCAD Bridge
=========================
This script is called as a Tauri sidecar process.
It accepts JSON commands on stdin and returns JSON responses on stdout.

Requires FreeCAD to be installed and `FREECADPATH` env var set, e.g.:
  Windows: C:\Program Files\FreeCAD 0.21\bin
  Linux:   /usr/lib/freecad/lib
  macOS:   /Applications/FreeCAD.app/Contents/Resources/lib

Usage (from Tauri): 
  python freecad_bridge.py < command.json > response.json
"""

import sys
import json
import os
import math
import traceback

# ─── FreeCAD path setup ───────────────────────────────────────────────────────
FREECAD_PATHS = [
    os.environ.get("FREECADPATH", ""),
    r"C:\Program Files\FreeCAD 1.0\bin",
    r"C:\Program Files\FreeCAD 0.21\bin",
    r"C:\Program Files\FreeCAD 0.20\bin",
    "/usr/lib/freecad/lib",
    "/usr/lib/freecad-daily/lib",
    "/Applications/FreeCAD.app/Contents/Resources/lib",
]

freecad_available = False
for path in FREECAD_PATHS:
    if path and os.path.isdir(path):
        sys.path.insert(0, path)
        try:
            import FreeCAD as App
            import FreeCADGui  # noqa: F401 - needed for some operations
            import Part
            import Arch
            import Draft
            freecad_available = True
            break
        except ImportError:
            continue

def respond(data: dict):
    print(json.dumps(data), flush=True)

def error(msg: str):
    respond({"ok": False, "error": msg})

def ok(data: dict = {}):
    respond({"ok": True, **data})

# ─── Command handlers ─────────────────────────────────────────────────────────

def cmd_check():
    """Check if FreeCAD is available and return version info."""
    if not freecad_available:
        error("FreeCAD not found. Set FREECADPATH environment variable to your FreeCAD lib directory.")
        return
    ok({
        "freecad_version": App.Version(),
        "freecad_path": App.__file__,
        "opencascade_version": Part.OCC_VERSION,
    })

def cmd_create_ifc_from_adf(floor_data: dict, output_path: str):
    """
    Convert ADF floor plan geometry to a full IFC BIM model using FreeCAD's
    Arch/BIM workbench.
    Returns path to the generated IFC file.
    """
    if not freecad_available:
        error("FreeCAD not available")
        return

    try:
        doc = App.newDocument("ArchFlow_BIM")
        arch_objects = []
        
        entities = floor_data.get("entities", [])
        floor_height = floor_data.get("floor_height", 3000.0)
        floor_name = floor_data.get("name", "Ground Floor")

        # Create building structure
        building = Arch.makeBuilding([], name="Building")
        storey = Arch.makeFloor([], name=floor_name)
        storey.Height = floor_height

        walls_created = []
        for entity in entities:
            etype = entity.get("type", "")

            if etype == "wall":
                x1 = entity["x1"] / 1000.0  # mm → m
                y1 = entity["y1"] / 1000.0
                x2 = entity["x2"] / 1000.0
                y2 = entity["y2"] / 1000.0
                thickness = entity.get("thickness", 200) / 1000.0
                height = entity.get("height", floor_height) / 1000.0

                # Create baseline edge
                baseline = Draft.makeLine(
                    App.Vector(x1, y1, 0),
                    App.Vector(x2, y2, 0)
                )
                # Create IFC Wall
                wall = Arch.makeWall(baseline,
                    height=height,
                    width=thickness,
                    name=entity.get("id", "Wall"))
                wall.IfcType = "Wall"
                wall.Material = _get_or_create_material(doc, "Concrete")
                walls_created.append(wall)
                arch_objects.append(wall)

            elif etype == "door":
                x = entity["x"] / 1000.0
                y = entity["y"] / 1000.0
                width = entity.get("width", 900) / 1000.0
                height_d = entity.get("height", 2100) / 1000.0
                window = Arch.makeWindowPreset(
                    "Simple door",
                    width=width,
                    height=height_d,
                    h1=0.1, h2=0.1, h3=0.1, w1=width, w2=0.0,
                    o1=0, o2=0,
                    placement=App.Placement(
                        App.Vector(x, y, 0),
                        App.Rotation(App.Vector(0, 0, 1), 0)
                    )
                )
                window.IfcType = "Door"
                arch_objects.append(window)

            elif etype == "window":
                x = entity["x"] / 1000.0
                y = entity["y"] / 1000.0
                width = entity.get("width", 1200) / 1000.0
                height_w = entity.get("height", 1200) / 1000.0
                sill = entity.get("sillHeight", 900) / 1000.0
                window = Arch.makeWindowPreset(
                    "Fixed",
                    width=width,
                    height=height_w,
                    h1=0.1, h2=0.1, h3=0.1, w1=width, w2=0.0,
                    o1=0, o2=0,
                    placement=App.Placement(
                        App.Vector(x, y, sill),
                        App.Rotation(App.Vector(0, 0, 1), 0)
                    )
                )
                window.IfcType = "Window"
                arch_objects.append(window)

        # Assemble building hierarchy
        if arch_objects:
            storey.Group = arch_objects
        building.Group = [storey]

        doc.recompute()

        # Export IFC
        import importIFC
        importIFC.export([building], output_path)
        doc.save(output_path.replace(".ifc", ".FCStd"))
        App.closeDocument(doc.Name)

        ok({
            "ifc_path": output_path,
            "entity_count": len(arch_objects),
            "walls": len(walls_created),
        })

    except Exception as e:
        error(f"IFC export failed: {traceback.format_exc()}")

def cmd_generate_sections(ifc_path: str, output_dir: str):
    """
    Generate 2D section drawings from a 3D model using FreeCAD TechDraw.
    Returns paths to SVG section drawings.
    """
    if not freecad_available:
        error("FreeCAD not available")
        return
    try:
        import importIFC
        import TechDraw
        import TechDrawGui  # noqa

        doc = App.newDocument("Sections")
        
        # Import IFC
        importIFC.insert(ifc_path, doc.Name)
        doc.recompute()

        # Create a TechDraw page
        page = doc.addObject('TechDraw::DrawPage', 'SectionPage')
        template = doc.addObject('TechDraw::DrawSVGTemplate', 'Template')
        template.Template = App.getResourceDir() + 'Mod/TechDraw/Templates/A1_Landscape_ISO.svg'
        page.Template = template

        # Get all solid objects
        solids = [obj for obj in doc.Objects if hasattr(obj, 'Shape') and obj.Shape.Solids]

        if solids:
            # Create section view (cut plane at middle of Z)
            view = doc.addObject('TechDraw::DrawViewSection', 'SectionView')
            view.BaseView = None
            view.Source = solids
            view.SectionDirection = 'Down'
            view.SectionNormal = App.Vector(0, 1, 0)
            view.SectionOrigin = App.Vector(0, 0, 1.5)
            view.Scale = 0.01
            page.addView(view)

        doc.recompute()

        # Export section as SVG
        os.makedirs(output_dir, exist_ok=True)
        svg_path = os.path.join(output_dir, "section_AA.svg")
        TechDraw.writeDXFPage(page, svg_path)

        App.closeDocument(doc.Name)
        ok({"section_svg": svg_path})

    except Exception as e:
        error(f"Section generation failed: {traceback.format_exc()}")

def cmd_export_gltf(ifc_path: str, gltf_path: str):
    """Export IFC model to GLTF for the Three.js viewer."""
    if not freecad_available:
        error("FreeCAD not available")
        return
    try:
        import importIFC
        doc = App.newDocument("Export")
        importIFC.insert(ifc_path, doc.Name)
        doc.recompute()

        # Collect all meshable shapes
        shapes = [o for o in doc.Objects if hasattr(o, 'Shape')]
        
        # Export via Mesh module
        import Mesh
        mesh_doc = App.newDocument("Mesh")
        for shape_obj in shapes:
            mesh = Mesh.Mesh()
            mesh.addFacets(shape_obj.Shape.tessellate(0.01))
            mesh_obj = mesh_doc.addObject("Mesh::Feature", shape_obj.Name)
            mesh_obj.Mesh = mesh

        # Export as OBJ (convert to GLTF externally or use assimp)
        obj_path = gltf_path.replace(".gltf", ".obj")
        Mesh.export([o for o in mesh_doc.Objects], obj_path)

        App.closeDocument(doc.Name)
        App.closeDocument(mesh_doc.Name)

        ok({"obj_path": obj_path, "note": "Convert OBJ to GLTF using: npx obj2gltf -i model.obj -o model.gltf"})

    except Exception as e:
        error(f"GLTF export failed: {traceback.format_exc()}")

def cmd_get_quantities(ifc_path: str):
    """Extract quantity takeoff from an IFC model."""
    if not freecad_available:
        error("FreeCAD not available")
        return
    try:
        import importIFC
        doc = App.newDocument("QTO")
        importIFC.insert(ifc_path, doc.Name)
        doc.recompute()

        quantities = {
            "walls": [],
            "floors": [],
            "doors": 0,
            "windows": 0,
            "total_volume_m3": 0,
        }

        for obj in doc.Objects:
            ifc_type = getattr(obj, "IfcType", "")
            if ifc_type == "Wall" and hasattr(obj, "Shape"):
                vol = obj.Shape.Volume / 1e9  # mm³ → m³
                quantities["walls"].append({
                    "name": obj.Name,
                    "length_m": obj.Length / 1000 if hasattr(obj, "Length") else 0,
                    "height_m": obj.Height / 1000 if hasattr(obj, "Height") else 0,
                    "volume_m3": round(vol, 3),
                })
                quantities["total_volume_m3"] += vol
            elif ifc_type == "Door":
                quantities["doors"] += 1
            elif ifc_type == "Window":
                quantities["windows"] += 1

        App.closeDocument(doc.Name)
        ok({"quantities": quantities})

    except Exception as e:
        error(f"QTO failed: {traceback.format_exc()}")

# ─── Helpers ──────────────────────────────────────────────────────────────────

def _get_or_create_material(doc, name: str):
    """Get or create an Arch material."""
    try:
        import ArchMaterial
        for obj in doc.Objects:
            if obj.Label == name:
                return obj
        mat = ArchMaterial.makeMaterial(name)
        mat.Color = (0.8, 0.78, 0.74, 1.0) if name == "Concrete" else (0.9, 0.85, 0.7, 1.0)
        return mat
    except:
        return None

# ─── Main dispatcher ──────────────────────────────────────────────────────────

def main():
    try:
        raw = sys.stdin.read().strip()
        if not raw:
            error("No input received")
            return
        
        cmd = json.loads(raw)
        action = cmd.get("action", "")

        dispatch = {
            "check":              lambda: cmd_check(),
            "create_ifc":         lambda: cmd_create_ifc_from_adf(cmd["floor_data"], cmd["output_path"]),
            "generate_sections":  lambda: cmd_generate_sections(cmd["ifc_path"], cmd["output_dir"]),
            "export_gltf":        lambda: cmd_export_gltf(cmd["ifc_path"], cmd["gltf_path"]),
            "get_quantities":     lambda: cmd_get_quantities(cmd["ifc_path"]),
        }

        if action in dispatch:
            dispatch[action]()
        else:
            error(f"Unknown action: {action}. Valid: {list(dispatch.keys())}")

    except json.JSONDecodeError as e:
        error(f"Invalid JSON input: {e}")
    except KeyError as e:
        error(f"Missing required parameter: {e}")
    except Exception as e:
        error(f"Unexpected error: {traceback.format_exc()}")

if __name__ == "__main__":
    main()
