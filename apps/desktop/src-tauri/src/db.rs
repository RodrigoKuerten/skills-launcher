use crate::domain::*;
use crate::error::{AppError, AppResult};
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde_json::json;
use std::path::Path;
use std::sync::Mutex;

pub struct Db {
    conn: Mutex<Connection>,
}

const SCHEMA: &str = r#"
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS categories (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT 'Box',
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  config TEXT NOT NULL DEFAULT '{}',
  trust TEXT NOT NULL DEFAULT 'COMMUNITY',
  license TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  auto_sync INTEGER NOT NULL DEFAULT 1,
  interval_minutes INTEGER NOT NULL DEFAULT 360,
  last_sync_at TEXT,
  last_status TEXT,
  last_error TEXT,
  skill_count INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS source_runs (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  found INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0,
  unchanged INTEGER NOT NULL DEFAULT 0,
  blocked INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  category TEXT,
  license TEXT,
  repository_url TEXT NOT NULL DEFAULT '',
  homepage_url TEXT,
  icon TEXT,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  source_path TEXT NOT NULL,
  latest_version_id TEXT,
  quality_score INTEGER NOT NULL DEFAULT 0,
  security_score INTEGER NOT NULL DEFAULT 100,
  risk_level TEXT NOT NULL DEFAULT 'LOW',
  trust TEXT NOT NULL DEFAULT 'COMMUNITY',
  stars INTEGER NOT NULL DEFAULT 0,
  install_count INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(source_id, source_path)
);
CREATE TABLE IF NOT EXISTS skill_versions (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  version_label TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  commit_ref TEXT,
  files TEXT NOT NULL DEFAULT '[]',
  readme TEXT NOT NULL DEFAULT '',
  license TEXT,
  risk_level TEXT NOT NULL DEFAULT 'LOW',
  security_score INTEGER NOT NULL DEFAULT 100,
  findings TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'PUBLISHED',
  scanner_version TEXT NOT NULL DEFAULT '1',
  source_url TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  published_at TEXT,
  UNIQUE(skill_id, content_hash)
);
CREATE TABLE IF NOT EXISTS skill_hosts (
  skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  host TEXT NOT NULL,
  status TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (skill_id, host)
);
CREATE TABLE IF NOT EXISTS installations (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  version_id TEXT REFERENCES skill_versions(id) ON DELETE SET NULL,
  host TEXT NOT NULL,
  install_path TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'INSTALLED',
  installed_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(host, skill_id, install_path)
);
CREATE TABLE IF NOT EXISTS backups (
  id TEXT PRIMARY KEY,
  installation_id TEXT REFERENCES installations(id) ON DELETE CASCADE,
  skill_id TEXT,
  host TEXT,
  path TEXT NOT NULL,
  version_id TEXT,
  version_label TEXT,
  content_hash TEXT,
  reason TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS operations (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  skill_id TEXT,
  host TEXT,
  status TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_skills_source ON skills(source_id);
CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category);
CREATE INDEX IF NOT EXISTS idx_skills_updated ON skills(updated_at);
CREATE INDEX IF NOT EXISTS idx_skills_name ON skills(name);
CREATE INDEX IF NOT EXISTS idx_versions_skill ON skill_versions(skill_id);
CREATE INDEX IF NOT EXISTS idx_installations_skill ON installations(skill_id);
CREATE INDEX IF NOT EXISTS idx_source_runs_source ON source_runs(source_id, started_at);
CREATE INDEX IF NOT EXISTS idx_operations_created ON operations(created_at);
"#;

const CATEGORIES: &[(&str, &str, &str, &str, i64)] = &[
    (
        "frontend",
        "Frontend",
        "UI engineering, components, state and performance.",
        "Code2",
        1,
    ),
    (
        "backend",
        "Backend",
        "APIs, services, queues and server-side patterns.",
        "Server",
        2,
    ),
    (
        "design",
        "Design & UX",
        "Visual systems, interaction and accessibility.",
        "Palette",
        3,
    ),
    (
        "architecture",
        "Architecture",
        "System design, boundaries and technical decisions.",
        "Layers",
        4,
    ),
    (
        "security",
        "Security",
        "Threat modeling, hardening and secure review.",
        "Shield",
        5,
    ),
    (
        "devops",
        "DevOps",
        "CI/CD, containers, infrastructure and deployment.",
        "Container",
        6,
    ),
    (
        "automation",
        "Automation",
        "Workflows, agents, loops and tool integration.",
        "Zap",
        7,
    ),
    (
        "ai",
        "AI & Agents",
        "Prompting, evaluation, RAG and agent architecture.",
        "Bot",
        8,
    ),
    (
        "database",
        "Database",
        "Schema design, queries, indexes and migrations.",
        "Database",
        9,
    ),
    (
        "testing",
        "Testing & QA",
        "TDD, E2E, coverage and regression prevention.",
        "TestTube2",
        10,
    ),
    (
        "research",
        "Research",
        "Deep research, source evaluation and synthesis.",
        "Search",
        11,
    ),
    (
        "productivity",
        "Productivity",
        "Planning, documentation and workflow discipline.",
        "ListChecks",
        12,
    ),
];

fn column_exists(conn: &Connection, table: &str, column: &str) -> AppResult<bool> {
    let mut statement = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let columns = statement.query_map([], |row| row.get::<_, String>(1))?;
    for name in columns {
        if name? == column {
            return Ok(true);
        }
    }
    Ok(false)
}

impl Db {
    pub fn open(data_dir: &Path) -> AppResult<Self> {
        std::fs::create_dir_all(data_dir)?;
        let conn = Connection::open(data_dir.join("skills-manager.db"))?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        conn.pragma_update(None, "busy_timeout", 5000)?;
        conn.execute_batch(SCHEMA)?;
        if !column_exists(&conn, "sources", "deleted_at")? {
            conn.execute("ALTER TABLE sources ADD COLUMN deleted_at TEXT", [])?;
        }
        if !column_exists(&conn, "backups", "version_id")? {
            conn.execute("ALTER TABLE backups ADD COLUMN version_id TEXT", [])?;
        }
        if !column_exists(&conn, "backups", "reason")? {
            conn.execute(
                "ALTER TABLE backups ADD COLUMN reason TEXT NOT NULL DEFAULT 'manual'",
                [],
            )?;
        }
        conn.execute(
            "UPDATE installations SET status='FAILED' WHERE status='INSTALLING'",
            [],
        )?;
        let recovered_at = now_iso();
        conn.execute(
            "UPDATE source_runs SET status='error',error=COALESCE(error,'Interrupted by app restart'),finished_at=?1 WHERE status='running'",
            params![recovered_at],
        )?;
        conn.execute(
            "UPDATE sources SET last_status='error',last_error=COALESCE(last_error,'Interrupted by app restart') WHERE last_status='running'",
            [],
        )?;
        conn.execute(
            "UPDATE skill_versions SET version_label=substr(content_hash,1,8) WHERE version_label IN ('main','master','')",
            [],
        )?;
        conn.execute(
            "UPDATE installations SET install_path=substr(install_path,5) WHERE install_path LIKE ?1 AND substr(install_path,6,1)=':'",
            params![r"\\?\%"],
        )?;
        conn.execute(
            "UPDATE sources SET url=substr(url,5) WHERE kind IN ('local_dir','zip') AND url LIKE ?1 AND substr(url,6,1)=':'",
            params![r"\\?\%"],
        )?;
        let db = Self {
            conn: Mutex::new(conn),
        };
        db.seed()?;
        Ok(db)
    }

    pub fn with_conn<T>(&self, f: impl FnOnce(&Connection) -> AppResult<T>) -> AppResult<T> {
        let guard = self
            .conn
            .lock()
            .map_err(|_| AppError::Other("Database lock poisoned".into()))?;
        f(&guard)
    }

    pub fn with_tx<T>(&self, f: impl FnOnce(&mut Transaction<'_>) -> AppResult<T>) -> AppResult<T> {
        let mut guard = self
            .conn
            .lock()
            .map_err(|_| AppError::Other("Database lock poisoned".into()))?;
        let mut tx = guard.transaction()?;
        let result = f(&mut tx)?;
        tx.commit()?;
        Ok(result)
    }

    fn seed(&self) -> AppResult<()> {
        self.with_conn(|conn| {
            for (slug, name, description, icon, sort) in CATEGORIES {
                conn.execute(
                    "INSERT OR IGNORE INTO categories(slug,name,description,icon,sort_order) VALUES (?1,?2,?3,?4,?5)",
                    params![slug, name, description, icon, sort],
                )?;
            }
            let defaults = [
                ("theme", "dark"),
                ("auto_sync", "false"),
                ("auto_sync_interval_minutes", "360"),
            ];
            for (key, value) in defaults {
                conn.execute(
                    "INSERT OR IGNORE INTO settings(key,value) VALUES (?1,?2)",
                    params![key, value],
                )?;
            }
            let count: i64 = conn.query_row("SELECT COUNT(*) FROM sources", [], |row| row.get(0))?;
            if count == 0 {
                let now = now_iso();
                let seed_sources: &[(&str, &str, &str, &str, &str, &str, &str)] = &[
                    ("anthropics-skills", "Anthropic Skills", "github_repo", "https://github.com/anthropics/skills", "skills", "OFFICIAL", "Official Agent Skills from Anthropic."),
                    ("openai-skills", "OpenAI Skills", "github_repo", "https://github.com/openai/skills", "skills/.curated", "OFFICIAL", "Curated skills for OpenAI Codex."),
                    ("microsoft-skills", "Microsoft Skills", "github_repo", "https://github.com/microsoft/skills", ".github/skills", "OFFICIAL", "Skills, agents and MCP grounding from Microsoft."),
                    ("huggingface-skills", "Hugging Face Skills", "github_repo", "https://github.com/huggingface/skills", "skills", "OFFICIAL", "Skills for the Hugging Face ecosystem."),
                    ("vercel-agent-skills", "Vercel Agent Skills", "github_repo", "https://github.com/vercel-labs/agent-skills", "skills", "VERIFIED", "Agent skills from Vercel Labs."),
                ];
                for (id, name, kind, url, path, trust, description) in seed_sources {
                    let repo = url.trim_start_matches("https://github.com/");
                    conn.execute(
                        "INSERT INTO sources(id,name,kind,url,author,description,config,trust,enabled,auto_sync,interval_minutes,skill_count,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,1,0,360,0,?9,?9)",
                        params![
                            id,
                            name,
                            kind,
                            url,
                            repo.split('/').next().unwrap_or(""),
                            description,
                            json!({"repo": repo, "branch": "", "path": path}).to_string(),
                            trust,
                            now
                        ],
                    )?;
                }
            }
            Ok(())
        })
    }

    pub fn get_setting(&self, key: &str) -> AppResult<Option<String>> {
        self.with_conn(|conn| {
            Ok(conn
                .query_row(
                    "SELECT value FROM settings WHERE key=?1",
                    params![key],
                    |row| row.get(0),
                )
                .optional()?)
        })
    }

    pub fn set_setting(&self, key: &str, value: &str) -> AppResult<()> {
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO settings(key,value) VALUES (?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                params![key, value],
            )?;
            Ok(())
        })
    }

    pub fn settings(&self) -> AppResult<Settings> {
        let theme = self.get_setting("theme")?.unwrap_or_else(|| "dark".into());
        let auto_sync = self.get_setting("auto_sync")?.as_deref() == Some("true");
        let interval = self
            .get_setting("auto_sync_interval_minutes")?
            .and_then(|value| value.parse().ok())
            .unwrap_or(360);
        Ok(Settings {
            theme,
            auto_sync,
            auto_sync_interval_minutes: interval,
            github_token_set: false,
        })
    }

    pub fn apply_settings(&self, input: &SettingsInput) -> AppResult<Settings> {
        if let Some(theme) = &input.theme {
            if theme != "dark" && theme != "light" {
                return Err(AppError::Validation("Theme must be dark or light".into()));
            }
            self.set_setting("theme", theme)?;
        }
        if let Some(auto_sync) = input.auto_sync {
            self.set_setting("auto_sync", if auto_sync { "true" } else { "false" })?;
        }
        if let Some(interval) = input.auto_sync_interval_minutes {
            if !(30..=10080).contains(&interval) {
                return Err(AppError::Validation(
                    "Sync interval must be between 30 and 10080 minutes".into(),
                ));
            }
            self.set_setting("auto_sync_interval_minutes", &interval.to_string())?;
        }
        self.settings()
    }

    pub fn list_sources(&self) -> AppResult<Vec<Source>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id,name,kind,url,author,description,config,trust,license,enabled,auto_sync,interval_minutes,last_sync_at,last_status,last_error,skill_count,created_at,updated_at FROM sources WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE",
            )?;
            let rows = stmt.query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, String>(7)?,
                    row.get::<_, Option<String>>(8)?,
                    row.get::<_, i64>(9)?,
                    row.get::<_, i64>(10)?,
                    row.get::<_, i64>(11)?,
                    row.get::<_, Option<String>>(12)?,
                    row.get::<_, Option<String>>(13)?,
                    row.get::<_, Option<String>>(14)?,
                    row.get::<_, i64>(15)?,
                    row.get::<_, String>(16)?,
                    row.get::<_, String>(17)?,
                ))
            })?;
            let mut sources = Vec::new();
            for row in rows {
                let row = row?;
                sources.push(Source {
                    id: row.0,
                    name: row.1,
                    kind: SourceKind::from_str(&row.2).ok_or_else(|| AppError::Validation("Unknown source kind".into()))?,
                    url: row.3,
                    author: row.4,
                    description: row.5,
                    config: serde_json::from_str(&row.6).unwrap_or_else(|_| json!({})),
                    trust: row.7,
                    license: row.8,
                    enabled: row.9 != 0,
                    auto_sync: row.10 != 0,
                    interval_minutes: row.11,
                    last_sync_at: row.12,
                    last_status: row.13,
                    last_error: row.14,
                    skill_count: row.15,
                    created_at: row.16,
                    updated_at: row.17,
                });
            }
            Ok(sources)
        })
    }

    pub fn list_categories(&self) -> AppResult<Vec<Category>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT c.slug,c.name,c.description,c.icon,c.sort_order,(SELECT COUNT(*) FROM skills s JOIN sources src ON src.id=s.source_id WHERE s.category=c.slug AND s.status IN ('ACTIVE','QUARANTINED') AND src.deleted_at IS NULL) FROM categories c ORDER BY c.sort_order",
            )?;
            let rows = stmt.query_map([], |row| {
                Ok(Category {
                    slug: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    icon: row.get(3)?,
                    sort_order: row.get(4)?,
                    skill_count: row.get(5)?,
                })
            })?;
            let mut categories = Vec::new();
            for row in rows {
                categories.push(row?);
            }
            Ok(categories)
        })
    }

    pub fn stats(&self) -> AppResult<Stats> {
        self.with_conn(|conn| {
            let sources = conn.query_row("SELECT COUNT(*) FROM sources WHERE deleted_at IS NULL", [], |row| row.get(0))?;
            let enabled_sources = conn.query_row("SELECT COUNT(*) FROM sources WHERE enabled=1 AND deleted_at IS NULL", [], |row| row.get(0))?;
            let skills = conn.query_row(
                "SELECT COUNT(*) FROM skills s JOIN sources src ON src.id=s.source_id WHERE src.deleted_at IS NULL AND s.status IN ('ACTIVE','QUARANTINED')",
                [],
                |row| row.get(0),
            )?;
            let blocked_skills = conn.query_row(
                "SELECT COUNT(*) FROM skills s JOIN sources src ON src.id=s.source_id WHERE src.deleted_at IS NULL AND s.status IN ('ACTIVE','QUARANTINED') AND (s.status='QUARANTINED' OR s.risk_level IN ('HIGH','CRITICAL'))",
                [],
                |row| row.get(0),
            )?;
            let quarantined_skills = conn.query_row(
                "SELECT COUNT(*) FROM skills s JOIN sources src ON src.id=s.source_id WHERE src.deleted_at IS NULL AND s.status='QUARANTINED'",
                [],
                |row| row.get(0),
            )?;
            let installed = conn.query_row(
                "SELECT COUNT(*) FROM installations WHERE status='INSTALLED'",
                [],
                |row| row.get(0),
            )?;
            let updates = conn.query_row(
                "SELECT COUNT(*) FROM installations i JOIN skills s ON s.id=i.skill_id JOIN skill_versions lv ON lv.id=s.latest_version_id WHERE i.status='INSTALLED' AND s.latest_version_id IS NOT NULL AND (i.version_id IS NULL OR i.version_id <> s.latest_version_id) AND lv.status='PUBLISHED' AND lv.risk_level NOT IN ('HIGH','CRITICAL')",
                [],
                |row| row.get(0),
            )?;
            let categories = conn.query_row("SELECT COUNT(*) FROM categories", [], |row| row.get(0))?;
            let last_sync_at = conn
                .query_row("SELECT MAX(last_sync_at) FROM sources WHERE deleted_at IS NULL", [], |row| row.get::<_, Option<String>>(0))
                .optional()?
                .flatten();
            Ok(Stats {
                sources,
                enabled_sources,
                skills,
                blocked_skills,
                quarantined_skills,
                installed,
                updates,
                categories,
                last_sync_at,
            })
        })
    }

    pub fn recent_operations(&self, limit: i64) -> AppResult<Vec<Operation>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id,kind,skill_id,host,status,detail,created_at FROM operations ORDER BY created_at DESC LIMIT ?1",
            )?;
            let rows = stmt.query_map(params![limit], |row| {
                Ok(Operation {
                    id: row.get(0)?,
                    kind: row.get(1)?,
                    skill_id: row.get(2)?,
                    host: row.get(3)?,
                    status: row.get(4)?,
                    detail: row.get(5)?,
                    created_at: row.get(6)?,
                })
            })?;
            let mut operations = Vec::new();
            for row in rows {
                operations.push(row?);
            }
            Ok(operations)
        })
    }

    pub fn log_operation(
        &self,
        kind: &str,
        skill_id: Option<&str>,
        host: Option<&str>,
        status: &str,
        detail: Option<&str>,
    ) -> AppResult<()> {
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO operations(id,kind,skill_id,host,status,detail,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)",
                params![uuid::Uuid::new_v4().to_string(), kind, skill_id, host, status, detail, now_iso()],
            )?;
            Ok(())
        })
    }
}
