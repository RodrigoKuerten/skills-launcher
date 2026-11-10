use super::{decode_text, file, parse_skill_dir, safe_relative_path, SkillMeta};
use crate::domain::{DiscoveredSkill, Source, SourceSyncResult};
use crate::error::{AppError, AppResult};
use crate::sources::SourceContext;
use async_trait::async_trait;
use std::collections::BTreeMap;
use std::io::{Cursor, Read};
use zip::ZipArchive;

const MAX_ARCHIVE_BYTES: u64 = 128 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES: usize = 15_000;
const MAX_FILES_PER_SKILL: usize = 1_000;
const MAX_FILE_BYTES: usize = 512 * 1024;
const MAX_SKILL_BYTES: usize = 32 * 1024 * 1024;
const MAX_SKILLS: usize = 200;

pub struct ZipMeta {
    pub author: String,
    pub source_url: String,
    pub license: Option<String>,
    pub stars: i64,
    pub branch: Option<String>,
    pub commit_ref: Option<String>,
    pub subpath: Option<String>,
}

pub struct ZipAdapter;

#[async_trait]
impl super::SourceAdapter for ZipAdapter {
    async fn fetch(
        &self,
        source: &Source,
        _ctx: &SourceContext<'_>,
    ) -> AppResult<SourceSyncResult> {
        let source = source.clone();
        let result = tokio::task::spawn_blocking(move || read_zip_file(&source))
            .await
            .map_err(|error| AppError::Other(format!("ZIP reader failed: {error}")))??;
        Ok(result)
    }
}

fn read_zip_file(source: &Source) -> AppResult<SourceSyncResult> {
    let path = std::path::Path::new(&source.url);
    let metadata = std::fs::metadata(path)?;
    if metadata.len() > MAX_ARCHIVE_BYTES {
        return Err(AppError::Validation(
            "ZIP archive is too large (max 64 MB)".into(),
        ));
    }
    let bytes = std::fs::read(path)?;
    let skills = skills_from_zip(
        &bytes,
        ZipMeta {
            author: if source.author.is_empty() {
                "Unknown".into()
            } else {
                source.author.clone()
            },
            source_url: source.url.clone(),
            license: source.license.clone(),
            stars: 0,
            branch: None,
            commit_ref: None,
            subpath: None,
        },
    )?;
    Ok(SourceSyncResult {
        skills,
        source_license: source.license.clone(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::write::SimpleFileOptions;

    fn zip_with(path: &str) -> Vec<u8> {
        let mut bytes = Vec::new();
        {
            let mut writer = zip::ZipWriter::new(Cursor::new(&mut bytes));
            writer
                .start_file(path, SimpleFileOptions::default())
                .unwrap();
            writer.write_all(b"# bad").unwrap();
            writer.finish().unwrap();
        }
        bytes
    }

    #[test]
    fn rejects_zip_traversal() {
        let error = skills_from_zip(
            &zip_with("../outside/SKILL.md"),
            ZipMeta {
                author: "test".into(),
                source_url: "https://example.com".into(),
                license: None,
                stars: 0,
                branch: None,
                commit_ref: None,
                subpath: None,
            },
        )
        .unwrap_err();
        assert!(error.to_string().contains("Unsafe path"));
    }

    #[test]
    fn rejects_absolute_zip_path() {
        let error = skills_from_zip(
            &zip_with("C:/outside/SKILL.md"),
            ZipMeta {
                author: "test".into(),
                source_url: "https://example.com".into(),
                license: None,
                stars: 0,
                branch: None,
                commit_ref: None,
                subpath: None,
            },
        )
        .unwrap_err();
        assert!(error.to_string().contains("Unsafe path"));
    }
}

pub fn skills_from_zip(bytes: &[u8], meta: ZipMeta) -> AppResult<Vec<DiscoveredSkill>> {
    if bytes.len() as u64 > MAX_ARCHIVE_BYTES {
        return Err(AppError::Validation(
            "ZIP archive is too large (max 64 MB)".into(),
        ));
    }
    let mut archive = ZipArchive::new(Cursor::new(bytes))
        .map_err(|error| AppError::Validation(format!("Invalid ZIP archive: {error}")))?;
    if archive.len() > MAX_ARCHIVE_ENTRIES {
        return Err(AppError::Validation(format!(
            "ZIP archive has too many entries (max {MAX_ARCHIVE_ENTRIES})"
        )));
    }

    let mut entries = Vec::new();
    let mut total_uncompressed: u64 = 0;
    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|error| AppError::Validation(format!("Invalid ZIP entry: {error}")))?;
        if entry.encrypted() {
            return Err(AppError::Validation(
                "Encrypted ZIP entries are not supported".into(),
            ));
        }
        if let Some(mode) = entry.unix_mode() {
            if mode & 0o170000 == 0o120000 {
                // Archives are never extracted to disk; symlinks are simply not imported.
                continue;
            }
        }
        if entry.is_dir() {
            continue;
        }
        let name = entry.name().to_string();
        if safe_relative_path(&name).is_none() {
            return Err(AppError::Validation(format!(
                "Unsafe path in ZIP archive: {name}"
            )));
        }
        total_uncompressed = total_uncompressed.saturating_add(entry.size());
        if total_uncompressed > MAX_ARCHIVE_BYTES {
            return Err(AppError::Validation(
                "ZIP expands beyond the 64 MB limit".into(),
            ));
        }
        if entry.size() > 0 && entry.compressed_size() > 0 {
            let ratio = entry.size() / entry.compressed_size().max(1);
            if ratio > 100 {
                return Err(AppError::Validation(
                    "ZIP compression ratio is suspiciously high".into(),
                ));
            }
        }
        entries.push(ZipEntryInfo { index, name });
    }

    let prefix = common_root(&entries);
    let mut stripped = BTreeMap::new();
    for entry in entries {
        let path = if let Some(prefix) = &prefix {
            entry
                .name
                .strip_prefix(&format!("{prefix}/"))
                .map(str::to_string)
        } else {
            Some(entry.name.clone())
        };
        if let Some(path) = path {
            stripped.insert(entry.index, path);
        }
    }

    let mut skill_roots: Vec<String> = stripped
        .values()
        .filter(|path| {
            path.eq_ignore_ascii_case("SKILL.md")
                || path.to_ascii_lowercase().ends_with("/skill.md")
        })
        .map(|path| {
            path.rsplit_once('/')
                .map(|(root, _)| root.to_string())
                .unwrap_or_default()
        })
        .filter(|root| {
            let Some(subpath) = &meta.subpath else {
                return true;
            };
            let subpath = subpath.trim_matches('/');
            subpath.is_empty() || root == subpath || root.starts_with(&format!("{subpath}/"))
        })
        .collect();
    skill_roots.sort();
    skill_roots.dedup();
    skill_roots.truncate(MAX_SKILLS);

    let mut skills = Vec::new();
    for root in skill_roots {
        let prefix = if root.is_empty() {
            String::new()
        } else {
            format!("{root}/")
        };
        let mut selected: Vec<(usize, String, u64)> = stripped
            .iter()
            .filter_map(|(index, path)| {
                if prefix.is_empty() {
                    Some((*index, path.clone(), 0))
                } else {
                    path.strip_prefix(&prefix)
                        .map(|relative| (*index, relative.to_string(), 0))
                }
            })
            .filter(|(_, path, _)| {
                // Do not pull a nested skill into its parent.
                !path
                    .to_ascii_lowercase()
                    .rsplit_once('/')
                    .is_some_and(|(_, name)| name == "skill.md")
                    || path.eq_ignore_ascii_case("SKILL.md")
            })
            .collect();
        selected.sort_by(|a, b| a.1.cmp(&b.1));
        let mut skill_bytes = 0usize;
        let mut files = Vec::new();
        for (index, path, _) in selected {
            let Some(safe) = safe_relative_path(&path) else {
                continue;
            };
            if safe.split('/').any(|part| {
                matches!(
                    part,
                    ".git" | "node_modules" | "target" | "dist" | ".next" | ".cache"
                )
            }) {
                continue;
            }
            let entry = archive
                .by_index(index)
                .map_err(|error| AppError::Validation(format!("Invalid ZIP entry: {error}")))?;
            if entry.size() > MAX_FILE_BYTES as u64 {
                if safe.eq_ignore_ascii_case("SKILL.md") {
                    return Err(AppError::Validation("SKILL.md is too large".into()));
                }
                continue;
            }
            let mut buffer = Vec::with_capacity(entry.size() as usize);
            entry
                .take(MAX_FILE_BYTES as u64 + 1)
                .read_to_end(&mut buffer)
                .map_err(|error| {
                    AppError::Validation(format!("Could not read ZIP entry: {error}"))
                })?;
            if buffer.len() > MAX_FILE_BYTES {
                return Err(AppError::Validation(
                    "ZIP entry exceeds the file size limit".into(),
                ));
            }
            let Some(content) = decode_text(&buffer) else {
                continue;
            };
            skill_bytes += content.len();
            if skill_bytes > MAX_SKILL_BYTES {
                return Err(AppError::Validation(
                    "Skill exceeds the 32 MB content limit".into(),
                ));
            }
            files.push(file(safe, content));
            if files.len() > MAX_FILES_PER_SKILL {
                return Err(AppError::Validation(format!(
                    "Skill '{root}' has too many text files (max {MAX_FILES_PER_SKILL})"
                )));
            }
        }
        let root_name = root.rsplit('/').next().unwrap_or(&root).to_string();
        let repository_url = if let Some(branch) = &meta.branch {
            format!(
                "{}/tree/{}/{}",
                meta.source_url.trim_end_matches('/'),
                branch,
                root
            )
        } else {
            meta.source_url.clone()
        };
        if let Some(skill) = parse_skill_dir(
            &root_name,
            files,
            SkillMeta {
                path: if root.is_empty() {
                    ".".into()
                } else {
                    root.clone()
                },
                name_hint: root_name.clone(),
                author: meta.author.clone(),
                repository_url,
                source_url: meta.source_url.clone(),
                license: meta.license.clone(),
                stars: meta.stars,
                commit_ref: meta.commit_ref.clone(),
                version_label: None,
            },
        ) {
            skills.push(skill);
        }
    }

    Ok(skills)
}

struct ZipEntryInfo {
    index: usize,
    name: String,
}

fn common_root(entries: &[ZipEntryInfo]) -> Option<String> {
    let mut components = entries.iter().filter_map(|entry| {
        let first = entry.name.split('/').next()?;
        if entry.name.contains('/') {
            Some(first.to_string())
        } else {
            None
        }
    });
    let first = components.next()?;
    if entries
        .iter()
        .all(|entry| entry.name.starts_with(&format!("{first}/")))
    {
        Some(first)
    } else {
        None
    }
}
