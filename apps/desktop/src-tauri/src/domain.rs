use serde::{Deserialize, Serialize};
use serde_json::Value;

pub fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SourceKind {
    GithubRepo,
    GithubOrg,
    LocalDir,
    Zip,
    GitRepo,
    HttpJson,
}

impl SourceKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            SourceKind::GithubRepo => "github_repo",
            SourceKind::GithubOrg => "github_org",
            SourceKind::LocalDir => "local_dir",
            SourceKind::Zip => "zip",
            SourceKind::GitRepo => "git_repo",
            SourceKind::HttpJson => "http_json",
        }
    }

    pub fn from_str(value: &str) -> Option<Self> {
        match value {
            "github_repo" => Some(SourceKind::GithubRepo),
            "github_org" => Some(SourceKind::GithubOrg),
            "local_dir" => Some(SourceKind::LocalDir),
            "zip" => Some(SourceKind::Zip),
            "git_repo" => Some(SourceKind::GitRepo),
            "http_json" => Some(SourceKind::HttpJson),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Source {
    pub id: String,
    pub name: String,
    pub kind: SourceKind,
    pub url: String,
    pub author: String,
    pub description: String,
    pub config: Value,
    pub trust: String,
    pub license: Option<String>,
    pub enabled: bool,
    pub auto_sync: bool,
    pub interval_minutes: i64,
    pub last_sync_at: Option<String>,
    pub last_status: Option<String>,
    pub last_error: Option<String>,
    pub skill_count: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceInput {
    pub name: String,
    pub kind: SourceKind,
    pub url: String,
    #[serde(default)]
    pub author: String,
    #[serde(default)]
    pub description: String,
    #[serde(default = "empty_object")]
    pub config: Value,
    #[serde(default = "default_trust")]
    pub trust: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default = "default_true")]
    pub auto_sync: bool,
    #[serde(default = "default_interval")]
    pub interval_minutes: i64,
}

fn empty_object() -> Value {
    Value::Object(Default::default())
}
fn default_trust() -> String {
    "COMMUNITY".into()
}
fn default_true() -> bool {
    true
}
fn default_interval() -> i64 {
    360
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceRun {
    pub id: String,
    pub source_id: String,
    pub status: String,
    pub found: i64,
    pub created: i64,
    pub updated: i64,
    pub unchanged: i64,
    pub blocked: i64,
    pub error: Option<String>,
    pub started_at: String,
    pub finished_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    pub slug: String,
    pub name: String,
    pub description: String,
    pub icon: String,
    pub sort_order: i64,
    #[serde(default)]
    pub skill_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Finding {
    pub severity: String,
    pub code: String,
    pub message: String,
    pub file: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionSummary {
    pub id: String,
    pub version_label: String,
    pub content_hash: String,
    pub published_at: Option<String>,
    pub created_at: String,
    pub files_count: i64,
    pub security_score: i64,
    pub risk_level: String,
    pub status: String,
    pub commit_ref: Option<String>,
    #[serde(default)]
    pub findings: Vec<Finding>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillHost {
    pub host: String,
    pub status: String,
    pub notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillSummary {
    pub id: String,
    pub slug: String,
    pub name: String,
    pub summary: String,
    pub author: String,
    pub category: Option<String>,
    pub license: Option<String>,
    pub repository_url: String,
    pub source_id: String,
    pub source_name: String,
    pub source_kind: SourceKind,
    pub trust: String,
    pub risk_level: String,
    pub security_score: i64,
    pub quality_score: i64,
    pub stars: i64,
    pub archived: bool,
    pub status: String,
    pub latest_version: Option<VersionSummary>,
    pub hosts: Vec<SkillHost>,
    pub install_count: i64,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillDetail {
    #[serde(flatten)]
    pub skill: SkillSummary,
    pub description: String,
    pub readme: String,
    pub versions: Vec<VersionSummary>,
    pub installations: Vec<Installation>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SkillQuery {
    pub q: Option<String>,
    pub category: Option<String>,
    pub source_id: Option<String>,
    pub host: Option<String>,
    pub risk: Option<String>,
    pub trust: Option<String>,
    pub sort: Option<String>,
    pub page: Option<i64>,
    pub page_size: Option<i64>,
    pub include_blocked: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillPage {
    pub items: Vec<SkillSummary>,
    pub total: i64,
    pub page: i64,
    pub page_size: i64,
    pub pages: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedAgent {
    pub host: String,
    pub name: String,
    pub detected: bool,
    pub executable_path: Option<String>,
    pub version: Option<String>,
    pub config_path: Option<String>,
    pub skills_path: Option<String>,
    pub project_skills_path: Option<String>,
    pub supports_agent_skills: bool,
    pub auto_install: bool,
    pub notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Installation {
    pub id: String,
    pub skill_id: String,
    pub skill_name: String,
    pub skill_slug: String,
    pub version_id: Option<String>,
    pub version_label: Option<String>,
    pub host: String,
    pub install_path: String,
    pub content_hash: String,
    pub status: String,
    pub installed_at: String,
    pub updated_at: String,
    pub latest_version_id: Option<String>,
    pub latest_version_label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Backup {
    pub id: String,
    pub installation_id: Option<String>,
    pub skill_id: Option<String>,
    pub host: Option<String>,
    pub path: String,
    pub version_id: Option<String>,
    pub version_label: Option<String>,
    pub content_hash: Option<String>,
    pub reason: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Operation {
    pub id: String,
    pub kind: String,
    pub skill_id: Option<String>,
    pub host: Option<String>,
    pub status: String,
    pub detail: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateItem {
    pub installation: Installation,
    pub change_summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncSummary {
    pub run_id: String,
    pub source_id: String,
    pub status: String,
    pub found: i64,
    pub created: i64,
    pub updated: i64,
    pub unchanged: i64,
    pub blocked: i64,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub theme: String,
    pub auto_sync: bool,
    pub auto_sync_interval_minutes: i64,
    pub github_token_set: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SettingsInput {
    pub theme: Option<String>,
    pub auto_sync: Option<bool>,
    pub auto_sync_interval_minutes: Option<i64>,
    pub github_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
    pub sources: i64,
    pub enabled_sources: i64,
    pub skills: i64,
    pub blocked_skills: i64,
    pub installed: i64,
    pub updates: i64,
    pub categories: i64,
    pub last_sync_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Bootstrap {
    pub stats: Stats,
    pub sources: Vec<Source>,
    pub categories: Vec<Category>,
    pub settings: Settings,
    pub recent_operations: Vec<Operation>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceExport {
    pub format: String,
    pub version: i64,
    pub exported_at: String,
    pub sources: Vec<SourceInput>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallRequest {
    pub skill_id: String,
    pub version_id: Option<String>,
    pub hosts: Vec<String>,
    #[serde(default)]
    pub allow_risky: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallOutcome {
    pub host: String,
    pub ok: bool,
    pub message: String,
    pub install_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallResponse {
    pub outcomes: Vec<InstallOutcome>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillFile {
    pub path: String,
    pub content: String,
    pub encoding: String,
    #[serde(default)]
    pub sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredSkill {
    pub source_path: String,
    pub name: String,
    pub summary: String,
    pub description: String,
    pub author: String,
    pub license: Option<String>,
    pub repository_url: String,
    pub homepage_url: Option<String>,
    pub category: Option<String>,
    pub commit_ref: Option<String>,
    pub version_label: Option<String>,
    pub source_url: String,
    pub files: Vec<SkillFile>,
    pub readme: String,
    #[serde(default)]
    pub stars: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceSyncResult {
    pub skills: Vec<DiscoveredSkill>,
    pub source_license: Option<String>,
}
