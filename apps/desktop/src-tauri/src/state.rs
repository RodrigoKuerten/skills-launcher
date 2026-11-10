use crate::db::Db;
use crate::error::AppResult;
use reqwest::Client;
use std::time::Duration;

pub struct AppState {
    pub db: Db,
    pub http: Client,
}

impl AppState {
    pub fn new(db: Db) -> AppResult<Self> {
        let http = Client::builder()
            .user_agent("SkillsLauncher/0.2 (+https://skillslauncher.app)")
            .timeout(Duration::from_secs(60))
            .connect_timeout(Duration::from_secs(15))
            .build()?;
        Ok(Self { db, http })
    }
}
