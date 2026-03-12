use tauri::Manager;

pub mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            commands::greet,
            commands::save_project,
            commands::load_project,
            commands::export_dxf,
            commands::import_dxf,
            commands::export_svg,
            commands::generate_floor_plan_ai,
            commands::convert_to_3d,
            commands::get_building_codes,
            commands::import_ifc,
            commands::export_ifc,
            commands::validate_ifc,
            commands::ifc_quantity_takeoff,
            commands::ifc_spatial_query,
            commands::ifc_diff,
            commands::ifc_clash_detection,
            commands::export_pdf,
            commands::perform_geom_op,
        ])
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
