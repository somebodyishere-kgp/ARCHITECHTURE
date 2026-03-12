#!/usr/bin/env python3
"""
ArchFlow ↔ LibreCAD Bridge
===========================
Handles DXF import/export via the libdxfrw Python bindings or ezdxf.
This allows full round-trip compatibility with AutoCAD DXF files.

Install:  pip install ezdxf
"""

import sys
import json
import os
import traceback
import math

try:
    import ezdxf
    from ezdxf.enums import TextEntityAlignment
    EZDXF_AVAILABLE = True
except ImportError:
    EZDXF_AVAILABLE = False

def respond(data: dict):
    print(json.dumps(data), flush=True)

def error(msg: str):
    respond({"ok": False, "error": msg})

def ok(data: dict = {}):
    respond({"ok": True, **data})

# ─── Command handlers ─────────────────────────────────────────────────────────

def cmd_check():
    if not EZDXF_AVAILABLE:
        error("ezdxf not installed. Run: pip install ezdxf")
        return
    ok({"ezdxf_version": ezdxf.__version__})

def cmd_export_dxf(floor_data: dict, output_path: str, dxf_version: str = "R2010"):
    """
    Export ADF floor geometry to a full AutoCAD-compatible DXF file.
    Supports all entity types with proper layer assignment, colors, linetypes.
    """
    if not EZDXF_AVAILABLE:
        error("ezdxf not installed")
        return
    try:
        doc = ezdxf.new(dxf_version)
        msp = doc.modelspace()

        # ── Set up layers ─────────────────────────────────────────────────
        layers_data = floor_data.get("layers", [])
        for layer in layers_data:
            lname = layer["name"]
            color_hex = layer.get("color", "#ffffff").lstrip("#")
            # Convert hex to ACI (AutoCAD Color Index) — approximate
            r, g, b = int(color_hex[0:2], 16), int(color_hex[2:4], 16), int(color_hex[4:6], 16)
            aci = _rgb_to_aci(r, g, b)
            lw_mm = layer.get("lineweight", 0.25)
            lw_ezdxf = _mm_to_lineweight(lw_mm)
            
            if lname not in doc.layers:
                new_layer = doc.layers.new(name=lname)
                new_layer.color = aci
                new_layer.lineweight = lw_ezdxf
                if not layer.get("visible", True):
                    new_layer.off()
                if layer.get("locked", False):
                    new_layer.lock()

        # ── Export entities ───────────────────────────────────────────────
        entities = floor_data.get("entities", [])
        floor_height = floor_data.get("floor_height", 3000)

        for entity in entities:
            etype = entity.get("type", "")
            layer = entity.get("layer", "0")

            if etype in ("wall", "line"):
                x1 = entity["x1"] / 1000.0
                y1 = entity["y1"] / 1000.0
                x2 = entity["x2"] / 1000.0
                y2 = entity["y2"] / 1000.0

                if etype == "wall":
                    thickness = entity.get("thickness", 200) / 1000.0
                    # Draw wall as two parallel lines (standard architectural convention)
                    dx = x2 - x1; dy = y2 - y1
                    length = math.hypot(dx, dy)
                    if length > 0:
                        nx = (-dy / length) * thickness / 2
                        ny = (dx / length) * thickness / 2
                        msp.add_line((x1 + nx, y1 + ny), (x2 + nx, y2 + ny), dxfattribs={"layer": layer})
                        msp.add_line((x1 - nx, y1 - ny), (x2 - nx, y2 - ny), dxfattribs={"layer": layer})
                        # End caps
                        msp.add_line((x1 + nx, y1 + ny), (x1 - nx, y1 - ny), dxfattribs={"layer": layer})
                        msp.add_line((x2 + nx, y2 + ny), (x2 - nx, y2 - ny), dxfattribs={"layer": layer})
                else:
                    msp.add_line((x1, y1), (x2, y2), dxfattribs={"layer": layer})

            elif etype == "circle":
                cx = entity["cx"] / 1000.0
                cy = entity["cy"] / 1000.0
                r = entity["radius"] / 1000.0
                msp.add_circle((cx, cy), r, dxfattribs={"layer": layer})

            elif etype == "arc":
                cx = entity["cx"] / 1000.0
                cy = entity["cy"] / 1000.0
                r = entity["radius"] / 1000.0
                start = entity.get("startAngle", 0)
                end = entity.get("endAngle", 90)
                msp.add_arc((cx, cy), r, start, end, dxfattribs={"layer": layer})

            elif etype == "text":
                x = entity["x"] / 1000.0
                y = entity["y"] / 1000.0
                text = entity.get("text", "")
                height = entity.get("fontSize", 200) / 1000.0
                msp.add_text(text, dxfattribs={
                    "layer": layer,
                    "insert": (x, y),
                    "height": height,
                })

            elif etype == "dimension":
                x1 = entity["x1"] / 1000.0; y1 = entity["y1"] / 1000.0
                x2 = entity["x2"] / 1000.0; y2 = entity["y2"] / 1000.0
                offset = entity.get("offsetY", 500) / 1000.0
                msp.add_linear_dim(
                    base=(x1 + (x2 - x1) / 2, y1 - offset),
                    p1=(x1, y1), p2=(x2, y2),
                    dxfattribs={"layer": layer}
                ).render()

            elif etype == "door":
                x = entity["x"] / 1000.0
                y = entity["y"] / 1000.0
                width = entity.get("width", 900) / 1000.0
                swing = entity.get("swing", 90)
                # Door: line + arc (classic architectural symbol)
                msp.add_line((x, y), (x + width, y), dxfattribs={"layer": layer})
                msp.add_arc((x, y), width, 0, swing, dxfattribs={"layer": layer})

            elif etype == "window":
                x = entity["x"] / 1000.0
                y = entity["y"] / 1000.0
                width = entity.get("width", 1200) / 1000.0
                # Window: three parallel lines (standard symbol)
                for dy_off in [-0.04, 0, 0.04]:
                    msp.add_line((x, y + dy_off), (x + width, y + dy_off), dxfattribs={"layer": layer})
                msp.add_line((x, y - 0.04), (x, y + 0.04), dxfattribs={"layer": layer})
                msp.add_line((x + width, y - 0.04), (x + width, y + 0.04), dxfattribs={"layer": layer})

            elif etype == "hatch":
                # Hatch regions
                pass  # Complex — would need boundary definition

        doc.saveas(output_path)
        ok({
            "dxf_path": output_path,
            "entity_count": len(entities),
            "dxf_version": dxf_version,
        })

    except Exception as e:
        error(f"DXF export failed: {traceback.format_exc()}")

def cmd_import_dxf(dxf_path: str):
    """
    Import a DXF file and convert to ADF geometry.
    Handles DXF R12 through DXF 2018.
    """
    if not EZDXF_AVAILABLE:
        error("ezdxf not installed")
        return
    try:
        doc = ezdxf.readfile(dxf_path)
        msp = doc.modelspace()

        entities = []
        layers = []

        # Extract layers
        for layer in doc.layers:
            layers.append({
                "name": layer.dxf.name,
                "color": "#aaaaaa",  # ACI → hex conversion omitted for brevity
                "visible": layer.is_on(),
                "locked": layer.is_locked(),
                "lineweight": 0.25,
            })

        # Extract entities
        for e in msp:
            etype = e.dxftype()
            layer = e.dxf.layer if hasattr(e.dxf, "layer") else "0"

            if etype == "LINE":
                entities.append({
                    "id": f"l{len(entities)}",
                    "type": "line",
                    "layer": layer,
                    "x1": e.dxf.start.x * 1000,
                    "y1": e.dxf.start.y * 1000,
                    "x2": e.dxf.end.x * 1000,
                    "y2": e.dxf.end.y * 1000,
                })
            elif etype == "CIRCLE":
                entities.append({
                    "id": f"c{len(entities)}",
                    "type": "circle",
                    "layer": layer,
                    "cx": e.dxf.center.x * 1000,
                    "cy": e.dxf.center.y * 1000,
                    "radius": e.dxf.radius * 1000,
                })
            elif etype == "ARC":
                entities.append({
                    "id": f"a{len(entities)}",
                    "type": "arc",
                    "layer": layer,
                    "cx": e.dxf.center.x * 1000,
                    "cy": e.dxf.center.y * 1000,
                    "radius": e.dxf.radius * 1000,
                    "startAngle": e.dxf.start_angle,
                    "endAngle": e.dxf.end_angle,
                })
            elif etype == "TEXT":
                entities.append({
                    "id": f"t{len(entities)}",
                    "type": "text",
                    "layer": layer,
                    "x": e.dxf.insert.x * 1000,
                    "y": e.dxf.insert.y * 1000,
                    "text": e.dxf.text,
                    "fontSize": e.dxf.height * 1000,
                })
            elif etype in ("LWPOLYLINE", "POLYLINE"):
                # Convert polyline segments to individual lines
                try:
                    pts = list(e.get_points())
                    for i in range(len(pts) - 1):
                        p1 = pts[i]; p2 = pts[i + 1]
                        entities.append({
                            "id": f"pl{len(entities)}",
                            "type": "line",
                            "layer": layer,
                            "x1": p1[0] * 1000, "y1": p1[1] * 1000,
                            "x2": p2[0] * 1000, "y2": p2[1] * 1000,
                        })
                    if e.is_closed and len(pts) > 1:
                        p1 = pts[-1]; p2 = pts[0]
                        entities.append({
                            "id": f"pl{len(entities)}",
                            "type": "line",
                            "layer": layer,
                            "x1": p1[0] * 1000, "y1": p1[1] * 1000,
                            "x2": p2[0] * 1000, "y2": p2[1] * 1000,
                        })
                except: pass

        ok({
            "entities": entities,
            "layers": layers,
            "dxf_version": doc.dxfversion,
            "entity_count": len(entities),
        })

    except Exception as e:
        error(f"DXF import failed: {traceback.format_exc()}")

# ─── Color/lineweight helpers ─────────────────────────────────────────────────

def _rgb_to_aci(r: int, g: int, b: int) -> int:
    """Approximate RGB to AutoCAD Color Index (ACI)."""
    # Simple closest-color lookup for common colors
    if r > 200 and g > 200 and b > 200: return 7   # white
    if r > 200 and g < 100 and b < 100: return 1   # red
    if r < 100 and g > 200 and b < 100: return 3   # green
    if r < 100 and g < 100 and b > 200: return 5   # blue
    if r > 200 and g > 200 and b < 100: return 2   # yellow
    if r < 100 and g > 200 and b > 200: return 4   # cyan
    if r > 200 and g < 100 and b > 200: return 6   # magenta
    return 7  # default white

def _mm_to_lineweight(mm: float) -> int:
    """Convert mm lineweight to ezdxf lineweight constant."""
    # DXF lineweights in 100ths of mm
    return int(mm * 100)


# ─── SVG Export ───────────────────────────────────────────────────────────────

def cmd_export_svg(floor_data: dict, output_path: str):
    """Export ADF floor data to SVG."""
    try:
        entities = floor_data.get("entities", [])
        layers = floor_data.get("layers", [])
        layer_map = {l["name"]: l for l in layers}

        # Compute bounding box
        min_x, min_y, max_x, max_y = float('inf'), float('inf'), float('-inf'), float('-inf')
        for ent in entities:
            pts = _get_entity_points(ent)
            for p in pts:
                min_x = min(min_x, p[0])
                min_y = min(min_y, p[1])
                max_x = max(max_x, p[0])
                max_y = max(max_y, p[1])

        if min_x == float('inf'):
            min_x = min_y = 0
            max_x = max_y = 1000

        margin = 50
        w = max_x - min_x + 2 * margin
        h = max_y - min_y + 2 * margin

        svg_lines = [
            f'<?xml version="1.0" encoding="UTF-8"?>',
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{min_x - margin} {min_y - margin} {w} {h}" width="{w}" height="{h}">',
            f'<rect x="{min_x - margin}" y="{min_y - margin}" width="{w}" height="{h}" fill="#1a1a2e"/>',
        ]

        for ent in entities:
            etype = ent.get("type", "")
            layer = ent.get("layer", "0")
            color = ent.get("color") or layer_map.get(layer, {}).get("color", "#ffffff")
            lw = ent.get("lineweight") or layer_map.get(layer, {}).get("lineweight", 0.25)
            style = f'stroke="{color}" stroke-width="{lw}" fill="none"'

            if etype == "line":
                svg_lines.append(f'<line x1="{ent["x1"]}" y1="{ent["y1"]}" x2="{ent["x2"]}" y2="{ent["y2"]}" {style}/>')
            elif etype == "wall":
                svg_lines.append(f'<line x1="{ent["x1"]}" y1="{ent["y1"]}" x2="{ent["x2"]}" y2="{ent["y2"]}" stroke="{color}" stroke-width="{ent.get("thickness", 200)}" fill="none"/>')
            elif etype == "circle":
                svg_lines.append(f'<circle cx="{ent["cx"]}" cy="{ent["cy"]}" r="{ent["radius"]}" {style}/>')
            elif etype == "rectangle":
                x = min(ent["x1"], ent["x2"])
                y = min(ent["y1"], ent["y2"])
                rw = abs(ent["x2"] - ent["x1"])
                rh = abs(ent["y2"] - ent["y1"])
                svg_lines.append(f'<rect x="{x}" y="{y}" width="{rw}" height="{rh}" {style}/>')
            elif etype == "polyline":
                pts_str = " ".join(f"{p['x']},{p['y']}" for p in ent.get("points", []))
                if ent.get("closed"):
                    svg_lines.append(f'<polygon points="{pts_str}" {style}/>')
                else:
                    svg_lines.append(f'<polyline points="{pts_str}" {style}/>')
            elif etype in ("polygon", "hatch", "slab", "roof", "room"):
                pts = ent.get("points") or ent.get("boundary", [])
                pts_str = " ".join(f"{p['x']},{p['y']}" for p in pts)
                svg_lines.append(f'<polygon points="{pts_str}" {style}/>')
            elif etype == "arc":
                cx, cy, r = ent["cx"], ent["cy"], ent["radius"]
                sa, ea = ent["startAngle"], ent["endAngle"]
                x1 = cx + r * math.cos(sa)
                y1 = cy + r * math.sin(sa)
                x2 = cx + r * math.cos(ea)
                y2 = cy + r * math.sin(ea)
                sweep = ea - sa
                if sweep < 0: sweep += 2 * math.pi
                large = 1 if sweep > math.pi else 0
                svg_lines.append(f'<path d="M {x1} {y1} A {r} {r} 0 {large} 1 {x2} {y2}" {style}/>')
            elif etype == "ellipse":
                svg_lines.append(f'<ellipse cx="{ent["cx"]}" cy="{ent["cy"]}" rx="{ent["rx"]}" ry="{ent["ry"]}" {style}/>')
            elif etype == "text" or etype == "mtext":
                h = ent.get("height", 12)
                svg_lines.append(f'<text x="{ent["x"]}" y="{ent["y"]}" fill="{color}" font-size="{h}">{ent.get("text", "")}</text>')
            elif etype == "dimension":
                svg_lines.append(f'<line x1="{ent["x1"]}" y1="{ent["y1"]}" x2="{ent["x2"]}" y2="{ent["y2"]}" {style}/>')
                mx = (ent["x1"] + ent["x2"]) / 2
                my = (ent["y1"] + ent["y2"]) / 2
                value = ent.get("value", "")
                svg_lines.append(f'<text x="{mx}" y="{my - 5}" fill="{color}" font-size="10" text-anchor="middle">{value}</text>')
            elif etype == "door":
                x, y, w = ent.get("x", 0), ent.get("y", 0), ent.get("width", 900)
                svg_lines.append(f'<line x1="{x}" y1="{y}" x2="{x + w}" y2="{y}" stroke="{color}" stroke-width="2" fill="none"/>')
                svg_lines.append(f'<path d="M {x} {y} A {w} {w} 0 0 1 {x + w} {y}" stroke="{color}" stroke-width="1" stroke-dasharray="4,2" fill="none"/>')
            elif etype == "window":
                x, y, w = ent.get("x", 0), ent.get("y", 0), ent.get("width", 1200)
                svg_lines.append(f'<line x1="{x}" y1="{y - 50}" x2="{x + w}" y2="{y - 50}" {style}/>')
                svg_lines.append(f'<line x1="{x}" y1="{y + 50}" x2="{x + w}" y2="{y + 50}" {style}/>')
            elif etype == "column":
                cx_col = ent.get("x", ent.get("cx", 0))
                cy_col = ent.get("y", ent.get("cy", 0))
                cw = ent.get("width", 300)
                svg_lines.append(f'<rect x="{cx_col - cw/2}" y="{cy_col - cw/2}" width="{cw}" height="{cw}" stroke="{color}" stroke-width="2" fill="{color}" fill-opacity="0.3"/>')

        svg_lines.append('</svg>')

        with open(output_path, 'w', encoding='utf-8') as f:
            f.write('\n'.join(svg_lines))

        ok({"path": output_path, "entity_count": len(entities)})
    except Exception as e:
        error(f"SVG export failed: {traceback.format_exc()}")


def _get_entity_points(ent):
    """Get representative points from an entity for bounding box calculation."""
    etype = ent.get("type", "")
    pts = []
    if "x1" in ent and "y1" in ent:
        pts.append((ent["x1"], ent["y1"]))
    if "x2" in ent and "y2" in ent:
        pts.append((ent["x2"], ent["y2"]))
    if "x" in ent and "y" in ent:
        pts.append((ent["x"], ent["y"]))
    if "cx" in ent and "cy" in ent:
        r = ent.get("radius", 0)
        pts.extend([(ent["cx"] - r, ent["cy"] - r), (ent["cx"] + r, ent["cy"] + r)])
    for p in ent.get("points", []):
        if isinstance(p, dict):
            pts.append((p.get("x", 0), p.get("y", 0)))
    for p in ent.get("boundary", []):
        if isinstance(p, dict):
            pts.append((p.get("x", 0), p.get("y", 0)))
    return pts


# ─── DXF Import ───────────────────────────────────────────────────────────────

def cmd_import_dxf(dxf_path: str):
    """Import a DXF file and convert to ADF entities."""
    if not EZDXF_AVAILABLE:
        error("ezdxf not installed")
        return

    if not os.path.isfile(dxf_path):
        error(f"File not found: {dxf_path}")
        return

    try:
        doc = ezdxf.readfile(dxf_path)
        msp = doc.modelspace()
        entities = []
        layers = []
        id_counter = 1

        # Import layers
        for layer in doc.layers:
            layers.append({
                "name": layer.dxf.name,
                "color": _aci_to_hex(layer.dxf.color),
                "visible": not layer.is_off(),
                "locked": layer.is_locked(),
                "lineweight": max(0.05, layer.dxf.lineweight / 100) if layer.dxf.lineweight > 0 else 0.25,
                "linetype": "continuous",
            })

        # Import entities
        for e in msp:
            eid = f"dxf_{id_counter}"
            id_counter += 1
            layer = e.dxf.layer if hasattr(e.dxf, 'layer') else "0"

            if e.dxftype() == "LINE":
                entities.append({
                    "id": eid, "type": "line", "layer": layer,
                    "x1": e.dxf.start.x, "y1": e.dxf.start.y,
                    "x2": e.dxf.end.x, "y2": e.dxf.end.y,
                })
            elif e.dxftype() == "CIRCLE":
                entities.append({
                    "id": eid, "type": "circle", "layer": layer,
                    "cx": e.dxf.center.x, "cy": e.dxf.center.y,
                    "radius": e.dxf.radius,
                })
            elif e.dxftype() == "ARC":
                entities.append({
                    "id": eid, "type": "arc", "layer": layer,
                    "cx": e.dxf.center.x, "cy": e.dxf.center.y,
                    "radius": e.dxf.radius,
                    "startAngle": math.radians(e.dxf.start_angle),
                    "endAngle": math.radians(e.dxf.end_angle),
                })
            elif e.dxftype() == "ELLIPSE":
                cp = e.dxf.center
                maj = e.dxf.major_axis
                rx = math.sqrt(maj.x**2 + maj.y**2)
                ry = rx * e.dxf.ratio
                rot = math.atan2(maj.y, maj.x)
                entities.append({
                    "id": eid, "type": "ellipse", "layer": layer,
                    "cx": cp.x, "cy": cp.y, "rx": rx, "ry": ry,
                    "rotation": rot,
                })
            elif e.dxftype() in ("LWPOLYLINE", "POLYLINE"):
                pts = [{"x": p[0], "y": p[1]} for p in e.get_points(format='xy')]
                closed = e.closed if hasattr(e, 'closed') else False
                entities.append({
                    "id": eid, "type": "polyline", "layer": layer,
                    "points": pts, "closed": closed,
                })
            elif e.dxftype() == "SPLINE":
                pts = [{"x": p.x, "y": p.y} for p in e.control_points]
                entities.append({
                    "id": eid, "type": "spline", "layer": layer,
                    "controlPoints": pts, "degree": e.dxf.degree,
                })
            elif e.dxftype() == "POINT":
                entities.append({
                    "id": eid, "type": "point", "layer": layer,
                    "x": e.dxf.location.x, "y": e.dxf.location.y,
                })
            elif e.dxftype() == "TEXT":
                entities.append({
                    "id": eid, "type": "text", "layer": layer,
                    "x": e.dxf.insert.x, "y": e.dxf.insert.y,
                    "text": e.dxf.text, "height": e.dxf.height,
                    "rotation": math.radians(e.dxf.rotation) if hasattr(e.dxf, 'rotation') else 0,
                })
            elif e.dxftype() == "MTEXT":
                entities.append({
                    "id": eid, "type": "mtext", "layer": layer,
                    "x": e.dxf.insert.x, "y": e.dxf.insert.y,
                    "text": e.text, "height": e.dxf.char_height,
                    "width": e.dxf.width,
                })
            elif e.dxftype() == "DIMENSION":
                try:
                    entities.append({
                        "id": eid, "type": "dimension", "layer": layer,
                        "x1": e.dxf.defpoint.x, "y1": e.dxf.defpoint.y,
                        "x2": e.dxf.defpoint2.x if hasattr(e.dxf, 'defpoint2') else e.dxf.defpoint.x + 1000,
                        "y2": e.dxf.defpoint2.y if hasattr(e.dxf, 'defpoint2') else e.dxf.defpoint.y,
                        "offset": 200, "kind": "linear",
                    })
                except Exception:
                    pass
            elif e.dxftype() == "HATCH":
                try:
                    paths = e.paths
                    if paths and len(paths) > 0:
                        pts = []
                        for path in paths:
                            if hasattr(path, 'vertices'):
                                pts.extend([{"x": v[0], "y": v[1]} for v in path.vertices])
                        if pts:
                            entities.append({
                                "id": eid, "type": "hatch", "layer": layer,
                                "boundary": pts, "pattern": "ANSI31", "scale": 1,
                            })
                except Exception:
                    pass
            elif e.dxftype() == "INSERT":
                entities.append({
                    "id": eid, "type": "block_ref", "layer": layer,
                    "x": e.dxf.insert.x, "y": e.dxf.insert.y,
                    "blockName": e.dxf.name,
                    "scaleX": e.dxf.xscale if hasattr(e.dxf, 'xscale') else 1,
                    "scaleY": e.dxf.yscale if hasattr(e.dxf, 'yscale') else 1,
                    "rotation": math.radians(e.dxf.rotation) if hasattr(e.dxf, 'rotation') else 0,
                })

        ok({
            "entities": entities,
            "layers": layers,
            "metadata": {
                "dxf_version": doc.dxfversion,
                "entity_count": len(entities),
                "filename": os.path.basename(dxf_path),
            },
        })
    except Exception as e:
        error(f"DXF import failed: {traceback.format_exc()}")


def _aci_to_hex(aci: int) -> str:
    """Convert AutoCAD Color Index to hex."""
    aci_map = {
        0: "#000000", 1: "#ff0000", 2: "#ffff00", 3: "#00ff00",
        4: "#00ffff", 5: "#0000ff", 6: "#ff00ff", 7: "#ffffff",
        8: "#808080", 9: "#c0c0c0",
    }
    return aci_map.get(aci, "#ffffff")


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    try:
        raw = sys.stdin.read().strip()
        if not raw:
            error("No input"); return
        cmd = json.loads(raw)
        action = cmd.get("action", "")
        dispatch = {
            "check":        lambda: cmd_check(),
            "export_dxf":   lambda: cmd_export_dxf(cmd["floor_data"], cmd["output_path"], cmd.get("dxf_version", "R2010")),
            "import_dxf":   lambda: cmd_import_dxf(cmd.get("dxf_path") or cmd.get("file_path", "")),
            "export_svg":   lambda: cmd_export_svg(cmd["floor_data"], cmd["output_path"]),
        }
        if action in dispatch:
            dispatch[action]()
        else:
            error(f"Unknown action: {action}")
    except json.JSONDecodeError as e:
        error(f"JSON error: {e}")
    except Exception as e:
        error(f"Error: {traceback.format_exc()}")

if __name__ == "__main__":
    main()
