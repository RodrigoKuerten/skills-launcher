use crate::commands::{bootstrap_with_state, categories_for_state, settings_with_token, sources_for_state, stats_for_state};
use crate::domain::{Bootstrap, Category, Settings, SettingsInput, Source, Stats};
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub fn get_bootstrap(state: State<'_, AppState>) -> AppResult<Bootstrap> {
    bootstrap_with_state(&state)
}

#[tauri::command]
pub fn get_stats(state: State<'_, AppState>) -> AppResult<Stats> {
    stats_for_state(&state)
}

#[tauri::command]
pub fn list_sources(state: State<'_, AppState>) -> AppResult<Vec<Source>> {
    sources_for_state(&state)
}

#[tauri::command]
pub fn list_categories(state: State<'_, AppState>) -> AppResult<Vec<Category>> {
    categories_for_state(&state)
}

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> AppResult<Settings> {
    settings_with_token(&state)
}

#[tauri::command]
pub fn update_settings(state: State<'_, AppState>, input: SettingsInput) -> AppResult<Settings> {
    state.db.apply_settings(&input)?;
    if let Some(token) = &input.github_token {
        let mut current = state
            .github_token
            .lock()
            .map_err(|_| AppError::Other("Token lock poisoned".into()))?;
        *current = if token.trim().is_empty() {
            None
        } else {
            Some(token.trim().to_string())
        };
    }
    state
        .db
        .log_operation("settings", None, None, "success", Some("Settings updated"))?;
    settings_with_token(&state)
}

#[tauri::command]
pub fn open_url(url: String) -> AppResult<()> {
    if url.len() > 4096 {
        return Err(AppError::Validation("URL is too long".into()));
    }
    let parsed = url::Url::parse(&url)?;
    if parsed.scheme() != "https" {
        return Err(AppError::Validation("Only HTTPS links can be opened".into()));
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err(AppError::Validation("Links with embedded credentials are not allowed".into()));
    }
    open::that(parsed.as_str()).map_err(|error| AppError::Other(error.to_string()))
}
