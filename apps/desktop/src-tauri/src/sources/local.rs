use super::{decode_text, file, parse_skill_dir, safe_relative_path, SkillMeta};
use crate::domain::{DiscoveredSkill, SkillFile, Source, SourceSyncResult};
use crate::error::{AppError, AppResult};
use crate::sources::SourceContext;
use async_trait::async_trait;
use walkdir::WalkDir;

const MAX_FILE_BYTES: u64 = 512 * 1024;
const MAX_SKILL_BYTES: usize = 32 * 1024 * 1024;
const MAX_FILES: usize = 1_000;
const MAX_SKILLS: usize = 200;

pub struct LocalDirAdapter;

#[async_trait]
impl super::SourceAdapter for LocalDirAdapter {
    async fn fetch(
        &self,
        source: &Source,
        _ctx: &SourceContext<'_>,
    ) -> AppResult<SourceSyncResult> {
        let source = source.clone();
        let result = tokio::task::spawn_blocking(move || read_local_dir(&source))
            .await
            .map_err(|error| AppError::Other(format!("Local reader failed: {error}")))??;
        Ok(result)
    }
}

pub(crate) fn read_local_dir(source: &Source) -> AppResult<SourceSyncResult> {
    let root = std::fs::canonicalize(&source.url).map_err(|error| {
        AppError::Validation(format!("Local source is not accessible: {error}"))
    })?;
    if !root.is_dir() {
        return Err(AppError::Validation(
            "Local source is not a directory".into(),
        ));
    }

    let mut all_files: Vec<(String, String)> = Vec::new();
    let mut entries = WalkDir::new(&root)
        .max_depth(8)
        .follow_links(false)
        .into_iter();
    while let Some(entry) = entries.next() {
        let entry = entry.map_err(|error| {
            AppError::Validation(format!("Could not read local source: {error}"))
        })?;
        if entry.file_type().is_symlink() {
            continue;
        }
        let name = entry.file_name().to_string_lossy();
        if entry.file_type().is_dir() {
            if matches!(
                name.as_ref(),
                ".git" | "node_modules" | "target" | "dist" | ".next" | ".cache" | "vendor"
            ) {
                entries.skip_current_dir();
            }
            continue;
        }
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        let relative = match path.strip_prefix(&root) {
            Ok(relative) => relative,
            Err(_) => continue,
        };
        let relative = relative.to_string_lossy().replace('\\', "/");
        let Some(safe) = safe_relative_path(&relative) else {
            continue;
        };
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        if metadata.len() > MAX_FILE_BYTES {
            continue;
        }
        let Ok(bytes) = std::fs::read(path) else {
            continue;
        };
        if let Some(content) = decode_text(&bytes) {
            all_files.push((safe, content));
        }
    }

    let skills = skills_from_files(all_files, source)?;
    Ok(SourceSyncResult {
        skills,
        source_license: source.license.clone(),
    })
}

fn skills_from_files(
    all_files: Vec<(String, String)>,
    source: &Source,
) -> AppResult<Vec<DiscoveredSkill>> {
    let mut skill_roots: Vec<String> = all_files
        .iter()
        .filter(|(path, _)| {
            path.eq_ignore_ascii_case("SKILL.md")
                || path.to_ascii_lowercase().ends_with("/skill.md")
        })
        .map(|(path, _)| {
            path.rsplit_once('/')
                .map(|(root, _)| root.to_string())
                .unwrap_or_default()
        })
        .collect();
    skill_roots.sort();
    skill_roots.dedup();
    skill_roots.truncate(MAX_SKILLS);
    if skill_roots.is_empty() {
        return Ok(Vec::new());
    }

    let mut skills = Vec::new();
    for skill_root in skill_roots {
        let mut selected: Vec<SkillFile> = Vec::new();
        let mut total = 0usize;
        for (path, content) in &all_files {
            let relative = if skill_root.is_empty() {
                Some(path.as_str())
            } else {
                path.strip_prefix(&format!("{skill_root}/"))
            };
            let Some(relative) = relative else {
                continue;
            };
            if !path.eq_ignore_ascii_case(&format!("{skill_root}/SKILL.md"))
                && path.to_ascii_lowercase().ends_with("/skill.md")
                && !path.eq_ignore_ascii_case("SKILL.md")
            {
                continue;
            }
            total += content.len();
            if total > MAX_SKILL_BYTES {
                return Err(AppError::Validation(format!(
                    "Skill '{skill_root}' exceeds the 32 MB content limit"
                )));
            }
            selected.push(file(relative.to_string(), content.clone()));
            if selected.len() > MAX_FILES {
                return Err(AppError::Validation(format!(
                    "Skill '{skill_root}' has too many files"
                )));
            }
        }
        let root_name = skill_root
            .rsplit('/')
            .next()
            .unwrap_or(&skill_root)
            .to_string();
        let repository_url = format!(
            "{}/{}",
            source.url.trim_end_matches(['/', '\\']),
            skill_root
        );
        if let Some(skill) = parse_skill_dir(
            &root_name,
            selected,
            SkillMeta {
                path: if skill_root.is_empty() {
                    ".".into()
                } else {
                    skill_root.clone()
                },
                name_hint: root_name.clone(),
                author: source.author.clone(),
                repository_url,
                source_url: source.url.clone(),
                license: source.license.clone(),
                stars: 0,
                commit_ref: None,
                version_label: None,
            },
        ) {
            skills.push(skill);
        }
    }
    Ok(skills)
}
