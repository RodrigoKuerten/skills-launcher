use crate::catalog;
use crate::domain::{
    SkillDetail, SkillPage, SkillQuery, Source, SourceExport, SourceInput, SourceRun, SyncSummary,
};
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub fn list_skills(state: State<'_, AppState>, query: SkillQuery) -> AppResult<SkillPage> {
    catalog::list_skills(&state.db, &query)
}

#[tauri::command]
pub fn get_skill(state: State<'_, AppState>, id: String) -> AppResult<SkillDetail> {
    catalog::get_skill(&state.db, &id)
}

#[tauri::command]
pub fn list_source_runs(
    state: State<'_, AppState>,
    source_id: Option<String>,
    limit: Option<i64>,
) -> AppResult<Vec<SourceRun>> {
    catalog::list_source_runs(&state.db, source_id.as_deref(), limit.unwrap_or(40))
}

#[tauri::command]
pub async fn add_source(state: State<'_, AppState>, input: SourceInput) -> AppResult<Source> {
    require_grant(&state, &input)?;
    catalog::create_source(&state.db, input)
}

#[tauri::command]
pub async fn update_source(
    state: State<'_, AppState>,
    id: String,
    input: SourceInput,
) -> AppResult<Source> {
    require_grant(&state, &input)?;
    catalog::update_source(&state.db, &id, input)
}

#[tauri::command]
pub fn set_source_enabled(
    state: State<'_, AppState>,
    id: String,
    enabled: bool,
) -> AppResult<Source> {
    catalog::set_source_enabled(&state.db, &id, enabled)
}

#[tauri::command]
pub fn delete_source(state: State<'_, AppState>, id: String) -> AppResult<()> {
    catalog::delete_source(&state.db, &id)
}

#[tauri::command]
pub async fn sync_source(
    app: AppHandle,
    state: State<'_, AppState>,
    source_id: String,
) -> AppResult<SyncSummary> {
    let token = state
        .github_token
        .lock()
        .map_err(|_| AppError::Other("Token lock poisoned".into()))?
        .clone();
    let summary = catalog::sync_source(
        &state.db,
        &state.http,
        token.as_deref(),
        &state.temp_dir,
        &source_id,
        "manual",
    )
    .await?;
    let _ = app.emit("catalog-updated", &summary);
    Ok(summary)
}

#[tauri::command]
pub async fn sync_all_sources(
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<Vec<SyncSummary>> {
    let token = state
        .github_token
        .lock()
        .map_err(|_| AppError::Other("Token lock poisoned".into()))?
        .clone();
    let summaries = catalog::sync_all(
        &state.db,
        &state.http,
        token.as_deref(),
        &state.temp_dir,
    )
    .await?;
    let _ = app.emit("catalog-updated", &summaries);
    Ok(summaries)
}

#[tauri::command]
pub fn export_sources(state: State<'_, AppState>) -> AppResult<SourceExport> {
    catalog::export_sources(&state.db)
}

#[tauri::command]
pub fn import_sources(state: State<'_, AppState>, json: String) -> AppResult<Vec<Source>> {
    let export: SourceExport = serde_json::from_str(&json)
        .map_err(|error| AppError::Validation(format!("Invalid source export: {error}")))?;
    for input in &export.sources {
        require_grant(&state, input)?;
    }
    catalog::import_sources(&state.db, &json)
}

#[tauri::command]
pub fn pick_source_path(
    app: AppHandle,
    state: State<'_, AppState>,
    kind: String,
) -> AppResult<Option<String>> {
    let dialog = app.dialog().file();
    let picked = if kind == "zip" {
        dialog
            .add_filter("ZIP archive", &["zip"])
            .blocking_pick_file()
    } else {
        dialog.blocking_pick_folder()
    };
    let Some(picked) = picked else {
        return Ok(None);
    };
    let path = picked
        .into_path()
        .map_err(|error| AppError::Validation(format!("Invalid picked path: {error}")))?;
    let canonical = std::fs::canonicalize(&path)
        .map_err(|error| AppError::Validation(format!("Path is not accessible: {error}")))?;
    state
        .grants
        .lock()
        .map_err(|_| AppError::Other("Path grant lock poisoned".into()))?
        .insert(canonical.clone());
    Ok(Some(canonical.to_string_lossy().to_string()))
}

fn require_grant(state: &AppState, input: &SourceInput) -> AppResult<()> {
    if !matches!(
        input.kind,
        crate::domain::SourceKind::LocalDir | crate::domain::SourceKind::Zip
    ) {
        return Ok(());
    }
    let canonical = std::fs::canonicalize(&input.url)
        .map_err(|error| AppError::Validation(format!("Source path is not accessible: {error}")))?;
    let grants = state
        .grants
        .lock()
        .map_err(|_| AppError::Other("Path grant lock poisoned".into()))?;
    if !grants.contains(&canonical) {
        return Err(AppError::Security(
            "Local sources must be selected with the file picker".into(),
        ));
    }
    Ok(())
}

#[allow(dead_code)]
fn grants_snapshot(state: &AppState) -> AppResult<Vec<PathBuf>> {
    Ok(state
        .grants
        .lock()
        .map_err(|_| AppError::Other("Path grant lock poisoned".into()))?
        .iter()
        .cloned()
        .collect())
}
