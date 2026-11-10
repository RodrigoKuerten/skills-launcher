#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod agents;
mod catalog;
mod commands;
mod db;
mod domain;
mod error;
mod paths;
mod security;
mod sources;
mod state;

use db::Db;
use state::AppState;
use std::time::Duration;
use tauri::{Emitter, Manager};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .map_err(|error| error.to_string())?;
            let db = Db::open(&data_dir).map_err(|error| error.to_string())?;
            agents::recover_stale_swaps();
            let state = AppState::new(db, &data_dir).map_err(|error| error.to_string())?;
            app.manage(state);
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(Duration::from_secs(8)).await;
                loop {
                    let state = handle.state::<AppState>();
                    let enabled = state
                        .db
                        .settings()
                        .map(|settings| settings.auto_sync)
                        .unwrap_or(false);
                    if enabled {
                        let sources = state.db.list_sources().unwrap_or_default();
                        for source in sources {
                            if !source.enabled || !source.auto_sync {
                                continue;
                            }
                            if !source_is_due(&source) {
                                continue;
                            }
                            let token = state
                                .github_token
                                .lock()
                                .ok()
                                .and_then(|token| token.clone());
                            let _sync_guard = state.sync_lock.lock().await;
                            if let Ok(summary) = catalog::sync_source(
                                &state.db,
                                &state.http,
                                token.as_deref(),
                                &state.temp_dir,
                                &source.id,
                                "scheduled",
                            )
                            .await
                            {
                                let _ = handle.emit("catalog-updated", &summary);
                            }
                        }
                        let _install_guard = state.install_lock.lock().await;
                        let _ = agents::auto_update(&state.db, &state.data_dir).await;
                    }
                    tokio::time::sleep(Duration::from_secs(300)).await;
                }
            });
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
            commands::detect_agents,
            commands::set_agent_auto_install,
            commands::install_skill,
            commands::update_installation,
            commands::uninstall_skill,
            commands::rollback_installation,
            commands::list_backups,
            commands::list_installations,
            commands::list_updates,
            commands::list_operations,
            commands::apply_auto_updates,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Skills Launcher");
}

fn source_is_due(source: &domain::Source) -> bool {
    let Some(last) = &source.last_sync_at else {
        return true;
    };
    let Ok(last) = chrono::DateTime::parse_from_rfc3339(last) else {
        return true;
    };
    let minutes = chrono::Utc::now().signed_duration_since(last).num_minutes();
    minutes >= source.interval_minutes
}
