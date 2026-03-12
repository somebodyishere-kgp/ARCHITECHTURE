#!/usr/bin/env python3
"""
ArchFlow ↔ IFCOpenShell Bridge
================================
Full IFC (Industry Foundation Classes) support for reading, writing,
validating, and querying BIM models using ifcopenshell.

Install:  pip install ifcopenshell lark-parser
"""

import sys
import json
import os
import traceback
import math
import uuid
import datetime

try:
    import ifcopenshell
    import ifcopenshell.util.element
    import ifcopenshell.util.placement
    import ifcopenshell.util.shape
    import ifcopenshell.util.unit
    IFC_AVAILABLE = True
except ImportError:
    IFC_AVAILABLE = False

try:
    import ifcopenshell.geom
    IFC_GEOM_AVAILABLE = True
except ImportError:
    IFC_GEOM_AVAILABLE = False

try:
    import ifcopenshell.validate
    IFC_VALIDATE_AVAILABLE = True
except ImportError:
    IFC_VALIDATE_AVAILABLE = False

# ─── IO helpers ───────────────────────────────────────────────────────────────

def respond(data: dict):
    print(json.dumps(data), flush=True)

def error(msg: str):
    respond({"ok": False, "error": msg})

def ok(data: dict = {}):
    respond({"ok": True, **data})

# ─── IFC → ADF converter ─────────────────────────────────────────────────────

def _ifc_type_to_adf_type(ifc_class: str) -> str:
    """Map IFC class names to ADF entity types."""
    mapping = {
        "IfcWall": "wall",
        "IfcWallStandardCase": "wall",
        "IfcDoor": "door",
        "IfcWindow": "window",
        "IfcColumn": "column",
        "IfcBeam": "beam",
        "IfcSlab": "slab",
        "IfcRoof": "roof",
        "IfcStair": "stair",
        "IfcStairFlight": "stair",
        "IfcRamp": "ramp",
        "IfcRampFlight": "ramp",
        "IfcRailing": "railing",
        "IfcCurtainWall": "curtainwall",
        "IfcCovering": "ceiling",
        "IfcSpace": "room",
        "IfcOpeningElement": "opening",
        "IfcFooting": "footing",
        "IfcPile": "pile",
        "IfcMember": "structural_member",
        "IfcPlate": "slab",
        "IfcPipeSegment": "pipe",
        "IfcDuctSegment": "duct",
        "IfcCableCarrierSegment": "cable_tray",
        "IfcCableSegment": "conduit",
        "IfcFlowTerminal": "diffuser",
        "IfcFlowController": "valve",
        "IfcFlowMovingDevice": "pump",
        "IfcFlowStorageDevice": "pipe",
        "IfcFlowFitting": "pipe",
        "IfcFurniture": "furniture",
        "IfcFurnishingElement": "furniture",
        "IfcSanitaryTerminal": "fixture",
        "IfcBuildingElementProxy": "block_ref",
    }
    return mapping.get(ifc_class, "block_ref")


def _get_placement_coords(element):
    """Extract (x, y, z) placement from an IFC element."""
    try:
        matrix = ifcopenshell.util.placement.get_local_placement(element.ObjectPlacement)
        return float(matrix[0][3]), float(matrix[1][3]), float(matrix[2][3])
    except Exception:
        return 0.0, 0.0, 0.0


def _extract_psets(element) -> dict:
    """Extract all property sets (Pset) for an element into a flat dict."""
    props = {}
    try:
        psets = ifcopenshell.util.element.get_psets(element)
        for pset_name, pset_vals in psets.items():
            for key, val in pset_vals.items():
                if key == "id":
                    continue
                props[f"{pset_name}.{key}"] = val
    except Exception:
        pass
    return props


def _extract_quantities(element) -> dict:
    """Extract base quantities (area, volume, length, width, height)."""
    qto = {}
    try:
        psets = ifcopenshell.util.element.get_psets(element)
        for pset_name, pset_vals in psets.items():
            if "Qto" in pset_name or "BaseQuantities" in pset_name:
                for key, val in pset_vals.items():
                    if key == "id":
                        continue
                    qto[key] = val
    except Exception:
        pass
    return qto

# ─── Command handlers ─────────────────────────────────────────────────────────

def cmd_check():
    """Check ifcopenshell availability."""
    if not IFC_AVAILABLE:
        error("ifcopenshell not installed. Run: pip install ifcopenshell")
        return
    ok({
        "ifcopenshell_version": ifcopenshell.version,
        "geometry_engine": IFC_GEOM_AVAILABLE,
        "validation": IFC_VALIDATE_AVAILABLE,
    })


def cmd_import_ifc(file_path: str):
    """
    Import an IFC file and convert all elements to ADF entities.
    Returns { entities, layers, metadata, spatial_tree }.
    """
    if not IFC_AVAILABLE:
        error("ifcopenshell not installed")
        return

    if not os.path.isfile(file_path):
        error(f"File not found: {file_path}")
        return

    try:
        ifc = ifcopenshell.open(file_path)
    except Exception as e:
        error(f"Failed to open IFC: {e}")
        return

    schema = ifc.schema
    project = ifc.by_type("IfcProject")
    project_name = project[0].Name if project else "Unnamed"

    # Unit detection
    length_unit = "mm"
    try:
        units = ifcopenshell.util.unit.get_project_unit(ifc, "LENGTHUNIT")
        if units:
            prefix = getattr(units, "Prefix", None)
            if prefix == "MILLI":
                length_unit = "mm"
            elif prefix == "CENTI":
                length_unit = "cm"
            else:
                length_unit = "m"
    except Exception:
        pass

    # Scale to mm
    scale = {"mm": 1.0, "cm": 10.0, "m": 1000.0}.get(length_unit, 1.0)

    # ── Spatial decomposition ────────────────────────────────────────────
    spatial_tree = []
    for site in ifc.by_type("IfcSite"):
        site_node = {"type": "site", "name": site.Name or "Site", "children": []}
        for building in getattr(site, "IsDecomposedBy", []):
            for bldg in building.RelatedObjects:
                if bldg.is_a("IfcBuilding"):
                    bldg_node = {"type": "building", "name": bldg.Name or "Building", "children": []}
                    for storey_rel in getattr(bldg, "IsDecomposedBy", []):
                        for storey in storey_rel.RelatedObjects:
                            if storey.is_a("IfcBuildingStorey"):
                                elev = getattr(storey, "Elevation", 0) or 0
                                bldg_node["children"].append({
                                    "type": "storey",
                                    "name": storey.Name or "Storey",
                                    "elevation": float(elev) * scale,
                                })
                    site_node["children"].append(bldg_node)
        spatial_tree.append(site_node)

    # ── Convert elements to ADF entities ─────────────────────────────────
    entities = []
    layer_names = set()
    element_types = [
        "IfcWall", "IfcWallStandardCase", "IfcDoor", "IfcWindow",
        "IfcColumn", "IfcBeam", "IfcSlab", "IfcRoof", "IfcStair",
        "IfcStairFlight", "IfcRamp", "IfcRampFlight", "IfcRailing",
        "IfcCurtainWall", "IfcCovering", "IfcSpace", "IfcFooting",
        "IfcPile", "IfcMember", "IfcPlate", "IfcPipeSegment",
        "IfcDuctSegment", "IfcCableCarrierSegment", "IfcCableSegment",
        "IfcFurniture", "IfcFurnishingElement", "IfcSanitaryTerminal",
        "IfcFlowTerminal", "IfcFlowController", "IfcFlowMovingDevice",
        "IfcBuildingElementProxy", "IfcOpeningElement",
    ]

    for ifc_type in element_types:
        for elem in ifc.by_type(ifc_type):
            adf_type = _ifc_type_to_adf_type(ifc_type)
            x, y, z = _get_placement_coords(elem)
            x *= scale
            y *= scale
            z *= scale

            layer = adf_type.capitalize() + "s"
            layer_names.add(layer)

            entity = {
                "id": f"ifc_{elem.GlobalId}",
                "type": adf_type,
                "layer": layer,
                "ifc_guid": elem.GlobalId,
                "ifc_class": ifc_type,
                "name": elem.Name or "",
                "description": elem.Description or "",
            }

            # Type-specific geometry
            if adf_type == "wall":
                # Try to extract wall axis line
                entity["x1"] = x
                entity["y1"] = y
                entity["x2"] = x + 1000 * scale  # default if not determinable
                entity["y2"] = y
                entity["thickness"] = 200
                entity["height"] = 3000
                qto = _extract_quantities(elem)
                if "Length" in qto:
                    entity["x2"] = x + float(qto["Length"]) * scale
                if "Width" in qto:
                    entity["thickness"] = float(qto["Width"]) * scale
                if "Height" in qto:
                    entity["height"] = float(qto["Height"]) * scale

            elif adf_type == "door":
                entity["x"] = x
                entity["y"] = y
                entity["width"] = 900
                entity["swing"] = 90
                qto = _extract_quantities(elem)
                if "Width" in qto:
                    entity["width"] = float(qto["Width"]) * scale

            elif adf_type == "window":
                entity["x"] = x
                entity["y"] = y
                entity["width"] = 1200
                entity["sillHeight"] = 900
                qto = _extract_quantities(elem)
                if "Width" in qto:
                    entity["width"] = float(qto["Width"]) * scale

            elif adf_type == "column":
                entity["cx"] = x
                entity["cy"] = y
                entity["width"] = 300
                entity["depth"] = 300
                entity["height"] = 3000
                entity["shape"] = "rectangular"

            elif adf_type == "beam":
                entity["x1"] = x
                entity["y1"] = y
                entity["x2"] = x + 3000
                entity["y2"] = y
                entity["width"] = 200
                entity["depth"] = 400

            elif adf_type == "slab":
                entity["points"] = [
                    {"x": x, "y": y},
                    {"x": x + 5000, "y": y},
                    {"x": x + 5000, "y": y + 5000},
                    {"x": x, "y": y + 5000},
                ]
                entity["thickness"] = 200

            elif adf_type == "room":
                entity["boundary"] = [
                    {"x": x, "y": y},
                    {"x": x + 4000, "y": y},
                    {"x": x + 4000, "y": y + 3000},
                    {"x": x, "y": y + 3000},
                ]
                entity["name"] = elem.LongName or elem.Name or "Room"

            elif adf_type in ("pipe", "duct", "conduit", "cable_tray"):
                entity["startX"] = x
                entity["startY"] = y
                entity["endX"] = x + 2000
                entity["endY"] = y
                entity["diameter"] = 100 if adf_type == "pipe" else 300

            elif adf_type == "stair":
                entity["x"] = x
                entity["y"] = y
                entity["width"] = 1200
                entity["length"] = 3000
                entity["risers"] = 16
                entity["direction"] = 0

            elif adf_type == "furniture":
                entity["x"] = x
                entity["y"] = y
                entity["width"] = 800
                entity["depth"] = 600
                entity["rotation"] = 0
                entity["name"] = elem.Name or "Furniture"

            elif adf_type == "fixture":
                entity["x"] = x
                entity["y"] = y
                entity["width"] = 600
                entity["depth"] = 400
                entity["rotation"] = 0
                entity["name"] = elem.Name or "Fixture"

            else:
                entity["x"] = x
                entity["y"] = y

            # Attach all property sets
            entity["properties"] = _extract_psets(elem)

            entities.append(entity)

    # Build layers
    layers = []
    color_palette = [
        "#ffffff", "#4a9eff", "#7dd3fc", "#f97316", "#a855f7",
        "#22c55e", "#ef4444", "#eab308", "#06b6d4", "#ec4899",
    ]
    for i, name in enumerate(sorted(layer_names)):
        layers.append({
            "name": name,
            "color": color_palette[i % len(color_palette)],
            "visible": True,
            "locked": False,
            "lineweight": 0.25,
            "linetype": "continuous",
        })

    ok({
        "entities": entities,
        "layers": layers,
        "metadata": {
            "schema": schema,
            "project": project_name,
            "unit": length_unit,
            "element_count": len(entities),
        },
        "spatial_tree": spatial_tree,
    })


def cmd_export_ifc(floor_data: dict, output_path: str, schema: str = "IFC4"):
    """
    Export ADF floor data to an IFC file.
    Supports IFC2X3 and IFC4 schemas.
    """
    if not IFC_AVAILABLE:
        error("ifcopenshell not installed")
        return

    try:
        ifc = ifcopenshell.file(schema=schema)

        # ── Boilerplate: Owner, Application, Project, Site, Building, Storey ──
        owner_history = _create_owner_history(ifc)
        project = ifc.createIfcProject(
            ifcopenshell.guid.new(),
            owner_history,
            floor_data.get("project_name", "ArchFlow Project"),
        )

        # Length unit = millimetres
        length_unit = ifc.createIfcSIUnit(None, "LENGTHUNIT", "MILLI", "METRE")
        area_unit = ifc.createIfcSIUnit(None, "AREAUNIT", None, "SQUARE_METRE")
        volume_unit = ifc.createIfcSIUnit(None, "VOLUMEUNIT", None, "CUBIC_METRE")
        angle_unit = ifc.createIfcSIUnit(None, "PLANEANGLEUNIT", None, "RADIAN")
        unit_assignment = ifc.createIfcUnitAssignment([length_unit, area_unit, volume_unit, angle_unit])
        project.UnitsInContext = unit_assignment

        # Geometric context
        axis2d = ifc.createIfcAxis2Placement3D(
            ifc.createIfcCartesianPoint((0.0, 0.0, 0.0)), None, None
        )
        context = ifc.createIfcGeometricRepresentationContext(
            None, "Model", 3, 1.0E-05, axis2d, None
        )
        project.RepresentationContexts = [context]

        # Spatial structure
        site_placement = _create_local_placement(ifc)
        site = ifc.createIfcSite(
            ifcopenshell.guid.new(), owner_history, "Site", None, None,
            site_placement, None, None, "ELEMENT", None, None, None, None, None
        )

        building_placement = _create_local_placement(ifc, relative_to=site_placement)
        building = ifc.createIfcBuilding(
            ifcopenshell.guid.new(), owner_history, "Building", None, None,
            building_placement, None, None, "ELEMENT", None, None, None
        )

        floor_elev = floor_data.get("floor_elevation", 0.0)
        storey_placement = _create_local_placement(ifc, z=floor_elev, relative_to=building_placement)
        storey = ifc.createIfcBuildingStorey(
            ifcopenshell.guid.new(), owner_history,
            floor_data.get("floor_name", "Ground Floor"),
            None, None, storey_placement, None, None, "ELEMENT", floor_elev
        )

        # Aggregate spatial structure
        ifc.createIfcRelAggregates(ifcopenshell.guid.new(), owner_history, None, None, project, [site])
        ifc.createIfcRelAggregates(ifcopenshell.guid.new(), owner_history, None, None, site, [building])
        ifc.createIfcRelAggregates(ifcopenshell.guid.new(), owner_history, None, None, building, [storey])

        # ── Export entities ───────────────────────────────────────────────
        products = []
        entities = floor_data.get("entities", [])

        for ent in entities:
            etype = ent.get("type", "")
            product = None

            if etype == "wall":
                product = _export_wall(ifc, ent, owner_history, context, storey_placement)
            elif etype == "door":
                product = _export_door(ifc, ent, owner_history, context, storey_placement)
            elif etype == "window":
                product = _export_window(ifc, ent, owner_history, context, storey_placement)
            elif etype == "column":
                product = _export_column(ifc, ent, owner_history, context, storey_placement)
            elif etype == "slab":
                product = _export_slab(ifc, ent, owner_history, context, storey_placement)
            elif etype == "beam":
                product = _export_beam(ifc, ent, owner_history, context, storey_placement)
            elif etype == "stair":
                product = _export_stair(ifc, ent, owner_history, context, storey_placement)
            elif etype == "room":
                product = _export_space(ifc, ent, owner_history, context, storey_placement)
            elif etype in ("pipe", "duct"):
                product = _export_mep_segment(ifc, ent, owner_history, context, storey_placement)
            elif etype == "furniture":
                product = _export_furniture(ifc, ent, owner_history, context, storey_placement)
            elif etype == "fixture":
                product = _export_fixture(ifc, ent, owner_history, context, storey_placement)

            if product:
                products.append(product)

        # Contain all products in the storey
        if products:
            ifc.createIfcRelContainedInSpatialStructure(
                ifcopenshell.guid.new(), owner_history,
                None, None, products, storey
            )

        ifc.write(output_path)
        ok({
            "path": output_path,
            "schema": schema,
            "element_count": len(products),
        })

    except Exception as e:
        error(f"IFC export failed: {traceback.format_exc()}")


def cmd_validate_ifc(file_path: str):
    """Validate an IFC file and return issues found."""
    if not IFC_AVAILABLE:
        error("ifcopenshell not installed")
        return
    if not os.path.isfile(file_path):
        error(f"File not found: {file_path}")
        return

    try:
        ifc = ifcopenshell.open(file_path)
        issues = []

        if IFC_VALIDATE_AVAILABLE:
            logger = ifcopenshell.validate.json_logger()
            ifcopenshell.validate.validate(ifc, logger)
            issues = logger.statements
        else:
            # Basic validation
            for elem in ifc.by_type("IfcRoot"):
                if not elem.GlobalId:
                    issues.append({"severity": "error", "message": f"Element #{elem.id()} missing GlobalId"})
                if not elem.Name:
                    issues.append({"severity": "warning", "message": f"Element #{elem.id()} ({elem.is_a()}) missing Name"})

        ok({
            "valid": len([i for i in issues if i.get("severity") == "error"]) == 0,
            "issue_count": len(issues),
            "issues": issues[:100],  # limit output
        })
    except Exception as e:
        error(f"Validation failed: {traceback.format_exc()}")


def cmd_quantity_takeoff(file_path: str, element_types: list = None):
    """
    Perform quantity takeoff from an IFC file.
    Returns grouped quantities by element type.
    """
    if not IFC_AVAILABLE:
        error("ifcopenshell not installed")
        return
    if not os.path.isfile(file_path):
        error(f"File not found: {file_path}")
        return

    try:
        ifc = ifcopenshell.open(file_path)
        takeoff = {}

        types_to_check = element_types or [
            "IfcWall", "IfcWallStandardCase", "IfcSlab", "IfcColumn",
            "IfcBeam", "IfcDoor", "IfcWindow", "IfcStair", "IfcRoof",
            "IfcFooting", "IfcPile", "IfcRailing", "IfcCurtainWall",
            "IfcPipeSegment", "IfcDuctSegment", "IfcSpace",
        ]

        for ifc_type in types_to_check:
            elements = ifc.by_type(ifc_type)
            if not elements:
                continue

            category = {"count": len(elements), "items": []}
            total_area = 0.0
            total_volume = 0.0
            total_length = 0.0

            for elem in elements:
                qto = _extract_quantities(elem)
                item = {
                    "guid": elem.GlobalId,
                    "name": elem.Name or "",
                    "quantities": qto,
                }
                area = qto.get("NetSideArea", qto.get("GrossArea", qto.get("NetArea", 0)))
                volume = qto.get("NetVolume", qto.get("GrossVolume", 0))
                length = qto.get("Length", 0)
                total_area += float(area) if area else 0
                total_volume += float(volume) if volume else 0
                total_length += float(length) if length else 0
                category["items"].append(item)

            category["totals"] = {
                "area": round(total_area, 3),
                "volume": round(total_volume, 6),
                "length": round(total_length, 3),
            }
            takeoff[ifc_type] = category

        ok({"takeoff": takeoff})
    except Exception as e:
        error(f"Quantity takeoff failed: {traceback.format_exc()}")


def cmd_spatial_query(file_path: str, query_type: str, params: dict = None):
    """
    Query spatial data from IFC: storeys, rooms, adjacency, containment.
    """
    if not IFC_AVAILABLE:
        error("ifcopenshell not installed")
        return

    try:
        ifc = ifcopenshell.open(file_path)
        params = params or {}

        if query_type == "storeys":
            storeys = []
            for s in ifc.by_type("IfcBuildingStorey"):
                contained = []
                for rel in getattr(s, "ContainsElements", []):
                    for elem in rel.RelatedElements:
                        contained.append({
                            "guid": elem.GlobalId,
                            "type": elem.is_a(),
                            "name": elem.Name or "",
                        })
                storeys.append({
                    "guid": s.GlobalId,
                    "name": s.Name or "",
                    "elevation": float(s.Elevation or 0),
                    "element_count": len(contained),
                    "elements": contained[:50],
                })
            ok({"storeys": storeys})

        elif query_type == "rooms":
            rooms = []
            for space in ifc.by_type("IfcSpace"):
                psets = _extract_psets(space)
                rooms.append({
                    "guid": space.GlobalId,
                    "name": space.Name or "",
                    "long_name": space.LongName or "",
                    "properties": psets,
                })
            ok({"rooms": rooms})

        elif query_type == "element_by_guid":
            guid = params.get("guid", "")
            elem = ifc.by_guid(guid)
            if elem:
                ok({
                    "guid": elem.GlobalId,
                    "type": elem.is_a(),
                    "name": elem.Name or "",
                    "properties": _extract_psets(elem),
                    "quantities": _extract_quantities(elem),
                })
            else:
                error(f"Element not found: {guid}")

        elif query_type == "summary":
            summary = {}
            for elem in ifc.by_type("IfcProduct"):
                t = elem.is_a()
                summary[t] = summary.get(t, 0) + 1
            ok({"summary": summary, "total": sum(summary.values())})

        elif query_type == "materials":
            materials = {}
            for rel in ifc.by_type("IfcRelAssociatesMaterial"):
                mat = rel.RelatingMaterial
                mat_name = getattr(mat, "Name", None) or str(mat.is_a())
                if mat_name not in materials:
                    materials[mat_name] = {"count": 0, "elements": []}
                for obj in rel.RelatedObjects:
                    materials[mat_name]["count"] += 1
                    if len(materials[mat_name]["elements"]) < 10:
                        materials[mat_name]["elements"].append({
                            "guid": obj.GlobalId,
                            "type": obj.is_a(),
                            "name": obj.Name or "",
                        })
            ok({"materials": materials})

        elif query_type == "classifications":
            classifications = []
            for rel in ifc.by_type("IfcRelAssociatesClassification"):
                ref = rel.RelatingClassification
                for obj in rel.RelatedObjects:
                    classifications.append({
                        "element_guid": obj.GlobalId,
                        "element_type": obj.is_a(),
                        "system": getattr(ref, "ReferencedSource", {}).Name if hasattr(ref, "ReferencedSource") and ref.ReferencedSource else "",
                        "code": getattr(ref, "Identification", "") or getattr(ref, "ItemReference", ""),
                        "name": getattr(ref, "Name", ""),
                    })
            ok({"classifications": classifications})

        else:
            error(f"Unknown query type: {query_type}")

    except Exception as e:
        error(f"Spatial query failed: {traceback.format_exc()}")


def cmd_diff_ifc(file_a: str, file_b: str):
    """
    Compare two IFC files and return added, removed, and modified elements.
    """
    if not IFC_AVAILABLE:
        error("ifcopenshell not installed")
        return

    try:
        ifc_a = ifcopenshell.open(file_a)
        ifc_b = ifcopenshell.open(file_b)

        guids_a = {e.GlobalId: e for e in ifc_a.by_type("IfcProduct")}
        guids_b = {e.GlobalId: e for e in ifc_b.by_type("IfcProduct")}

        added = []
        removed = []
        modified = []

        for guid in guids_b:
            if guid not in guids_a:
                elem = guids_b[guid]
                added.append({"guid": guid, "type": elem.is_a(), "name": elem.Name or ""})

        for guid in guids_a:
            if guid not in guids_b:
                elem = guids_a[guid]
                removed.append({"guid": guid, "type": elem.is_a(), "name": elem.Name or ""})

        for guid in guids_a:
            if guid in guids_b:
                a, b = guids_a[guid], guids_b[guid]
                changes = []
                if a.is_a() != b.is_a():
                    changes.append({"field": "type", "old": a.is_a(), "new": b.is_a()})
                if (a.Name or "") != (b.Name or ""):
                    changes.append({"field": "name", "old": a.Name or "", "new": b.Name or ""})
                if changes:
                    modified.append({"guid": guid, "changes": changes})

        ok({
            "added": added,
            "removed": removed,
            "modified": modified,
            "summary": {
                "added": len(added),
                "removed": len(removed),
                "modified": len(modified),
            },
        })
    except Exception as e:
        error(f"IFC diff failed: {traceback.format_exc()}")


def cmd_clash_detection(file_path: str, type_a: str = "IfcWall", type_b: str = "IfcPipeSegment", tolerance: float = 0.0):
    """
    Basic clash detection between two element types using bounding boxes.
    For production use, use ifcopenshell.geom for precise geometry.
    """
    if not IFC_AVAILABLE:
        error("ifcopenshell not installed")
        return

    try:
        ifc = ifcopenshell.open(file_path)
        elements_a = ifc.by_type(type_a)
        elements_b = ifc.by_type(type_b)

        clashes = []

        for ea in elements_a:
            xa, ya, za = _get_placement_coords(ea)
            qa = _extract_quantities(ea)
            la = float(qa.get("Length", 1000))
            wa = float(qa.get("Width", 200))
            ha = float(qa.get("Height", 3000))

            for eb in elements_b:
                xb, yb, zb = _get_placement_coords(eb)
                qb = _extract_quantities(eb)
                lb = float(qb.get("Length", 1000))
                wb = float(qb.get("Width", 200))
                hb = float(qb.get("Height", 3000))

                # AABB overlap check
                if (xa - tolerance < xb + lb and xa + la + tolerance > xb and
                    ya - tolerance < yb + wb and ya + wa + tolerance > yb and
                    za - tolerance < zb + hb and za + ha + tolerance > zb):
                    clashes.append({
                        "element_a": {"guid": ea.GlobalId, "type": ea.is_a(), "name": ea.Name or ""},
                        "element_b": {"guid": eb.GlobalId, "type": eb.is_a(), "name": eb.Name or ""},
                    })

        ok({"clashes": clashes, "count": len(clashes)})
    except Exception as e:
        error(f"Clash detection failed: {traceback.format_exc()}")


# ─── IFC export helpers ──────────────────────────────────────────────────────

def _create_owner_history(ifc):
    person = ifc.createIfcPerson(None, "User", None, None, None, None, None, None)
    org = ifc.createIfcOrganization(None, "ArchFlow", None, None, None)
    person_org = ifc.createIfcPersonAndOrganization(person, org, None)
    app = ifc.createIfcApplication(org, "1.0", "ArchFlow", "ArchFlow")
    return ifc.createIfcOwnerHistory(
        person_org, app, None, "READWRITE", None, None, None,
        int(datetime.datetime.now().timestamp())
    )


def _create_local_placement(ifc, x=0.0, y=0.0, z=0.0, relative_to=None):
    point = ifc.createIfcCartesianPoint((float(x), float(y), float(z)))
    axis2 = ifc.createIfcAxis2Placement3D(point, None, None)
    return ifc.createIfcLocalPlacement(relative_to, axis2)


def _create_extrusion(ifc, context, points_2d, height):
    """Create a swept solid (extrusion) from 2D points."""
    ifc_points = [ifc.createIfcCartesianPoint(p) for p in points_2d]
    ifc_points.append(ifc_points[0])  # close the loop
    polyline = ifc.createIfcPolyline(ifc_points)
    profile = ifc.createIfcArbitraryClosedProfileDef("AREA", None, polyline)
    direction = ifc.createIfcDirection((0.0, 0.0, 1.0))
    solid = ifc.createIfcExtrudedAreaSolid(profile, None, direction, float(height))
    shape = ifc.createIfcShapeRepresentation(context, "Body", "SweptSolid", [solid])
    return ifc.createIfcProductDefinitionShape(None, None, [shape])


def _export_wall(ifc, ent, oh, ctx, parent_placement):
    x1 = ent.get("x1", 0)
    y1 = ent.get("y1", 0)
    x2 = ent.get("x2", 0)
    y2 = ent.get("y2", 0)
    thickness = ent.get("thickness", 200)
    height = ent.get("height", 3000)

    dx = x2 - x1
    dy = y2 - y1
    length = math.sqrt(dx * dx + dy * dy)
    if length < 1:
        return None

    nx = -dy / length * thickness / 2
    ny = dx / length * thickness / 2

    pts = [
        (x1 + nx, y1 + ny),
        (x2 + nx, y2 + ny),
        (x2 - nx, y2 - ny),
        (x1 - nx, y1 - ny),
    ]

    placement = _create_local_placement(ifc, relative_to=parent_placement)
    shape = _create_extrusion(ifc, ctx, pts, height)

    return ifc.createIfcWall(
        ifcopenshell.guid.new(), oh, ent.get("name", "Wall"),
        None, None, placement, shape, None
    )


def _export_door(ifc, ent, oh, ctx, parent_placement):
    x = ent.get("x", 0)
    y = ent.get("y", 0)
    w = ent.get("width", 900)
    h = 2100  # standard door height

    pts = [(x, y), (x + w, y), (x + w, y + 100), (x, y + 100)]
    placement = _create_local_placement(ifc, relative_to=parent_placement)
    shape = _create_extrusion(ifc, ctx, pts, h)

    return ifc.createIfcDoor(
        ifcopenshell.guid.new(), oh, "Door",
        None, None, placement, shape, None, float(h), float(w)
    )


def _export_window(ifc, ent, oh, ctx, parent_placement):
    x = ent.get("x", 0)
    y = ent.get("y", 0)
    w = ent.get("width", 1200)
    h = 1200
    sill = ent.get("sillHeight", 900)

    pts = [(x, y), (x + w, y), (x + w, y + 50), (x, y + 50)]
    placement = _create_local_placement(ifc, z=sill, relative_to=parent_placement)
    shape = _create_extrusion(ifc, ctx, pts, h)

    return ifc.createIfcWindow(
        ifcopenshell.guid.new(), oh, "Window",
        None, None, placement, shape, None, float(h), float(w)
    )


def _export_column(ifc, ent, oh, ctx, parent_placement):
    cx = ent.get("cx", 0)
    cy = ent.get("cy", 0)
    w = ent.get("width", 300) / 2
    d = ent.get("depth", 300) / 2
    h = ent.get("height", 3000)

    pts = [(cx - w, cy - d), (cx + w, cy - d), (cx + w, cy + d), (cx - w, cy + d)]
    placement = _create_local_placement(ifc, relative_to=parent_placement)
    shape = _create_extrusion(ifc, ctx, pts, h)

    return ifc.createIfcColumn(
        ifcopenshell.guid.new(), oh, "Column",
        None, None, placement, shape, None
    )


def _export_slab(ifc, ent, oh, ctx, parent_placement):
    points = ent.get("points", [])
    thickness = ent.get("thickness", 200)
    if len(points) < 3:
        return None

    pts = [(p["x"], p["y"]) for p in points]
    placement = _create_local_placement(ifc, relative_to=parent_placement)
    shape = _create_extrusion(ifc, ctx, pts, thickness)

    return ifc.createIfcSlab(
        ifcopenshell.guid.new(), oh, "Slab",
        None, None, placement, shape, None
    )


def _export_beam(ifc, ent, oh, ctx, parent_placement):
    x1 = ent.get("x1", 0)
    y1 = ent.get("y1", 0)
    x2 = ent.get("x2", 0)
    y2 = ent.get("y2", 0)
    w = ent.get("width", 200)
    d = ent.get("depth", 400)

    dx = x2 - x1
    dy = y2 - y1
    length = math.sqrt(dx * dx + dy * dy)
    if length < 1:
        return None

    nx = -dy / length * w / 2
    ny = dx / length * w / 2

    pts = [
        (x1 + nx, y1 + ny),
        (x2 + nx, y2 + ny),
        (x2 - nx, y2 - ny),
        (x1 - nx, y1 - ny),
    ]

    placement = _create_local_placement(ifc, relative_to=parent_placement)
    shape = _create_extrusion(ifc, ctx, pts, d)

    return ifc.createIfcBeam(
        ifcopenshell.guid.new(), oh, "Beam",
        None, None, placement, shape, None
    )


def _export_stair(ifc, ent, oh, ctx, parent_placement):
    x = ent.get("x", 0)
    y = ent.get("y", 0)
    w = ent.get("width", 1200)
    length = ent.get("length", 3000)
    h = 3000

    pts = [(x, y), (x + w, y), (x + w, y + length), (x, y + length)]
    placement = _create_local_placement(ifc, relative_to=parent_placement)
    shape = _create_extrusion(ifc, ctx, pts, h)

    return ifc.createIfcStair(
        ifcopenshell.guid.new(), oh, "Stair",
        None, None, placement, shape, None
    )


def _export_space(ifc, ent, oh, ctx, parent_placement):
    boundary = ent.get("boundary", [])
    if len(boundary) < 3:
        return None

    pts = [(p["x"], p["y"]) for p in boundary]
    placement = _create_local_placement(ifc, relative_to=parent_placement)
    shape = _create_extrusion(ifc, ctx, pts, 3000)

    return ifc.createIfcSpace(
        ifcopenshell.guid.new(), oh,
        ent.get("name", "Room"),
        None, None, placement, shape, None, "ELEMENT"
    )


def _export_mep_segment(ifc, ent, oh, ctx, parent_placement):
    sx = ent.get("startX", 0)
    sy = ent.get("startY", 0)
    ex = ent.get("endX", 0)
    ey = ent.get("endY", 0)
    d = ent.get("diameter", 100) / 2

    dx = ex - sx
    dy = ey - sy
    length = math.sqrt(dx * dx + dy * dy)
    if length < 1:
        return None

    nx = -dy / length * d
    ny = dx / length * d

    pts = [
        (sx + nx, sy + ny),
        (ex + nx, ey + ny),
        (ex - nx, ey - ny),
        (sx - nx, sy - ny),
    ]

    placement = _create_local_placement(ifc, relative_to=parent_placement)
    shape = _create_extrusion(ifc, ctx, pts, d * 2)

    etype = ent.get("type", "pipe")
    if etype == "duct":
        return ifc.createIfcDuctSegment(
            ifcopenshell.guid.new(), oh, "Duct",
            None, None, placement, shape, None
        )
    else:
        return ifc.createIfcPipeSegment(
            ifcopenshell.guid.new(), oh, "Pipe",
            None, None, placement, shape, None
        )


def _export_furniture(ifc, ent, oh, ctx, parent_placement):
    x = ent.get("x", 0)
    y = ent.get("y", 0)
    w = ent.get("width", 800)
    d = ent.get("depth", 600)

    pts = [(x, y), (x + w, y), (x + w, y + d), (x, y + d)]
    placement = _create_local_placement(ifc, relative_to=parent_placement)
    shape = _create_extrusion(ifc, ctx, pts, 800)

    return ifc.createIfcFurnishingElement(
        ifcopenshell.guid.new(), oh,
        ent.get("name", "Furniture"),
        None, None, placement, shape, None
    )


def _export_fixture(ifc, ent, oh, ctx, parent_placement):
    x = ent.get("x", 0)
    y = ent.get("y", 0)
    w = ent.get("width", 600)
    d = ent.get("depth", 400)

    pts = [(x, y), (x + w, y), (x + w, y + d), (x, y + d)]
    placement = _create_local_placement(ifc, relative_to=parent_placement)
    shape = _create_extrusion(ifc, ctx, pts, 900)

    return ifc.createIfcSanitaryTerminal(
        ifcopenshell.guid.new(), oh,
        ent.get("name", "Fixture"),
        None, None, placement, shape, None
    )


# ─── Dispatcher ──────────────────────────────────────────────────────────────

def main():
    raw = sys.stdin.read()
    try:
        cmd = json.loads(raw)
    except json.JSONDecodeError as e:
        error(f"Invalid JSON input: {e}")
        return

    action = cmd.get("action", "")

    if action == "check":
        cmd_check()
    elif action == "import_ifc":
        cmd_import_ifc(cmd["file_path"])
    elif action == "export_ifc":
        cmd_export_ifc(cmd["floor_data"], cmd["output_path"], cmd.get("schema", "IFC4"))
    elif action == "validate_ifc":
        cmd_validate_ifc(cmd["file_path"])
    elif action == "quantity_takeoff":
        cmd_quantity_takeoff(cmd["file_path"], cmd.get("element_types"))
    elif action == "spatial_query":
        cmd_spatial_query(cmd["file_path"], cmd["query_type"], cmd.get("params"))
    elif action == "diff_ifc":
        cmd_diff_ifc(cmd["file_a"], cmd["file_b"])
    elif action == "clash_detection":
        cmd_clash_detection(
            cmd["file_path"],
            cmd.get("type_a", "IfcWall"),
            cmd.get("type_b", "IfcPipeSegment"),
            cmd.get("tolerance", 0.0),
        )
    else:
        error(f"Unknown action: {action}")


if __name__ == "__main__":
    main()
