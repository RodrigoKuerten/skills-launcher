use crate::agents;
use crate::catalog;
use crate::domain::{
    Backup, DetectedAgent, InstallRequest, InstallResponse, Installation, Operation, UpdateItem,
};
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use tauri::{AppHandle, Emitter, State};

#[tauri::command]
pub async fn detect_agents(state: State<'_, AppState>) -> AppResult<Vec<DetectedAgent>> {
    agents::detect_all(&state.db).await
}

#[tauri::command]
pub async fn set_agent_auto_install(
    state: State<'_, AppState>,
    host: String,
    enabled: bool,
) -> AppResult<Vec<DetectedAgent>> {
    agents::set_auto_install(&state.db, &host, enabled)?;
    agents::detect_all(&state.db).await
}

#[tauri::command]
pub async fn set_manual_agent(
    state: State<'_, AppState>,
    host: String,
    executable_path: Option<String>,
    skills_path: Option<String>,
) -> AppResult<Vec<DetectedAgent>> {
    agents::set_manual_agent(
        &state.db,
        &host,
        executable_path.as_deref(),
        skills_path.as_deref(),
    )?;
    agents::detect_all(&state.db).await
}

#[tauri::command]
pub async fn clear_manual_agent(
    state: State<'_, AppState>,
    host: String,
) -> AppResult<Vec<DetectedAgent>> {
    agents::clear_manual_agent(&state.db, &host)?;
    agents::detect_all(&state.db).await
}

#[tauri::command]
pub async fn install_skill(
    app: AppHandle,
    state: State<'_, AppState>,
    request: InstallRequest,
) -> AppResult<InstallResponse> {
    let detected = agents::detect_all(&state.db).await?;
    let _guard = state.install_lock.lock().await;
    let result = agents::install_skill(&state.db, &state.data_dir, &request, &detected)?;
    let _ = app.emit("library-updated", &result);
    Ok(result)
}

#[tauri::command]
pub async fn update_installation(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> AppResult<InstallResponse> {
    let detected = agents::detect_all(&state.db).await?;
    let _guard = state.install_lock.lock().await;
    let result = agents::update_installation(&state.db, &state.data_dir, &id, &detected)?;
    let _ = app.emit("library-updated", &result);
    Ok(result)
}

#[tauri::command]
pub async fn uninstall_skill(
    state: State<'_, AppState>,
    id: String,
    remove_files: bool,
) -> AppResult<()> {
    let _guard = state.install_lock.lock().await;
    agents::uninstall_skill(&state.db, &state.data_dir, &id, remove_files)
}

#[tauri::command]
pub async fn rollback_installation(
    state: State<'_, AppState>,
    id: String,
    backup_id: Option<String>,
) -> AppResult<InstallResponse> {
    let _guard = state.install_lock.lock().await;
    agents::rollback_installation(&state.db, &state.data_dir, &id, backup_id.as_deref())
}

#[tauri::command]
pub fn list_backups(
    state: State<'_, AppState>,
    installation_id: Option<String>,
) -> AppResult<Vec<Backup>> {
    agents::list_backups(&state.db, installation_id.as_deref())
}

#[tauri::command]
pub fn list_installations(state: State<'_, AppState>) -> AppResult<Vec<Installation>> {
    catalog::list_installations(&state.db)
}

#[tauri::command]
pub fn list_updates(state: State<'_, AppState>) -> AppResult<Vec<UpdateItem>> {
    catalog::list_updates(&state.db)
}

#[tauri::command]
pub fn list_operations(
    state: State<'_, AppState>,
    limit: Option<i64>,
) -> AppResult<Vec<Operation>> {
    state
        .db
        .recent_operations(limit.unwrap_or(100).clamp(1, 500))
}

#[tauri::command]
pub async fn apply_auto_updates(
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<Vec<crate::domain::InstallOutcome>> {
    let _guard = state.install_lock.lock().await;
    let outcomes = agents::auto_update(&state.db, &state.data_dir)
        .await
        .map_err(|error| AppError::Other(error.to_string()))?;
    let _ = app.emit("library-updated", &outcomes);
    Ok(outcomes)
}
