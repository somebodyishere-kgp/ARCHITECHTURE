use serde::{Deserialize, Serialize};
use std::process::{Command, Stdio};
use std::io::{Write, Read};
use std::path::PathBuf;

fn get_bridges_dir() -> Result<PathBuf, String> {
    let cwd = std::env::current_dir().map_err(|e| e.to_string())?;
    if cwd.ends_with("src-tauri") {
        Ok(cwd.parent().unwrap().join("bridges"))
    } else {
        Ok(cwd.join("bridges"))
    }
}

fn run_bridge(script_name: &str, payload: serde_json::Value) -> Result<serde_json::Value, String> {
    let bridges_dir = get_bridges_dir()?;
    let is_freecad = script_name == "freecad_bridge.py";
    
    let (program, args) = if is_freecad {
        #[cfg(target_os = "windows")]
        let prog = bridges_dir.join("run_freecad.bat");
        #[cfg(not(target_os = "windows"))]
        let prog = PathBuf::from("python3");
        
        #[cfg(target_os = "windows")]
        let args = vec![];
        #[cfg(not(target_os = "windows"))]
        let args = vec![bridges_dir.join(script_name).to_string_lossy().to_string()];
        
        (prog, args)
    } else {
        #[cfg(target_os = "windows")]
        let prog = PathBuf::from("python");
        #[cfg(not(target_os = "windows"))]
        let prog = PathBuf::from("python3");
        
        (prog, vec![bridges_dir.join(script_name).to_string_lossy().to_string()])
    };

    let mut child = Command::new(&program)
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|e| format!("Failed to start python bridge {:?}: {}", program, e))?;

    if let Some(mut stdin) = child.stdin.take() {
        let input_str = serde_json::to_string(&payload).unwrap();
        stdin.write_all(input_str.as_bytes()).map_err(|e| e.to_string())?;
    }

    let mut output = String::new();
    if let Some(mut stdout) = child.stdout.take() {
        stdout.read_to_string(&mut output).map_err(|e| e.to_string())?;
    }

    let status = child.wait().map_err(|e| e.to_string())?;
    if !status.success() {
        return Err(format!("Bridge exited with status {} (Output: {})", status, output));
    }

    serde_json::from_str(&output).map_err(|e| format!("Failed to parse bridge output: {} (Output: {})", e, output))
}

#[derive(Serialize, Deserialize)]
pub struct ProjectData {
    pub manifest: serde_json::Value,
    pub floors: Vec<serde_json::Value>,
    pub sheets: Vec<serde_json::Value>,
}

/// Simple greeting for dev/test
#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("ArchFlow says hello, {}!", name)
}

/// Save the current ADF project to disk
#[tauri::command]
pub async fn save_project(path: String, data: serde_json::Value) -> Result<(), String> {
    let content = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    std::fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(())
}

/// Load an ADF project from disk
#[tauri::command]
pub async fn load_project(path: String) -> Result<serde_json::Value, String> {
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let data: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(data)
}

/// Export the current 2D plan as DXF via LibreCAD bridge
#[tauri::command]
pub async fn export_dxf(path: String, floor_data: serde_json::Value) -> Result<String, String> {
    let payload = serde_json::json!({
        "action": "export_dxf",
        "floor_data": floor_data,
        "output_path": path,
        "dxf_version": "R2010"
    });
    
    let res = run_bridge("librecad_bridge.py", payload)?;
    if res["ok"].as_bool().unwrap_or(false) {
        Ok(format!("Exported native DXF to {}", path))
    } else {
        Err(res["error"].as_str().unwrap_or("Unknown error").to_string())
    }
}

/// Parse a text prompt and generate a 2D floor plan layout leveraging an AI bridge.
#[tauri::command]
pub async fn generate_floor_plan_ai(prompt: String, api_key: Option<String>, constraints: Option<serde_json::Value>) -> Result<serde_json::Value, String> {
    let payload = serde_json::json!({
        "action": "generate_floor_plan",
        "prompt": prompt,
        "api_key": api_key,
        "constraints": constraints.unwrap_or_else(|| serde_json::json!({}))
    });

    // We reuse the freecad bridge structure, but we'll create a dedicated ai_bridge.py soon. 
    // For now, let's route this to a mock generator in python.
    let response = run_bridge("ai_bridge.py", payload)?;
    Ok(response)
}

/// Perform geometric computational operations via Python Shapely
#[tauri::command]
pub async fn perform_geom_op(op: String, entities: Vec<serde_json::Value>, params: serde_json::Value) -> Result<serde_json::Value, String> {
    let payload = serde_json::json!({
        "op": op,
        "entities": entities,
        "params": params
    });

    let response = run_bridge("geom_bridge.py", payload)?;
    Ok(response)
}

fn generate_sample_layout(prompt: &str) -> serde_json::Value {
    let prompt_lower = prompt.to_lowercase();
    
    // Determine scale based on prompt keywords
    let (scale, rooms) = if prompt_lower.contains("museum") || prompt_lower.contains("large") || prompt_lower.contains("commercial") {
        (2.0_f64, vec!["Entrance Hall", "Gallery A", "Gallery B", "Gallery C", "Cafe", "Gift Shop", "Restrooms", "Storage"])
    } else if prompt_lower.contains("office") {
        (1.5_f64, vec!["Reception", "Open Office", "Meeting Room", "Director's Office", "Pantry", "Restrooms"])
    } else if prompt_lower.contains("3 bedroom") || prompt_lower.contains("three bedroom") {
        (1.0_f64, vec!["Living Room", "Dining", "Kitchen", "Master Bedroom", "Bedroom 2", "Bedroom 3", "Bathroom 1", "Bathroom 2"])
    } else {
        (1.0_f64, vec!["Living Room", "Kitchen", "Bedroom 1", "Bedroom 2", "Bathroom"])
    };
    
    let mut entities = Vec::new();
    let mut id_counter = 1u32;
    
    // Outer bounding walls
    let bw = 800.0 * scale;  // building width
    let bh = 600.0 * scale;  // building height
    
    // North wall
    entities.push(serde_json::json!({
        "id": format!("w{}", id_counter), "type": "wall",
        "x1": 0.0, "y1": 0.0, "x2": bw, "y2": 0.0,
        "thickness": 300.0, "layer": "Walls", "height": 3000.0
    }));
    id_counter += 1;
    
    // East wall
    entities.push(serde_json::json!({
        "id": format!("w{}", id_counter), "type": "wall",
        "x1": bw, "y1": 0.0, "x2": bw, "y2": bh,
        "thickness": 300.0, "layer": "Walls", "height": 3000.0
    }));
    id_counter += 1;
    
    // South wall
    entities.push(serde_json::json!({
        "id": format!("w{}", id_counter), "type": "wall",
        "x1": 0.0, "y1": bh, "x2": bw, "y2": bh,
        "thickness": 300.0, "layer": "Walls", "height": 3000.0
    }));
    id_counter += 1;
    
    // West wall
    entities.push(serde_json::json!({
        "id": format!("w{}", id_counter), "type": "wall",
        "x1": 0.0, "y1": 0.0, "x2": 0.0, "y2": bh,
        "thickness": 300.0, "layer": "Walls", "height": 3000.0
    }));
    id_counter += 1;
    
    // Generate internal room partitions
    let room_count = rooms.len();
    let cols = ((room_count as f64).sqrt().ceil()) as usize;
    let rows = (room_count + cols - 1) / cols;
    let room_w = (bw - 300.0) / cols as f64;
    let room_h = (bh - 300.0) / rows as f64;
    
    for (idx, room_name) in rooms.iter().enumerate() {
        let col = idx % cols;
        let row = idx / cols;
        let rx = 150.0 + col as f64 * room_w;
        let ry = 150.0 + row as f64 * room_h;
        
        // Add internal walls (skip if edge)
        if col > 0 {
            entities.push(serde_json::json!({
                "id": format!("w{}", id_counter), "type": "wall",
                "x1": rx, "y1": ry, "x2": rx, "y2": ry + room_h,
                "thickness": 150.0, "layer": "Walls", "height": 3000.0
            }));
            id_counter += 1;
        }
        if row > 0 {
            entities.push(serde_json::json!({
                "id": format!("w{}", id_counter), "type": "wall",
                "x1": rx, "y1": ry, "x2": rx + room_w, "y2": ry,
                "thickness": 150.0, "layer": "Walls", "height": 3000.0
            }));
            id_counter += 1;
        }
        
        // Add door in each internal partition
        let door_x = rx + room_w * 0.3;
        let door_y = ry + room_h * 0.5;
        entities.push(serde_json::json!({
            "id": format!("d{}", id_counter), "type": "door",
            "x": door_x, "y": door_y, "width": 90.0, "swing": 90.0,
            "layer": "Doors"
        }));
        id_counter += 1;
        
        // Room label
        entities.push(serde_json::json!({
            "id": format!("t{}", id_counter), "type": "text",
            "x": rx + room_w * 0.5, "y": ry + room_h * 0.5,
            "text": room_name, "height": 20.0, "layer": "Annotation"
        }));
        id_counter += 1;
    }
    
    // Main entrance door on south wall
    entities.push(serde_json::json!({
        "id": format!("d{}", id_counter), "type": "door",
        "x": bw * 0.5, "y": bh, "width": 120.0, "swing": 90.0,
        "layer": "Doors"
    }));
    
    serde_json::json!({
        "version": "1.0",
        "generated_from_prompt": prompt,
        "building_type": if prompt_lower.contains("museum") { "museum" } else if prompt_lower.contains("office") { "office" } else { "residential" },
        "total_area": bw * bh / 1_000_000.0,
        "floor_height": 3000.0,
        "entities": entities,
        "layers": [
            {"name": "Walls", "color": "#ffffff", "visible": true, "locked": false},
            {"name": "Doors", "color": "#4a9eff", "visible": true, "locked": false},
            {"name": "Windows", "color": "#7dd3fc", "visible": true, "locked": false},
            {"name": "Annotation", "color": "#94a3b8", "visible": true, "locked": false},
            {"name": "Dimensions", "color": "#64748b", "visible": true, "locked": false}
        ]
    })
}

/// Get building codes for a location
#[tauri::command]
pub async fn get_building_codes(location: String) -> Result<serde_json::Value, String> {
    let location_lower = location.to_lowercase();
    
    let codes = if location_lower.contains("goa") {
        serde_json::json!({
            "location": "Goa, India",
            "authority": "Town and Country Planning Department, Goa",
            "codes": {
                "max_height": "15m (residential), 18m (commercial)",
                "far": "1.0–1.5 (zone dependent)",
                "ground_coverage": "50% max",
                "setbacks": {
                    "front": "6m from road",
                    "rear": "3m",
                    "sides": "2.5m each"
                },
                "special_notes": [
                    "CRZ (Coastal Regulation Zone) - No construction within 200m of High Tide Line",
                    "Heritage zone restrictions apply in Panaji old town",
                    "Green belt preservation zones exist near wildlife sanctuaries"
                ],
                "parking": "1 space per 50 sqm for commercial"
            }
        })
    } else if location_lower.contains("mumbai") || location_lower.contains("bombay") {
        serde_json::json!({
            "location": "Mumbai, Maharashtra, India",
            "authority": "MCGM / MMRDA",
            "codes": {
                "max_height": "Varies by zone, up to 70m in growth centers",
                "far": "1.0–3.0 (zone and TDR dependent)",
                "ground_coverage": "50% max",
                "setbacks": {"front": "4.5m", "rear": "3m", "sides": "2.0m"},
                "special_notes": [
                    "Coastal Regulation Zone applies near shoreline",
                    "Heritage buildings have special preservation rules",
                    "TDR (Transfer of Development Rights) applicable"
                ],
                "parking": "1 space per 100 sqm"
            }
        })
    } else if location_lower.contains("delhi") {
        serde_json::json!({
            "location": "Delhi, India",
            "authority": "DDA (Delhi Development Authority)",
            "codes": {
                "max_height": "15m residential, varies commercial",
                "far": "1.2–3.5 (zone dependent)",
                "ground_coverage": "33–50%",
                "setbacks": {"front": "3–6m", "rear": "3m", "sides": "1.5–3m"},
                "special_notes": [
                    "Lutyens Bungalow Zone has strict height regulations",
                    "Flood plain restrictions near Yamuna",
                    "Green area mandated for plots > 3000 sqm"
                ],
                "parking": "Per MPD 2041 norms"
            }
        })
    } else {
        serde_json::json!({
            "location": location,
            "authority": "Local Municipal Authority",
            "codes": {
                "disclaimer": "Specific bylaws not found in database. Using NBC 2016 general guidelines.",
                "max_height": "10–15m (residential per NBC 2016)",
                "far": "1.5 (general NBC guidelines)",
                "ground_coverage": "50% max",
                "setbacks": {"front": "4.5m", "rear": "3m", "sides": "1.5m"},
                "special_notes": [
                    "Verify with local authority",
                    "NBC 2016 (National Building Code) applies as minimum standard"
                ]
            }
        })
    };
    
    Ok(codes)
}

/// Convert 2D floor plan to 3D model
#[tauri::command]
pub async fn convert_to_3d(floor_data: serde_json::Value) -> Result<serde_json::Value, String> {
    // 1. Call True BIM Engine (FreeCAD) to generate industry-standard IFC model under the hood
    let ifc_path = get_bridges_dir()?.parent().unwrap().join("building.ifc");
    let payload = serde_json::json!({
        "action": "create_ifc",
        "floor_data": floor_data,
        "output_path": ifc_path.to_string_lossy().to_string()
    });
    
    // We run it and let FreeCAD do its thing if installed.
    // If it fails (FreeCAD not found), the app still shows the UI preview below.
    let _freecad_result = run_bridge("freecad_bridge.py", payload);

    // 2. Generate a Three.js compatible scene description from 2D floor entities for UI preview

    let entities = match floor_data["entities"].as_array() {
        Some(arr) => arr.clone(),
        None => return Err("No entities in floor data".to_string()),
    };
    
    let floor_height = floor_data["floor_height"].as_f64().unwrap_or(3000.0);
    let mut geometry_objects = Vec::new();
    
    for entity in &entities {
        let etype = entity["type"].as_str().unwrap_or("");
        match etype {
            "wall" => {
                let x1 = entity["x1"].as_f64().unwrap_or(0.0);
                let y1 = entity["y1"].as_f64().unwrap_or(0.0);
                let x2 = entity["x2"].as_f64().unwrap_or(0.0);
                let y2 = entity["y2"].as_f64().unwrap_or(0.0);
                let thickness = entity["thickness"].as_f64().unwrap_or(200.0);
                let height = entity["height"].as_f64().unwrap_or(floor_height);
                
                // Compute wall center, length, and rotation
                let cx = (x1 + x2) / 2.0;
                let cy = (y1 + y2) / 2.0;
                let length = ((x2 - x1).powi(2) + (y2 - y1).powi(2)).sqrt();
                let angle = (y2 - y1).atan2(x2 - x1);
                
                geometry_objects.push(serde_json::json!({
                    "id": entity["id"],
                    "type": "box",
                    "position": [cx / 1000.0, height / 2000.0, cy / 1000.0],
                    "size": [length / 1000.0, height / 1000.0, thickness / 1000.0],
                    "rotation_y": angle,
                    "material": "concrete",
                    "color": "#e8e0d4"
                }));
            }
            _ => {}
        }
    }
    
    // Add ground slab
    geometry_objects.push(serde_json::json!({
        "id": "slab_ground",
        "type": "box",
        "position": [0.0, -0.05, 0.0],
        "size": [20.0, 0.1, 20.0],
        "material": "concrete",
        "color": "#d1ccbf"
    }));
    
    Ok(serde_json::json!({
        "scene_objects": geometry_objects,
        "ambient_light": {"color": "#ffffff", "intensity": 0.5},
        "directional_light": {
            "color": "#fff5e6",
            "intensity": 1.5,
            "position": [10.0, 20.0, 10.0]
        },
        "camera": {"position": [10.0, 8.0, 10.0], "target": [0.0, 1.5, 0.0]}
    }))
}

// ═══════════════════════════════════════════════════════════════════════════════
//  IFC (Industry Foundation Classes) via IFCOpenShell bridge
// ═══════════════════════════════════════════════════════════════════════════════

/// Import an IFC file and convert to ADF entities
#[tauri::command]
pub async fn import_ifc(file_path: String) -> Result<serde_json::Value, String> {
    let payload = serde_json::json!({
        "action": "import_ifc",
        "file_path": file_path,
    });
    let res = run_bridge("ifcopenshell_bridge.py", payload)?;
    if res["ok"].as_bool().unwrap_or(false) {
        Ok(res)
    } else {
        Err(res["error"].as_str().unwrap_or("IFC import failed").to_string())
    }
}

/// Export ADF floor data to IFC
#[tauri::command]
pub async fn export_ifc(output_path: String, floor_data: serde_json::Value, schema: Option<String>) -> Result<serde_json::Value, String> {
    let payload = serde_json::json!({
        "action": "export_ifc",
        "floor_data": floor_data,
        "output_path": output_path,
        "schema": schema.unwrap_or_else(|| "IFC4".to_string()),
    });
    let res = run_bridge("ifcopenshell_bridge.py", payload)?;
    if res["ok"].as_bool().unwrap_or(false) {
        Ok(res)
    } else {
        Err(res["error"].as_str().unwrap_or("IFC export failed").to_string())
    }
}

/// Validate an IFC file for compliance
#[tauri::command]
pub async fn validate_ifc(file_path: String) -> Result<serde_json::Value, String> {
    let payload = serde_json::json!({
        "action": "validate_ifc",
        "file_path": file_path,
    });
    let res = run_bridge("ifcopenshell_bridge.py", payload)?;
    if res["ok"].as_bool().unwrap_or(false) {
        Ok(res)
    } else {
        Err(res["error"].as_str().unwrap_or("IFC validation failed").to_string())
    }
}

/// Perform quantity takeoff from an IFC model
#[tauri::command]
pub async fn ifc_quantity_takeoff(file_path: String, element_types: Option<Vec<String>>) -> Result<serde_json::Value, String> {
    let payload = serde_json::json!({
        "action": "quantity_takeoff",
        "file_path": file_path,
        "element_types": element_types,
    });
    let res = run_bridge("ifcopenshell_bridge.py", payload)?;
    if res["ok"].as_bool().unwrap_or(false) {
        Ok(res)
    } else {
        Err(res["error"].as_str().unwrap_or("Quantity takeoff failed").to_string())
    }
}

/// Query IFC spatial structure  
#[tauri::command]
pub async fn ifc_spatial_query(file_path: String, query_type: String, params: Option<serde_json::Value>) -> Result<serde_json::Value, String> {
    let payload = serde_json::json!({
        "action": "spatial_query",
        "file_path": file_path,
        "query_type": query_type,
        "params": params.unwrap_or_else(|| serde_json::json!({})),
    });
    let res = run_bridge("ifcopenshell_bridge.py", payload)?;
    if res["ok"].as_bool().unwrap_or(false) {
        Ok(res)
    } else {
        Err(res["error"].as_str().unwrap_or("Spatial query failed").to_string())
    }
}

/// Compare two IFC files for differences
#[tauri::command]
pub async fn ifc_diff(file_a: String, file_b: String) -> Result<serde_json::Value, String> {
    let payload = serde_json::json!({
        "action": "diff_ifc",
        "file_a": file_a,
        "file_b": file_b,
    });
    let res = run_bridge("ifcopenshell_bridge.py", payload)?;
    if res["ok"].as_bool().unwrap_or(false) {
        Ok(res)
    } else {
        Err(res["error"].as_str().unwrap_or("IFC diff failed").to_string())
    }
}

/// Clash detection between element types in an IFC model
#[tauri::command]
pub async fn ifc_clash_detection(file_path: String, type_a: Option<String>, type_b: Option<String>, tolerance: Option<f64>) -> Result<serde_json::Value, String> {
    let payload = serde_json::json!({
        "action": "clash_detection",
        "file_path": file_path,
        "type_a": type_a.unwrap_or_else(|| "IfcWall".to_string()),
        "type_b": type_b.unwrap_or_else(|| "IfcPipeSegment".to_string()),
        "tolerance": tolerance.unwrap_or(0.0),
    });
    let res = run_bridge("ifcopenshell_bridge.py", payload)?;
    if res["ok"].as_bool().unwrap_or(false) {
        Ok(res)
    } else {
        Err(res["error"].as_str().unwrap_or("Clash detection failed").to_string())
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SVG Export
// ═══════════════════════════════════════════════════════════════════════════════

/// Export 2D floor plan as SVG
#[tauri::command]
pub async fn export_svg(output_path: String, floor_data: serde_json::Value) -> Result<String, String> {
    let payload = serde_json::json!({
        "action": "export_svg",
        "floor_data": floor_data,
        "output_path": output_path,
    });
    let res = run_bridge("librecad_bridge.py", payload)?;
    if res["ok"].as_bool().unwrap_or(false) {
        Ok(format!("Exported SVG to {}", output_path))
    } else {
        Err(res["error"].as_str().unwrap_or("SVG export failed").to_string())
    }
}

/// Import DXF file and convert to ADF entities
#[tauri::command]
pub async fn import_dxf(file_path: String) -> Result<serde_json::Value, String> {
    let payload = serde_json::json!({
        "action": "import_dxf",
        "file_path": file_path,
    });
    let res = run_bridge("librecad_bridge.py", payload)?;
    if res["ok"].as_bool().unwrap_or(false) {
        Ok(res)
    } else {
        Err(res["error"].as_str().unwrap_or("DXF import failed").to_string())
    }
}

/// Export floor plan to PDF
#[tauri::command]
pub async fn export_pdf(floor: serde_json::Value, out_path: String, paper_size: Option<String>, orientation: Option<String>, title: Option<String>, scale: Option<String>) -> Result<serde_json::Value, String> {
    let payload = serde_json::json!({
        "command": "export_pdf",
        "params": {
            "floor": floor,
            "outPath": out_path,
            "paperSize": paper_size.unwrap_or_else(|| "A3".to_string()),
            "orientation": orientation.unwrap_or_else(|| "landscape".to_string()),
            "title": title.unwrap_or_else(|| "ArchFlow Drawing".to_string()),
            "scale": scale.unwrap_or_else(|| "1:100".to_string()),
        }
    });
    let res = run_bridge("pdf_bridge.py", payload)?;
    if res["ok"].as_bool().unwrap_or(false) {
        Ok(res)
    } else {
        Err(res["error"].as_str().unwrap_or("PDF export failed").to_string())
    }
}
