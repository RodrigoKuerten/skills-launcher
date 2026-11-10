use crate::domain::{Bootstrap, Category, Settings, SettingsInput, Source, Stats};
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub fn get_bootstrap(state: State<'_, AppState>) -> AppResult<Bootstrap> {
    Ok(Bootstrap {
        stats: state.db.stats()?,
        sources: state.db.list_sources()?,
        categories: state.db.list_categories()?,
        settings: state.db.settings()?,
        recent_operations: state.db.recent_operations(8)?,
    })
}

#[tauri::command]
pub fn get_stats(state: State<'_, AppState>) -> AppResult<Stats> {
    state.db.stats()
}

#[tauri::command]
pub fn list_sources(state: State<'_, AppState>) -> AppResult<Vec<Source>> {
    state.db.list_sources()
}

#[tauri::command]
pub fn list_categories(state: State<'_, AppState>) -> AppResult<Vec<Category>> {
    state.db.list_categories()
}

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> AppResult<Settings> {
    state.db.settings()
}

#[tauri::command]
pub fn update_settings(state: State<'_, AppState>, input: SettingsInput) -> AppResult<Settings> {
    let settings = state.db.apply_settings(&input)?;
    state.db.log_operation("settings", None, None, "success", Some("Settings updated"))?;
    Ok(settings)
}

#[tauri::command]
pub fn open_url(url: String) -> AppResult<()> {
    if url.len() > 4096 {
        return Err(AppError::Validation("URL is too long".into()));
    }
    let parsed = url::Url::parse(&url)?;
    if parsed.scheme() != "https" && parsed.scheme() != "http" {
        return Err(AppError::Validation("Only http and https links can be opened".into()));
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err(AppError::Validation("Links with embedded credentials are not allowed".into()));
    }
    open::that(parsed.as_str()).map_err(|error| AppError::Other(error.to_string()))
}
