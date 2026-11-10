use super::{file, parse_skill_dir, safe_relative_path, SkillMeta};
use crate::domain::{SkillFile, Source, SourceSyncResult};
use crate::error::{AppError, AppResult};
use crate::sources::SourceContext;
use async_trait::async_trait;
use futures::StreamExt;
use serde_json::Value;

const MAX_CATALOG_BYTES: usize = 20 * 1024 * 1024;
const MAX_SKILLS: usize = 100;
const MAX_FILES: usize = 80;
const MAX_SKILL_BYTES: usize = 4 * 1024 * 1024;

pub struct HttpJsonAdapter;

#[async_trait]
impl super::SourceAdapter for HttpJsonAdapter {
    async fn fetch(&self, source: &Source, ctx: &SourceContext<'_>) -> AppResult<SourceSyncResult> {
        let response = ctx
            .http
            .get(&source.url)
            .header("Accept", "application/json")
            .send()
            .await?;
        if !response.status().is_success() {
            return Err(AppError::Other(format!(
                "Catalog request failed ({})",
                response.status()
            )));
        }
        if response.content_length().is_some_and(|length| length > MAX_CATALOG_BYTES as u64) {
            return Err(AppError::Validation("Catalog is larger than 20 MB".into()));
        }
        let mut stream = response.bytes_stream();
        let mut bytes = Vec::new();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk?;
            if bytes.len() + chunk.len() > MAX_CATALOG_BYTES {
                return Err(AppError::Validation("Catalog is larger than 20 MB".into()));
            }
            bytes.extend_from_slice(&chunk);
        }
        let value: Value = serde_json::from_slice(&bytes)
            .map_err(|error| AppError::Validation(format!("Invalid catalog JSON: {error}")))?;
        let items = value
            .get("skills")
            .and_then(Value::as_array)
            .or_else(|| value.as_array())
            .ok_or_else(|| AppError::Validation("Catalog must contain a skills array".into()))?;
        if items.len() > MAX_SKILLS {
            return Err(AppError::Validation("Catalog has too many skills".into()));
        }

        let mut skills = Vec::new();
        let mut source_license = source.license.clone();
        for item in items {
            let name = item
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or("Untitled Skill")
                .to_string();
            let description = item
                .get("description")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            let license = item
                .get("license")
                .and_then(Value::as_str)
                .map(str::to_string)
                .or(source.license.clone());
            if source_license.is_none() {
                source_license = license.clone();
            }
            let files_value = item
                .get("files")
                .and_then(Value::as_array)
                .ok_or_else(|| AppError::Validation(format!("Skill '{name}' has no files array")))?;
            if files_value.len() > MAX_FILES {
                return Err(AppError::Validation(format!("Skill '{name}' has too many files")));
            }
            let mut files: Vec<SkillFile> = Vec::new();
            let mut total = 0usize;
            for file_value in files_value {
                let path = file_value
                    .get("path")
                    .and_then(Value::as_str)
                    .ok_or_else(|| AppError::Validation("Catalog file is missing a path".into()))?;
                let path = safe_relative_path(path)
                    .ok_or_else(|| AppError::Validation(format!("Unsafe catalog path: {path}")))?;
                let content = file_value
                    .get("content")
                    .and_then(Value::as_str)
                    .ok_or_else(|| AppError::Validation("Catalog file is missing content".into()))?;
                total += content.len();
                if total > MAX_SKILL_BYTES {
                    return Err(AppError::Validation(format!(
                        "Skill '{name}' exceeds the 4 MB limit"
                    )));
                }
                files.push(file(path, content));
            }
            if !files
                .iter()
                .any(|file| file.path.eq_ignore_ascii_case("SKILL.md"))
            {
                return Err(AppError::Validation(format!(
                    "Skill '{name}' is missing SKILL.md"
                )));
            }
            let repository_url = item
                .get("repository_url")
                .and_then(Value::as_str)
                .filter(|value| value.starts_with("https://"))
                .unwrap_or(&source.url)
                .to_string();
            let author = item
                .get("author")
                .and_then(Value::as_str)
                .unwrap_or(&source.author)
                .to_string();
            let stars = item.get("stars").and_then(Value::as_i64).unwrap_or(0);
            let version = item
                .get("version")
                .and_then(Value::as_str)
                .map(str::to_string);
            let category = item
                .get("category")
                .and_then(Value::as_str)
                .map(str::to_string);
            if let Some(mut skill) = parse_skill_dir(
                &name,
                files,
                SkillMeta {
                    path: name.clone(),
                    name_hint: name.clone(),
                    author,
                    repository_url,
                    source_url: source.url.clone(),
                    license,
                    stars,
                    commit_ref: None,
                    version_label: version,
                },
            ) {
                if let Some(category) = category {
                    if super::is_known_category(&category) {
                        skill.category = Some(category);
                    }
                }
                if skill.description.is_empty() {
                    skill.description = description;
                }
                skills.push(skill);
            }
        }

        Ok(SourceSyncResult {
            skills,
            source_license,
        })
    }
}
