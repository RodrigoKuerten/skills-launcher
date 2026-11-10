#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod catalog;
mod commands;
mod db;
mod domain;
mod error;
mod security;
mod sources;
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
            let state = AppState::new(db, &data_dir).map_err(|error| error.to_string())?;
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
            commands::list_skills,
            commands::get_skill,
            commands::list_source_runs,
            commands::add_source,
            commands::update_source,
            commands::set_source_enabled,
            commands::delete_source,
            commands::sync_source,
            commands::sync_all_sources,
            commands::export_sources,
            commands::import_sources,
            commands::pick_source_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Skills Launcher");
}
