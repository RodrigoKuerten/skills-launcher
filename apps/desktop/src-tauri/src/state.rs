use crate::db::Db;
use crate::error::AppResult;
use reqwest::Client;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

pub struct AppState {
    pub db: Db,
    pub http: Client,
    pub data_dir: PathBuf,
    pub temp_dir: PathBuf,
    pub github_token: Mutex<Option<String>>,
    pub grants: Mutex<HashSet<PathBuf>>,
    pub install_lock: Mutex<()>,
    pub sync_lock: tokio::sync::Mutex<()>,
}

impl AppState {
    pub fn new(db: Db, data_dir: &Path) -> AppResult<Self> {
        let http = Client::builder()
            .user_agent("SkillsLauncher/0.2 (+https://skillslauncher.app)")
            .timeout(Duration::from_secs(60))
            .connect_timeout(Duration::from_secs(15))
            .build()?;
        let temp_dir = data_dir.join("tmp");
        std::fs::create_dir_all(&temp_dir)?;
        Ok(Self {
            db,
            http,
            data_dir: data_dir.to_path_buf(),
            temp_dir,
            github_token: Mutex::new(None),
            grants: Mutex::new(HashSet::new()),
            install_lock: Mutex::new(()),
            sync_lock: tokio::sync::Mutex::new(()),
        })
    }
}
