import sys
import json
import shapely.geometry as sg
import shapely.affinity as aff
import shapely.ops

def error_exit(msg):
    print(json.dumps({"error": msg}))
    sys.exit(1)

def main():
    try:
        input_data = sys.stdin.read()
        if not input_data:
            error_exit("No input data provided")
        
        req = json.loads(input_data)
        op = req.get("op")
        entities = req.get("entities", [])
        params = req.get("params", {})

        results = []

        if op == "offset":
            dist = params.get("distance", 100)
            for en in entities:
                if en.get("type") == "wall" or en.get("type") == "line":
                    line = sg.LineString([(en.get("x1",0), en.get("y1",0)), (en.get("x2",0), en.get("y2",0))])
                    offset_line = line.parallel_offset(dist, "left" if dist > 0 else "right")
                    if isinstance(offset_line, sg.LineString) and not offset_line.is_empty:
                        coords = list(offset_line.coords)
                        if len(coords) == 2:
                            new_en = en.copy()
                            new_en["action"] = "new"  # Just returning new offsets
                            new_en["x1"], new_en["y1"] = coords[0]
                            new_en["x2"], new_en["y2"] = coords[1]
                            # Generate a dummy ID - frontend will replace
                            new_en["id"] = en.get("id") + "_offset"
                            results.append(new_en)

        elif op == "trim":
            # Very basic trim: split entities by a boundary entity
            boundary_id = params.get("boundary_id")
            if boundary_id:
                try:
                    boundary = next(e for e in entities if e.get("id") == boundary_id)
                    b_line = sg.LineString([(boundary.get("x1",0), boundary.get("y1",0)), (boundary.get("x2",0), boundary.get("y2",0))])
                    
                    for en in entities:
                        if en.get("id") == boundary_id: continue
                        if en.get("type") in ["wall", "line"]:
                            line = sg.LineString([(en.get("x1",0), en.get("y1",0)), (en.get("x2",0), en.get("y2",0))])
                            # Split the line
                            if b_line.intersects(line):
                                use_pt = params.get("click_pt", {"x": 0, "y": 0})
                                click_pt = sg.Point(use_pt["x"], use_pt["y"])
                                splits = shapely.ops.split(line, b_line)
                                # Keep the part FURTHEST from the click_pt (trim the clicked side)
                                kept = max(list(splits.geoms), key=lambda geom: geom.distance(click_pt))
                                if isinstance(kept, sg.LineString):
                                    coords = list(kept.coords)
                                    if len(coords) == 2:
                                        new_en = en.copy()
                                        new_en["x1"], new_en["y1"] = coords[0]
                                        new_en["x2"], new_en["y2"] = coords[1]
                                        results.append(new_en)
                except StopIteration:
                    pass

        elif op == "fillet":
            # Placeholder for fillet matching 2 lines
            # In a real engine, we'd calculate the intersection point, 
            # shorten both lines by the tangent distance, and spawn an arc.
            radius = params.get("radius", 100)
            if len(entities) == 2:
                # Basic mock logic for fillet
                pass

        print(json.dumps({"success": True, "results": results}))

    except Exception as e:
        error_exit(str(e))

if __name__ == "__main__":
    main()
