use super::{configured_skills_root, descriptor, user_skills_root};
use crate::db::Db;
use crate::domain::{
    Backup, DetectedAgent, InstallOutcome, InstallRequest, InstallResponse, SkillFile,
};
use crate::error::{AppError, AppResult};
use crate::sources::{content_hash, safe_relative_path};
use rusqlite::{params, OptionalExtension};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

const MAX_BACKUP_FILES: usize = 500;
const MAX_BACKUP_BYTES: u64 = 64 * 1024 * 1024;
const MAX_EXTRA_FILES: usize = 300;
const MAX_EXTRA_BYTES: u64 = 16 * 1024 * 1024;

struct SkillInfo {
    id: String,
    slug: String,
    name: String,
    latest_version_id: Option<String>,
}

struct VersionPayload {
    id: String,
    label: String,
    content_hash: String,
    files: Vec<SkillFile>,
    risk_level: String,
    status: String,
}

struct InstallationRow {
    id: String,
    skill_id: String,
    host: String,
    install_path: String,
}

pub fn install_skill(
    db: &Db,
    data_dir: &Path,
    request: &InstallRequest,
    detected: &[DetectedAgent],
) -> AppResult<InstallResponse> {
    if request.hosts.is_empty() {
        return Err(AppError::Validation("Choose at least one agent".into()));
    }
    let skill = load_skill(db, &request.skill_id)?;
    let version = load_version(db, &skill, request.version_id.as_deref())?;
    if (version.status == "QUARANTINED"
        || matches!(version.risk_level.as_str(), "HIGH" | "CRITICAL"))
        && !request.allow_risky
    {
        return Err(AppError::Security(
            "This version is quarantined. Review the findings and explicitly allow it to continue."
                .into(),
        ));
    }
    let mut outcomes = Vec::new();
    let mut seen = std::collections::BTreeSet::new();
    for host in &request.hosts {
        if !seen.insert(host.clone()) {
            continue;
        }
        let Some(agent) = detected.iter().find(|agent| &agent.host == host) else {
            outcomes.push(failed(host, "Unknown agent"));
            continue;
        };
        if !agent.detected {
            outcomes.push(failed(host, "Agent was not detected on this machine"));
            continue;
        }
        if !agent.supports_agent_skills {
            outcomes.push(failed(host, "This agent does not support Agent Skills"));
            continue;
        }
        outcomes.push(install_one(
            db,
            data_dir,
            &skill,
            &version,
            agent,
            "pre_install",
        ));
    }
    db.log_operation(
        "install",
        Some(&skill.id),
        None,
        if outcomes.iter().any(|outcome| outcome.ok) {
            "success"
        } else {
            "error"
        },
        Some(&format!(
            "{} to {} agent(s)",
            version.label,
            outcomes.iter().filter(|outcome| outcome.ok).count()
        )),
    )?;
    Ok(InstallResponse { outcomes })
}

pub fn update_installation(
    db: &Db,
    data_dir: &Path,
    id: &str,
    detected: &[DetectedAgent],
) -> AppResult<InstallResponse> {
    let installation = load_installation(db, id)?;
    let skill = load_skill(db, &installation.skill_id)?;
    let Some(agent) = detected
        .iter()
        .find(|agent| agent.host == installation.host)
    else {
        return Ok(InstallResponse {
            outcomes: vec![failed(&installation.host, "Unknown agent")],
        });
    };
    if !agent.detected {
        return Ok(InstallResponse {
            outcomes: vec![failed(&installation.host, "Agent was not detected")],
        });
    }
    let expected = match &agent.skills_path {
        Some(path) => PathBuf::from(path),
        None => user_skills_root(descriptor(&installation.host)?)?,
    }
    .join(&skill.slug);
    if Path::new(&installation.install_path) != expected.as_path() {
        return Err(AppError::Validation(
            "The installed path changed. Uninstall it before installing again.".into(),
        ));
    }
    let version = load_version(db, &skill, None)?;
    if version.status == "QUARANTINED" || matches!(version.risk_level.as_str(), "HIGH" | "CRITICAL")
    {
        return Err(AppError::Security(
            "The latest version is quarantined and cannot be auto-updated.".into(),
        ));
    }
    let outcome = install_one(db, data_dir, &skill, &version, agent, "pre_update");
    db.log_operation(
        "update",
        Some(&skill.id),
        Some(&installation.host),
        if outcome.ok { "success" } else { "error" },
        Some(&format!("{}: {}", skill.name, outcome.message)),
    )?;
    Ok(InstallResponse {
        outcomes: vec![outcome],
    })
}

pub fn uninstall_skill(db: &Db, data_dir: &Path, id: &str, remove_files: bool) -> AppResult<()> {
    let installation = load_installation(db, id)?;
    let root = configured_skills_root(db, &installation.host)?;
    let target = PathBuf::from(&installation.install_path);
    let root = canonical_or_create(&root)?;
    let home = home_canonical()?;
    if !root.starts_with(&home) {
        return Err(AppError::Security(
            "Install path is outside the home directory".into(),
        ));
    }
    ensure_target_under(&root, &target)?;
    if remove_files && target.exists() {
        reject_reparse(&target)?;
        create_backup(
            db,
            data_dir,
            &target,
            &installation.skill_id,
            &installation.host,
            &installation.id,
            None,
            None,
            "pre_remove",
        )?;
        std::fs::remove_dir_all(&target)?;
    }
    db.with_conn(|conn| {
        conn.execute(
            "UPDATE installations SET status='REMOVED',updated_at=?1 WHERE id=?2",
            params![now_iso(), installation.id],
        )?;
        conn.execute(
            "UPDATE skills SET install_count=(SELECT COUNT(*) FROM installations WHERE skill_id=?1 AND status='INSTALLED') WHERE id=?1",
            params![installation.skill_id],
        )?;
        Ok(())
    })?;
    db.log_operation(
        "remove",
        Some(&installation.skill_id),
        Some(&installation.host),
        "success",
        Some(if remove_files {
            "Files removed"
        } else {
            "Installation record removed"
        }),
    )?;
    Ok(())
}

pub fn rollback_installation(
    db: &Db,
    data_dir: &Path,
    id: &str,
    backup_id: Option<&str>,
) -> AppResult<InstallResponse> {
    let installation = load_installation(db, id)?;
    let backup = load_backup(db, backup_id, &installation)?;
    let root = canonical_or_create(&configured_skills_root(db, &installation.host)?)?;
    let target = PathBuf::from(&installation.install_path);
    ensure_target_under(&root, &target)?;
    reject_reparse(&target)?;
    restore_backup(db, data_dir, &installation, &backup, &root, &target)
}

fn restore_backup(
    db: &Db,
    data_dir: &Path,
    installation: &InstallationRow,
    backup: &BackupRow,
    root: &Path,
    target: &Path,
) -> AppResult<InstallResponse> {
    let backup_path = PathBuf::from(&backup.path);
    if !backup_path.is_dir() {
        return Err(AppError::Validation("Backup files are missing".into()));
    }
    if let Some(expected) = &backup.content_hash {
        let actual = hash_tree(&backup_path)?;
        if &actual != expected {
            return Err(AppError::Security(
                "Backup content failed its integrity check".into(),
            ));
        }
    }
    create_backup(
        db,
        data_dir,
        target,
        &installation.skill_id,
        &installation.host,
        &installation.id,
        None,
        None,
        "pre_rollback",
    )?;
    let staging = staging_path(root, &target.to_string_lossy());
    if staging.exists() {
        let _ = std::fs::remove_dir_all(&staging);
    }
    copy_tree(&backup_path, &staging)?;
    swap(root, target, &staging)?;

    let version_label = backup.version_label.clone();
    let content_hash = backup.content_hash.clone();
    db.with_conn(|conn| {
        conn.execute(
            "UPDATE installations SET version_id=?1,content_hash=COALESCE(?2,content_hash),status='INSTALLED',updated_at=?3 WHERE id=?4",
            params![backup.version_id, content_hash, now_iso(), installation.id],
        )?;
        Ok(())
    })?;
    db.log_operation(
        "rollback",
        Some(&installation.skill_id),
        Some(&installation.host),
        "success",
        Some(&format!(
            "Rolled back to {}",
            version_label.clone().unwrap_or_else(|| "backup".into())
        )),
    )?;
    Ok(InstallResponse {
        outcomes: vec![InstallOutcome {
            host: installation.host.clone(),
            ok: true,
            message: "Rolled back to the selected backup".into(),
            install_path: Some(target.to_string_lossy().to_string()),
        }],
    })
}

pub fn list_backups(db: &Db, installation_id: Option<&str>) -> AppResult<Vec<Backup>> {
    db.with_conn(|conn| {
        let (sql, values): (&str, Vec<String>) = match installation_id {
            Some(id) => (
                "SELECT id,installation_id,skill_id,host,path,version_id,version_label,content_hash,reason,created_at FROM backups WHERE installation_id=?1 ORDER BY created_at DESC LIMIT 50",
                vec![id.to_string()],
            ),
            None => (
                "SELECT id,installation_id,skill_id,host,path,version_id,version_label,content_hash,reason,created_at FROM backups ORDER BY created_at DESC LIMIT 50",
                Vec::new(),
            ),
        };
        let mut statement = conn.prepare(sql)?;
        let rows = statement.query_map(rusqlite::params_from_iter(values), |row| {
            Ok(Backup {
                id: row.get(0)?,
                installation_id: row.get(1)?,
                skill_id: row.get(2)?,
                host: row.get(3)?,
                path: row.get(4)?,
                version_id: row.get(5)?,
                version_label: row.get(6)?,
                content_hash: row.get(7)?,
                reason: row.get(8)?,
                created_at: row.get(9)?,
            })
        })?;
        let mut backups = Vec::new();
        for row in rows {
            backups.push(row?);
        }
        Ok(backups)
    })
}

pub async fn auto_update(db: &Db, data_dir: &Path) -> AppResult<Vec<InstallOutcome>> {
    let detected = super::detect_all(db).await?;
    let rows = db.with_conn(|conn| {
        let mut statement = conn.prepare(
            "SELECT i.id,i.skill_id,i.host,i.install_path FROM installations i WHERE i.status='INSTALLED'",
        )?;
        let rows = statement.query_map([], |row| {
            Ok(InstallationRow {
                id: row.get(0)?,
                skill_id: row.get(1)?,
                host: row.get(2)?,
                install_path: row.get(3)?,
            })
        })?;
        let mut installations = Vec::new();
        for row in rows {
            installations.push(row?);
        }
        Ok(installations)
    })?;
    let mut outcomes = Vec::new();
    for installation in rows {
        let Some(agent) = detected
            .iter()
            .find(|agent| agent.host == installation.host && agent.detected && agent.auto_install)
        else {
            continue;
        };
        let skill = load_skill(db, &installation.skill_id)?;
        let Some(latest) = skill.latest_version_id.as_ref() else {
            continue;
        };
        let current: Option<String> = db.with_conn(|conn| {
            Ok(conn
                .query_row(
                    "SELECT version_id FROM installations WHERE id=?1",
                    params![installation.id],
                    |row| row.get(0),
                )
                .optional()?
                .flatten())
        })?;
        if current.as_deref() == Some(latest) {
            continue;
        }
        let version = load_version(db, &skill, Some(latest))?;
        if version.status == "QUARANTINED"
            || matches!(version.risk_level.as_str(), "HIGH" | "CRITICAL")
        {
            continue;
        }
        outcomes.push(install_one(
            db,
            data_dir,
            &skill,
            &version,
            agent,
            "pre_update",
        ));
    }
    Ok(outcomes)
}

fn install_one(
    db: &Db,
    data_dir: &Path,
    skill: &SkillInfo,
    version: &VersionPayload,
    agent: &DetectedAgent,
    reason: &str,
) -> InstallOutcome {
    let result = (|| -> AppResult<String> {
        let root = match &agent.skills_path {
            Some(path) => canonical_or_create(Path::new(path))?,
            None => canonical_or_create(&user_skills_root(descriptor(&agent.host)?)?)?,
        };
        let home = home_canonical()?;
        if !root.starts_with(&home) {
            return Err(AppError::Security(
                "Agent skill root is outside the home directory".into(),
            ));
        }
        install_to_root(db, data_dir, skill, version, agent, reason, &root)
    })();
    match result {
        Ok(path) => InstallOutcome {
            host: agent.host.clone(),
            ok: true,
            message: format!("{} is ready", skill.name),
            install_path: Some(path),
        },
        Err(error) => failed(&agent.host, &error.to_string()),
    }
}

fn install_to_root(
    db: &Db,
    data_dir: &Path,
    skill: &SkillInfo,
    version: &VersionPayload,
    agent: &DetectedAgent,
    reason: &str,
    root: &Path,
) -> AppResult<String> {
    if safe_relative_path(&skill.slug).is_none() || skill.slug.contains('/') {
        return Err(AppError::Security(
            "Skill slug is not a safe directory name".into(),
        ));
    }
    let target = root.join(&skill.slug);
    ensure_target_under(root, &target)?;
    reject_reparse(&target)?;
    let target_exists = target.exists();
    let (installation_id, managed, previous_version_id, previous_label) =
        ensure_installation(db, skill, version, &agent.host, &target, target_exists)?;
    let mut failure_guard = FailedInstallGuard {
        db,
        installation_id: &installation_id,
        armed: true,
    };
    if target_exists && !managed {
        return Err(AppError::Security(format!(
            "A folder already exists at {} and is not managed by Skills Launcher",
            target.display()
        )));
    }
    if target_exists {
        create_backup(
            db,
            data_dir,
            &target,
            &skill.id,
            &agent.host,
            &installation_id,
            previous_version_id.as_deref(),
            previous_label.as_deref(),
            reason,
        )?;
    }
    let staging = staging_path(root, &target.to_string_lossy());
    if staging.exists() {
        let _ = std::fs::remove_dir_all(&staging);
    }
    if let Err(error) = write_staging(&staging, version) {
        let _ = std::fs::remove_dir_all(&staging);
        mark_failed(db, &installation_id);
        return Err(error);
    }
    if target_exists && managed {
        let previous_files = if let Some(previous_version_id) = &previous_version_id {
            managed_files_for_version(db, previous_version_id)?
        } else {
            std::collections::BTreeSet::new()
        };
        if let Err(error) = copy_extras(&target, &staging, version, &previous_files) {
            let _ = std::fs::remove_dir_all(&staging);
            mark_failed(db, &installation_id);
            return Err(error);
        }
    }
    if let Err(error) = swap(root, &target, &staging) {
        let _ = std::fs::remove_dir_all(&staging);
        mark_failed(db, &installation_id);
        return Err(error);
    }
    db.with_conn(|conn| {
        conn.execute(
            "UPDATE installations SET version_id=?1,content_hash=?2,status='INSTALLED',updated_at=?3 WHERE id=?4",
            params![version.id, version.content_hash, now_iso(), installation_id],
        )?;
        conn.execute(
            "UPDATE skills SET install_count=(SELECT COUNT(*) FROM installations WHERE skill_id=?1 AND status='INSTALLED') WHERE id=?1",
            params![skill.id],
        )?;
        Ok(())
    })?;
    db.log_operation(
        "install",
        Some(&skill.id),
        Some(&agent.host),
        "success",
        Some(&format!("{} installed at {}", skill.name, target.display())),
    )?;
    failure_guard.armed = false;
    Ok(target.to_string_lossy().to_string())
}

struct FailedInstallGuard<'a> {
    db: &'a Db,
    installation_id: &'a str,
    armed: bool,
}

impl Drop for FailedInstallGuard<'_> {
    fn drop(&mut self) {
        if self.armed {
            mark_failed(self.db, self.installation_id);
        }
    }
}

fn managed_files_for_version(
    db: &Db,
    version_id: &str,
) -> AppResult<std::collections::BTreeSet<String>> {
    let files: String = db.with_conn(|conn| {
        Ok(conn.query_row(
            "SELECT files FROM skill_versions WHERE id=?1",
            params![version_id],
            |row| row.get(0),
        )?)
    })?;
    let files: Vec<SkillFile> = serde_json::from_str(&files).map_err(|error| {
        AppError::Validation(format!("Stored skill files are invalid: {error}"))
    })?;
    Ok(files
        .into_iter()
        .map(|file| file.path.to_ascii_lowercase())
        .collect())
}

fn load_skill(db: &Db, id: &str) -> AppResult<SkillInfo> {
    db.with_conn(|conn| {
        conn.query_row(
            "SELECT s.id,s.slug,s.name,s.latest_version_id FROM skills s JOIN sources src ON src.id=s.source_id WHERE s.id=?1 AND src.deleted_at IS NULL AND s.status <> 'ARCHIVED'",
            params![id],
            |row| {
                Ok(SkillInfo {
                    id: row.get(0)?,
                    slug: row.get(1)?,
                    name: row.get(2)?,
                    latest_version_id: row.get(3)?,
                })
            },
        )
        .optional()?
        .ok_or_else(|| AppError::NotFound("Skill not found".into()))
    })
}

fn load_version(db: &Db, skill: &SkillInfo, version_id: Option<&str>) -> AppResult<VersionPayload> {
    let id = version_id
        .map(str::to_string)
        .or(skill.latest_version_id.clone())
        .ok_or_else(|| AppError::NotFound("This skill has no published version".into()))?;
    db.with_conn(|conn| {
        let row = conn
            .query_row(
                "SELECT id,version_label,content_hash,files,risk_level,status FROM skill_versions WHERE id=?1 AND skill_id=?2",
                params![id, skill.id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, String>(4)?,
                        row.get::<_, String>(5)?,
                    ))
                },
            )
            .optional()?
            .ok_or_else(|| AppError::NotFound("Skill version not found".into()))?;
        let files: Vec<SkillFile> = serde_json::from_str(&row.3)
            .map_err(|error| AppError::Validation(format!("Stored skill files are invalid: {error}")))?;
        if content_hash(&files) != row.2 {
            return Err(AppError::Security("Stored skill content failed its hash check".into()));
        }
        Ok(VersionPayload {
            id: row.0,
            label: row.1,
            content_hash: row.2,
            files,
            risk_level: row.4,
            status: row.5,
        })
    })
}

fn ensure_installation(
    db: &Db,
    skill: &SkillInfo,
    version: &VersionPayload,
    host: &str,
    target: &Path,
    target_exists: bool,
) -> AppResult<(String, bool, Option<String>, Option<String>)> {
    let path = target.to_string_lossy().to_string();
    let existing: Option<(String, Option<String>, Option<String>)> = db.with_conn(|conn| {
        Ok(conn
            .query_row(
                "SELECT i.id,i.version_id,v.version_label FROM installations i LEFT JOIN skill_versions v ON v.id=i.version_id WHERE i.host=?1 AND i.skill_id=?2 AND i.install_path=?3 AND i.status <> 'REMOVED'",
                params![host, skill.id, path],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .optional()?)
    })?;
    if let Some((id, version_id, version_label)) = existing {
        db.with_conn(|conn| {
            conn.execute(
                "UPDATE installations SET status='INSTALLING',updated_at=?1 WHERE id=?2",
                params![now_iso(), id],
            )?;
            Ok(())
        })?;
        return Ok((id, true, version_id, version_label));
    }
    if target_exists {
        return Ok((String::new(), false, None, None));
    }
    let id = uuid::Uuid::new_v4().to_string();
    db.with_conn(|conn| {
        conn.execute(
            "INSERT INTO installations(id,skill_id,version_id,host,install_path,content_hash,status,installed_at,updated_at) VALUES (?1,?2,NULL,?3,?4,?5,'INSTALLING',?6,?6)",
            params![id, skill.id, host, path, version.content_hash, now_iso()],
        )?;
        Ok(())
    })?;
    Ok((id, true, None, None))
}

fn mark_failed(db: &Db, installation_id: &str) {
    let _ = db.with_conn(|conn| {
        conn.execute(
            "UPDATE installations SET status='FAILED',updated_at=?1 WHERE id=?2",
            params![now_iso(), installation_id],
        )?;
        Ok(())
    });
}

#[allow(clippy::too_many_arguments)]
fn create_backup(
    db: &Db,
    data_dir: &Path,
    source: &Path,
    skill_id: &str,
    host: &str,
    installation_id: &str,
    version_id: Option<&str>,
    version_label: Option<&str>,
    reason: &str,
) -> AppResult<String> {
    if !source.exists() {
        return Ok(String::new());
    }
    reject_reparse(source)?;
    let id = uuid::Uuid::new_v4().to_string();
    let destination = data_dir.join("backups").join(&id);
    let manifest_path = data_dir.join("backups").join(format!("{id}.json"));
    if destination.exists() {
        return Err(AppError::Other("Backup path collision".into()));
    }
    let result = (|| -> AppResult<()> {
        std::fs::create_dir_all(&destination)?;
        let (files, bytes, hash) = copy_tree_manifest(source, &destination)?;
        let manifest = json!({
            "versionId": version_id,
            "versionLabel": version_label,
            "contentHash": hash,
            "files": files,
            "bytes": bytes
        });
        std::fs::write(&manifest_path, serde_json::to_vec_pretty(&manifest)?)?;
        db.with_conn(|conn| {
            conn.execute(
                "INSERT INTO backups(id,installation_id,skill_id,host,path,version_id,version_label,content_hash,reason,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
                params![
                    id,
                    installation_id,
                    skill_id,
                    host,
                    destination.to_string_lossy().to_string(),
                    version_id,
                    version_label,
                    hash,
                    reason,
                    now_iso()
                ],
            )?;
            Ok(())
        })?;
        Ok(())
    })();
    if let Err(error) = result {
        let _ = std::fs::remove_dir_all(&destination);
        let _ = std::fs::remove_file(&manifest_path);
        return Err(error);
    }
    Ok(destination.to_string_lossy().to_string())
}

fn write_staging(staging: &Path, version: &VersionPayload) -> AppResult<()> {
    std::fs::create_dir_all(staging)?;
    for file in &version.files {
        let Some(path) = safe_relative_path(&file.path) else {
            return Err(AppError::Security(format!(
                "Unsafe skill file path: {}",
                file.path
            )));
        };
        let target = staging.join(path);
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(target, &file.content)?;
    }
    Ok(())
}

fn copy_extras(
    source: &Path,
    staging: &Path,
    version: &VersionPayload,
    previous_files: &std::collections::BTreeSet<String>,
) -> AppResult<()> {
    let mut managed: std::collections::BTreeSet<String> = version
        .files
        .iter()
        .map(|file| file.path.to_ascii_lowercase())
        .collect();
    managed.extend(previous_files.iter().cloned());
    let mut count = 0;
    let mut bytes = 0u64;
    for entry in WalkDir::new(source).follow_links(false) {
        let entry = entry.map_err(|error| {
            AppError::Validation(format!("Could not read installed skill: {error}"))
        })?;
        if !entry.file_type().is_file() {
            continue;
        }
        let relative = entry
            .path()
            .strip_prefix(source)
            .map_err(|_| AppError::Security("Installed file escaped its root".into()))?
            .to_string_lossy()
            .replace('\\', "/");
        if managed.contains(&relative.to_ascii_lowercase()) {
            continue;
        }
        let Some(safe) = safe_relative_path(&relative) else {
            return Err(AppError::Validation(format!(
                "Cannot preserve user file with an unsafe path: {relative}"
            )));
        };
        let metadata = entry.metadata().map_err(|error| {
            AppError::Validation(format!("Could not read installed file: {error}"))
        })?;
        if crate::paths::is_reparse(&metadata) {
            return Err(AppError::Security(
                "Reparse-point files are not allowed in skill folders".into(),
            ));
        }
        bytes += metadata.len();
        count += 1;
        if count > MAX_EXTRA_FILES || bytes > MAX_EXTRA_BYTES {
            return Err(AppError::Validation(
                "Too many user files in the existing skill folder to preserve safely".into(),
            ));
        }
        let target = staging.join(safe);
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::copy(entry.path(), target)?;
    }
    Ok(())
}

fn swap(root: &Path, target: &Path, staging: &Path) -> AppResult<()> {
    let name = target
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| "skill".into());
    let old = root.join(format!(
        ".{name}.skills-launcher-old-{}",
        uuid::Uuid::new_v4()
    ));
    let had_target = target.exists();
    if had_target {
        std::fs::rename(target, &old)?;
    }
    if let Err(error) = std::fs::rename(staging, target) {
        if had_target {
            let _ = std::fs::rename(&old, target);
        }
        return Err(AppError::Io(error));
    }
    if had_target {
        let _ = std::fs::remove_dir_all(&old);
    }
    Ok(())
}

fn staging_path(root: &Path, install_path: &str) -> PathBuf {
    let name = Path::new(install_path)
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| "skill".into());
    root.join(format!(
        ".{name}.skills-launcher-tmp-{}",
        uuid::Uuid::new_v4()
    ))
}

fn load_installation(db: &Db, id: &str) -> AppResult<InstallationRow> {
    db.with_conn(|conn| {
        conn.query_row(
            "SELECT id,skill_id,host,install_path FROM installations WHERE id=?1",
            params![id],
            |row| {
                Ok(InstallationRow {
                    id: row.get(0)?,
                    skill_id: row.get(1)?,
                    host: row.get(2)?,
                    install_path: row.get(3)?,
                })
            },
        )
        .optional()?
        .ok_or_else(|| AppError::NotFound("Installation not found".into()))
    })
}

struct BackupRow {
    path: String,
    version_id: Option<String>,
    version_label: Option<String>,
    content_hash: Option<String>,
}

fn load_backup(
    db: &Db,
    backup_id: Option<&str>,
    installation: &InstallationRow,
) -> AppResult<BackupRow> {
    db.with_conn(|conn| {
        let row = if let Some(backup_id) = backup_id {
            conn.query_row(
                "SELECT path,version_id,version_label,content_hash FROM backups WHERE id=?1 AND installation_id=?2",
                params![backup_id, installation.id],
                |row| Ok(BackupRow { path: row.get(0)?, version_id: row.get(1)?, version_label: row.get(2)?, content_hash: row.get(3)? }),
            )
            .optional()?
        } else {
            conn.query_row(
                "SELECT path,version_id,version_label,content_hash FROM backups WHERE installation_id=?1 AND reason IN ('pre_install','pre_update','pre_rollback','pre_remove') ORDER BY created_at DESC LIMIT 1",
                params![installation.id],
                |row| Ok(BackupRow { path: row.get(0)?, version_id: row.get(1)?, version_label: row.get(2)?, content_hash: row.get(3)? }),
            )
            .optional()?
        };
        row.ok_or_else(|| AppError::NotFound("No backup is available for this installation".into()))
    })
}

fn canonical_or_create(path: &Path) -> AppResult<PathBuf> {
    crate::paths::canonical_or_create(path).map_err(AppError::Io)
}

fn home_canonical() -> AppResult<PathBuf> {
    let home = dirs::home_dir()
        .ok_or_else(|| AppError::Other("Could not resolve home directory".into()))?;
    crate::paths::canonical(&home).map_err(AppError::Io)
}

fn copy_tree(source: &Path, destination: &Path) -> AppResult<()> {
    std::fs::create_dir_all(destination)?;
    for entry in WalkDir::new(source).follow_links(false).min_depth(1) {
        let entry = entry
            .map_err(|error| AppError::Validation(format!("Could not read backup: {error}")))?;
        if entry
            .metadata()
            .map(|metadata| crate::paths::is_reparse(&metadata))
            .unwrap_or(true)
        {
            return Err(AppError::Security(
                "Symlinks and reparse points are not allowed in skill folders".into(),
            ));
        }
        let relative = entry
            .path()
            .strip_prefix(source)
            .map_err(|_| AppError::Security("Backup path escaped its root".into()))?;
        let relative = relative.to_string_lossy().replace('\\', "/");
        let Some(safe) = safe_relative_path(&relative) else {
            return Err(AppError::Validation(format!(
                "Backup contains an unsafe path: {relative}"
            )));
        };
        let target = destination.join(safe);
        if entry.file_type().is_dir() {
            std::fs::create_dir_all(target)?;
        } else if entry.file_type().is_file() {
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

fn hash_tree(source: &Path) -> AppResult<String> {
    let mut hasher = Sha256::new();
    for entry in WalkDir::new(source).follow_links(false).min_depth(1) {
        let entry = entry
            .map_err(|error| AppError::Validation(format!("Could not read backup: {error}")))?;
        if entry
            .metadata()
            .map(|metadata| crate::paths::is_reparse(&metadata))
            .unwrap_or(true)
        {
            return Err(AppError::Security(
                "Symlinks and reparse points are not allowed in backups".into(),
            ));
        }
        if !entry.file_type().is_file() {
            continue;
        }
        let relative = entry
            .path()
            .strip_prefix(source)
            .map_err(|_| AppError::Security("Backup path escaped its root".into()))?
            .to_string_lossy()
            .replace('\\', "/");
        let Some(safe) = safe_relative_path(&relative) else {
            return Err(AppError::Validation(format!(
                "Backup contains an unsafe path: {relative}"
            )));
        };
        let content = std::fs::read(entry.path())?;
        hasher.update(safe.as_bytes());
        hasher.update([0]);
        hasher.update(&content);
    }
    Ok(hex::encode(hasher.finalize()))
}

fn copy_tree_manifest(
    source: &Path,
    destination: &Path,
) -> AppResult<(Vec<serde_json::Value>, u64, String)> {
    std::fs::create_dir_all(destination)?;
    let mut files = Vec::new();
    let mut bytes = 0u64;
    let mut hasher = Sha256::new();
    for entry in WalkDir::new(source).follow_links(false).min_depth(1) {
        let entry = entry
            .map_err(|error| AppError::Validation(format!("Could not read backup: {error}")))?;
        if entry.file_type().is_symlink() {
            return Err(AppError::Security(
                "Symlinks are not allowed in skill folders".into(),
            ));
        }
        let relative = entry
            .path()
            .strip_prefix(source)
            .map_err(|_| AppError::Security("Backup path escaped its root".into()))?
            .to_string_lossy()
            .replace('\\', "/");
        let Some(safe) = safe_relative_path(&relative) else {
            return Err(AppError::Validation(format!(
                "Backup contains an unsafe path: {relative}"
            )));
        };
        let target = destination.join(&safe);
        if entry.file_type().is_dir() {
            std::fs::create_dir_all(target)?;
            continue;
        }
        if !entry.file_type().is_file() {
            continue;
        }
        let metadata = entry.metadata().map_err(|error| {
            AppError::Validation(format!("Could not read backup file: {error}"))
        })?;
        if crate::paths::is_reparse(&metadata) {
            return Err(AppError::Security(
                "Reparse-point files are not allowed in skill folders".into(),
            ));
        }
        bytes += metadata.len();
        if files.len() >= MAX_BACKUP_FILES || bytes > MAX_BACKUP_BYTES {
            return Err(AppError::Validation(
                "Skill folder is too large to back up".into(),
            ));
        }
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let content = std::fs::read(entry.path())?;
        hasher.update(safe.as_bytes());
        hasher.update([0]);
        hasher.update(&content);
        std::fs::write(target, &content)?;
        files.push(json!({ "path": safe, "bytes": content.len() }));
    }
    Ok((files, bytes, hex::encode(hasher.finalize())))
}

fn ensure_target_under(root: &Path, target: &Path) -> AppResult<()> {
    let canonical_root = crate::paths::canonical(root).map_err(AppError::Io)?;
    if target.parent() != Some(root) && target.parent() != Some(canonical_root.as_path()) {
        return Err(AppError::Security(
            "Install path is not a direct child of the agent skill root".into(),
        ));
    }
    if target.exists() {
        let canonical = crate::paths::canonical(target).map_err(AppError::Io)?;
        if canonical.parent() != Some(canonical_root.as_path()) {
            return Err(AppError::Security(
                "Install path resolves outside the agent skill root".into(),
            ));
        }
    }
    Ok(())
}

fn reject_reparse(path: &Path) -> AppResult<()> {
    let Ok(metadata) = std::fs::symlink_metadata(path) else {
        return Ok(());
    };
    if crate::paths::is_reparse(&metadata) {
        return Err(AppError::Security(
            "Symlinked or reparse-point skill folders are not supported".into(),
        ));
    }
    Ok(())
}

fn failed(host: &str, message: &str) -> InstallOutcome {
    InstallOutcome {
        host: host.into(),
        ok: false,
        message: message.into(),
        install_path: None,
    }
}

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{InstallRequest, SourceInput, SourceKind};
    use serde_json::json;

    fn fixture_root() -> PathBuf {
        let root =
            std::env::temp_dir().join(format!("skills-launcher-install-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(root.join("source/demo-skill")).unwrap();
        std::fs::create_dir_all(root.join("agent-root")).unwrap();
        std::fs::write(
            root.join("source/demo-skill/SKILL.md"),
            "---\nname: Demo Skill\ndescription: A demo skill.\nlicense: MIT\n---\n\nFirst version.\n",
        )
        .unwrap();
        std::fs::write(
            root.join("source/demo-skill/old-managed.md"),
            "managed in v1\n",
        )
        .unwrap();
        root
    }

    #[tokio::test]
    async fn install_update_preserves_user_extras_and_backs_up() {
        let root = fixture_root();
        let db = Db::open(&root.join("data")).unwrap();
        let source = crate::catalog::create_source(
            &db,
            SourceInput {
                name: "Local".into(),
                kind: SourceKind::LocalDir,
                url: root.join("source").to_string_lossy().to_string(),
                author: "Test".into(),
                description: String::new(),
                config: json!({}),
                trust: "COMMUNITY".into(),
                enabled: true,
                auto_sync: false,
                interval_minutes: 360,
            },
        )
        .unwrap();
        let client = reqwest::Client::new();
        crate::catalog::sync_source(
            &db,
            &client,
            None,
            &root.join("data/tmp"),
            &source.id,
            "manual",
        )
        .await
        .unwrap();
        let skill = load_skill(
            &db,
            &crate::catalog::list_skills(&db, &Default::default())
                .unwrap()
                .items[0]
                .id,
        )
        .unwrap();
        let version = load_version(&db, &skill, None).unwrap();
        let agent = DetectedAgent {
            host: "claude-code".into(),
            name: "Claude Code".into(),
            detected: true,
            manual: false,
            executable_path: None,
            version: None,
            config_path: None,
            skills_path: None,
            project_skills_path: None,
            supports_agent_skills: true,
            auto_install: false,
            notes: Vec::new(),
        };
        let agent_root = std::fs::canonicalize(root.join("agent-root")).unwrap();
        let installed = install_to_root(
            &db,
            &root.join("data"),
            &skill,
            &version,
            &agent,
            "pre_install",
            &agent_root,
        )
        .unwrap();
        assert!(Path::new(&installed).join("SKILL.md").is_file());
        std::fs::write(Path::new(&installed).join("user-note.txt"), "keep me").unwrap();

        std::fs::write(
            root.join("source/demo-skill/SKILL.md"),
            "---\nname: Demo Skill\ndescription: A demo skill.\nlicense: MIT\n---\n\nSecond version.\n",
        )
        .unwrap();
        std::fs::remove_file(root.join("source/demo-skill/old-managed.md")).unwrap();
        crate::catalog::sync_source(
            &db,
            &client,
            None,
            &root.join("data/tmp"),
            &source.id,
            "manual",
        )
        .await
        .unwrap();
        let skill = load_skill(&db, &skill.id).unwrap();
        let version = load_version(&db, &skill, None).unwrap();
        install_to_root(
            &db,
            &root.join("data"),
            &skill,
            &version,
            &agent,
            "pre_update",
            &agent_root,
        )
        .unwrap();
        let installed_text =
            std::fs::read_to_string(Path::new(&installed).join("SKILL.md")).unwrap();
        assert!(installed_text.contains("Second version"));
        assert!(Path::new(&installed).join("user-note.txt").is_file());
        assert!(!Path::new(&installed).join("old-managed.md").exists());
        let backups = list_backups(&db, None).unwrap();
        assert!(!backups.is_empty());
        let installation_id: String = db
            .with_conn(|conn| {
                Ok(conn.query_row(
                    "SELECT id FROM installations WHERE skill_id=?1 AND host='claude-code'",
                    params![skill.id],
                    |row| row.get(0),
                )?)
            })
            .unwrap();
        let installation = load_installation(&db, &installation_id).unwrap();
        let backup = load_backup(&db, Some(&backups[0].id), &installation).unwrap();
        restore_backup(
            &db,
            &root.join("data"),
            &installation,
            &backup,
            &agent_root,
            Path::new(&installed),
        )
        .unwrap();
        let restored = std::fs::read_to_string(Path::new(&installed).join("SKILL.md")).unwrap();
        assert!(restored.contains("First version"));
        assert!(Path::new(&installed).join("user-note.txt").is_file());
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    #[ignore = "requires real agent executables; CI sets SKILLS_LAUNCHER_EXPECT_HOSTS"]
    async fn real_agents_detect_install_uninstall() {
        let expected_hosts: Vec<String> = std::env::var("SKILLS_LAUNCHER_EXPECT_HOSTS")
            .unwrap_or_else(|_| "opencode".into())
            .split(',')
            .map(str::trim)
            .filter(|host| !host.is_empty())
            .map(str::to_string)
            .collect();
        if expected_hosts.is_empty() {
            eprintln!("skipping: SKILLS_LAUNCHER_EXPECT_HOSTS is empty");
            return;
        }
        let root = std::env::temp_dir().join(format!(
            "skills-launcher-real-agents-smoke-{}",
            uuid::Uuid::new_v4()
        ));
        let data = root.join("data");
        let source_dir = root.join("source/demo-skill");
        std::fs::create_dir_all(&source_dir).unwrap();
        std::fs::write(
            source_dir.join("SKILL.md"),
            "---\nname: CI Agent Smoke\ndescription: Verifies real agent host paths.\nlicense: MIT\n---\n\nInstall and remove this fixture.\n",
        )
        .unwrap();

        let db = Db::open(&data).unwrap();
        let source = crate::catalog::create_source(
            &db,
            SourceInput {
                name: "CI fixture".into(),
                kind: SourceKind::LocalDir,
                url: root.join("source").to_string_lossy().to_string(),
                author: "CI".into(),
                description: String::new(),
                config: json!({}),
                trust: "COMMUNITY".into(),
                enabled: true,
                auto_sync: false,
                interval_minutes: 360,
            },
        )
        .unwrap();
        crate::catalog::sync_source(
            &db,
            &reqwest::Client::new(),
            None,
            &data.join("tmp"),
            &source.id,
            "manual",
        )
        .await
        .unwrap();
        let skill = crate::catalog::list_skills(&db, &Default::default())
            .unwrap()
            .items
            .into_iter()
            .next()
            .expect("fixture skill was not indexed");

        let detected = crate::agents::detect_all(&db).await.unwrap();
        for host in &expected_hosts {
            let agent = detected
                .iter()
                .find(|agent| &agent.host == host)
                .unwrap_or_else(|| panic!("agent host descriptor missing: {host}"));
            assert!(
                agent.detected,
                "{host} was installed but not detected: {:?}",
                agent.notes
            );
            println!(
                "detected {host} exe={:?} version={:?} skills={:?}",
                agent.executable_path, agent.version, agent.skills_path
            );
        }

        let response = install_skill(
            &db,
            &data,
            &InstallRequest {
                skill_id: skill.id.clone(),
                version_id: None,
                hosts: expected_hosts.clone(),
                allow_risky: false,
            },
            &detected,
        )
        .unwrap();
        let mut installed = Vec::new();
        for host in &expected_hosts {
            let agent = detected.iter().find(|agent| &agent.host == host).unwrap();
            let outcome = response
                .outcomes
                .iter()
                .find(|outcome| &outcome.host == host)
                .unwrap_or_else(|| panic!("install outcome missing: {host}"));
            assert!(outcome.ok, "{host} install failed: {}", outcome.message);
            let path = PathBuf::from(
                outcome
                    .install_path
                    .clone()
                    .unwrap_or_else(|| panic!("install path missing: {host}")),
            );
            let expected_root = PathBuf::from(
                agent
                    .skills_path
                    .clone()
                    .unwrap_or_else(|| panic!("skills path missing: {host}")),
            );
            assert!(path.starts_with(&expected_root));
            assert!(path.join("SKILL.md").is_file(), "{host} SKILL.md missing");
            installed.push((host.clone(), path));
        }

        for (host, path) in &installed {
            let installation_id: String = db
                .with_conn(|conn| {
                    Ok(conn.query_row(
                        "SELECT id FROM installations WHERE skill_id=?1 AND host=?2 AND status='INSTALLED'",
                        params![&skill.id, host],
                        |row| row.get(0),
                    )?)
                })
                .unwrap();
            uninstall_skill(&db, &data, &installation_id, true).unwrap();
            assert!(!path.exists(), "{host} skill was not removed");
        }

        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    #[ignore = "mutates a temporary folder inside the real home; CI sets SKILLS_LAUNCHER_MANUAL_AGENT_SMOKE=1"]
    async fn manual_agent_detect_install_uninstall() {
        if std::env::var("SKILLS_LAUNCHER_MANUAL_AGENT_SMOKE").as_deref() != Ok("1") {
            eprintln!("skipping: SKILLS_LAUNCHER_MANUAL_AGENT_SMOKE is not set");
            return;
        }
        let home = dirs::home_dir().unwrap();
        let manual_root = home.join(format!(
            ".skills-launcher-manual-smoke-{}",
            uuid::Uuid::new_v4()
        ));
        let skills_root = manual_root.join("claude-skills");
        let root = std::env::temp_dir().join(format!(
            "skills-launcher-manual-source-{}",
            uuid::Uuid::new_v4()
        ));
        let data = root.join("data");
        let source_dir = root.join("source/demo-skill");
        std::fs::create_dir_all(&source_dir).unwrap();
        std::fs::write(
            source_dir.join("SKILL.md"),
            "---\nname: Manual Agent Smoke\ndescription: Verifies manual agent installs.\nlicense: MIT\n---\n\nInstall and remove this fixture.\n",
        )
        .unwrap();

        let db = Db::open(&data).unwrap();
        let skills_path = skills_root.to_string_lossy().to_string();
        crate::agents::set_manual_agent(&db, "claude-code", None, Some(&skills_path)).unwrap();
        let detected = crate::agents::detect_all(&db).await.unwrap();
        let claude = detected
            .iter()
            .find(|agent| agent.host == "claude-code")
            .expect("Claude Code descriptor missing");
        assert!(claude.detected, "manual agent was not detected");
        assert!(claude.manual, "manual flag was not set");
        assert_eq!(
            std::fs::canonicalize(claude.skills_path.as_ref().unwrap()).unwrap(),
            std::fs::canonicalize(&skills_root).unwrap()
        );

        let source = crate::catalog::create_source(
            &db,
            SourceInput {
                name: "CI manual fixture".into(),
                kind: SourceKind::LocalDir,
                url: root.join("source").to_string_lossy().to_string(),
                author: "CI".into(),
                description: String::new(),
                config: json!({}),
                trust: "COMMUNITY".into(),
                enabled: true,
                auto_sync: false,
                interval_minutes: 360,
            },
        )
        .unwrap();
        crate::catalog::sync_source(
            &db,
            &reqwest::Client::new(),
            None,
            &data.join("tmp"),
            &source.id,
            "manual",
        )
        .await
        .unwrap();
        let skill = crate::catalog::list_skills(&db, &Default::default())
            .unwrap()
            .items
            .into_iter()
            .next()
            .expect("manual fixture skill was not indexed");
        let response = install_skill(
            &db,
            &data,
            &InstallRequest {
                skill_id: skill.id.clone(),
                version_id: None,
                hosts: vec!["claude-code".into()],
                allow_risky: false,
            },
            &detected,
        )
        .unwrap();
        let outcome = response
            .outcomes
            .iter()
            .find(|outcome| outcome.host == "claude-code")
            .expect("manual install outcome missing");
        assert!(outcome.ok, "manual install failed: {}", outcome.message);
        let installed = PathBuf::from(outcome.install_path.clone().unwrap());
        assert!(installed.starts_with(&skills_root));
        assert!(installed.join("SKILL.md").is_file());

        let installation_id: String = db
            .with_conn(|conn| {
                Ok(conn.query_row(
                    "SELECT id FROM installations WHERE skill_id=?1 AND host='claude-code' AND status='INSTALLED'",
                    params![&skill.id],
                    |row| row.get(0),
                )?)
            })
            .unwrap();
        uninstall_skill(&db, &data, &installation_id, true).unwrap();
        assert!(!installed.exists());
        crate::agents::clear_manual_agent(&db, "claude-code").unwrap();
        let detected = crate::agents::detect_all(&db).await.unwrap();
        let claude = detected
            .iter()
            .find(|agent| agent.host == "claude-code")
            .expect("Claude Code descriptor missing after manual removal");
        assert!(!claude.manual, "manual entry was not removed");

        let _ = std::fs::remove_dir_all(root);
        let _ = std::fs::remove_dir_all(manual_root);
    }
}
