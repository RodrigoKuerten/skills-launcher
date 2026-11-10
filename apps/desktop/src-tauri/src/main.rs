#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;
mod domain;
mod error;
mod state;

use db::Db;
use state::AppState;
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .map_err(|error| error.to_string())?;
            let db = Db::open(&data_dir).map_err(|error| error.to_string())?;
            let state = AppState::new(db).map_err(|error| error.to_string())?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_bootstrap,
            commands::get_stats,
            commands::list_sources,
            commands::list_categories,
            commands::get_settings,
            commands::update_settings,
            commands::open_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Skills Launcher");
}
