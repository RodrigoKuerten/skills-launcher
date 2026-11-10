use super::{temp_run_dir, SourceContext};
use crate::domain::{Source, SourceKind, SourceSyncResult};
use crate::error::{AppError, AppResult};
use async_trait::async_trait;
use serde::Deserialize;
use std::time::Duration;

pub struct GitRepoAdapter;

#[derive(Debug, Default, Deserialize)]
struct GitConfig {
    branch: Option<String>,
    path: Option<String>,
}

#[async_trait]
impl super::SourceAdapter for GitRepoAdapter {
    async fn fetch(&self, source: &Source, ctx: &SourceContext<'_>) -> AppResult<SourceSyncResult> {
        let config: GitConfig = serde_json::from_value(source.config.clone()).unwrap_or_default();
        let branch = config.branch.unwrap_or_default();
        if !branch.is_empty() {
            validate_branch(&branch)?;
        }
        let git = which::which("git")
            .map_err(|_| AppError::Unsupported("Git is not installed or not on PATH".into()))?;
        let clone_dir = temp_run_dir(ctx.temp_dir)?;
        let result = clone_and_scan(source, &git, &clone_dir, &branch, config.path).await;
        let _ = tokio::fs::remove_dir_all(&clone_dir).await;
        result
    }
}

async fn clone_and_scan(
    source: &Source,
    git: &std::path::Path,
    clone_dir: &std::path::Path,
    branch: &str,
    path: Option<String>,
) -> AppResult<SourceSyncResult> {
    let target = clone_dir.join("repo");
    let mut command = tokio::process::Command::new(git);
    command
        .arg("clone")
        .arg("--depth")
        .arg("1")
        .arg("--single-branch")
        .env("GIT_TERMINAL_PROMPT", "0");
    if !branch.is_empty() {
        command.arg("--branch").arg(branch);
    }
    command.arg("--").arg(&source.url).arg(&target);
    let output = tokio::time::timeout(Duration::from_secs(180), command.output())
        .await
        .map_err(|_| AppError::Other("Git clone timed out".into()))??;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let message: String = stderr.chars().take(300).collect();
        return Err(AppError::Other(format!("Git clone failed: {message}")));
    }

    let mut clone_source = source.clone();
    clone_source.kind = SourceKind::LocalDir;
    clone_source.url = target.to_string_lossy().to_string();
    let scan_source = clone_source.clone();
    let mut skills = tokio::task::spawn_blocking(move || super::local::read_local_dir(&scan_source))
        .await
        .map_err(|error| AppError::Other(format!("Git scanner failed: {error}")))??.skills;
    let path = path.unwrap_or_default().trim_matches('/').to_string();
    if !path.is_empty() {
        skills.retain(|skill| {
            skill.source_path == path || skill.source_path.starts_with(&format!("{path}/"))
        });
    }
    for skill in &mut skills {
        skill.source_url = source.url.clone();
        skill.repository_url = repo_url(source, branch, &skill.source_path);
        skill.commit_ref = if branch.is_empty() { None } else { Some(branch.to_string()) };
        skill.version_label = skill
            .version_label
            .clone()
            .or_else(|| skill.commit_ref.as_ref().map(|value| value.chars().take(8).collect()));
    }
    Ok(SourceSyncResult {
        skills,
        source_license: source.license.clone(),
    })
}

fn repo_url(source: &Source, branch: &str, source_path: &str) -> String {
    let base = source.url.trim_end_matches('/');
    let mut url = String::from(base);
    if !branch.is_empty() {
        url.push_str("/tree/");
        url.push_str(branch);
    }
    if source_path != "." && !source_path.is_empty() {
        url.push('/');
        url.push_str(source_path);
    }
    url
}

fn validate_branch(branch: &str) -> AppResult<()> {
    if branch.len() > 200
        || branch.starts_with('-')
        || branch.contains("..")
        || !branch
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '/' | '_' | '-' | '.'))
    {
        return Err(AppError::Validation("Invalid git branch".into()));
    }
    Ok(())
}

