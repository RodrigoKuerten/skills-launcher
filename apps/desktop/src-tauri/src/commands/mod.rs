use crate::domain::{Bootstrap, Category, Settings, Source, Stats};
use crate::error::{AppError, AppResult};
use crate::state::AppState;

pub use agents::*;
pub use core::*;
pub use sources::*;

mod agents;
mod core;
mod sources;

pub fn settings_with_token(state: &AppState) -> AppResult<Settings> {
    let mut settings = state.db.settings()?;
    settings.github_token_set = state
        .github_token
        .lock()
        .map_err(|_| AppError::Other("Token lock poisoned".into()))?
        .is_some();
    Ok(settings)
}

fn bootstrap_with_state(state: &AppState) -> AppResult<Bootstrap> {
    Ok(Bootstrap {
        stats: state.db.stats()?,
        sources: state.db.list_sources()?,
        categories: state.db.list_categories()?,
        settings: settings_with_token(state)?,
        recent_operations: state.db.recent_operations(8)?,
    })
}

fn stats_for_state(state: &AppState) -> AppResult<Stats> {
    state.db.stats()
}

fn categories_for_state(state: &AppState) -> AppResult<Vec<Category>> {
    state.db.list_categories()
}

fn sources_for_state(state: &AppState) -> AppResult<Vec<Source>> {
    state.db.list_sources()
}
