use crate::domain::{DiscoveredSkill, SkillFile, Source, SourceKind, SourceSyncResult};
use crate::error::{AppError, AppResult};
use async_trait::async_trait;
use reqwest::Client;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

pub mod archive;
pub mod git;
pub mod github;
pub mod http;
pub mod local;

pub struct SourceContext<'a> {
    pub http: &'a Client,
    pub github_token: Option<&'a str>,
    pub temp_dir: &'a Path,
}

#[async_trait]
pub trait SourceAdapter: Send + Sync {
    async fn fetch(&self, source: &Source, ctx: &SourceContext<'_>) -> AppResult<SourceSyncResult>;
}

pub async fn fetch_source(
    source: &Source,
    http: &Client,
    github_token: Option<&str>,
    temp_dir: &Path,
) -> AppResult<SourceSyncResult> {
    let ctx = SourceContext {
        http,
        github_token,
        temp_dir,
    };
    match source.kind {
        SourceKind::GithubRepo => github::GithubRepoAdapter.fetch(source, &ctx).await,
        SourceKind::GithubOrg => github::GithubOrgAdapter.fetch(source, &ctx).await,
        SourceKind::LocalDir => local::LocalDirAdapter.fetch(source, &ctx).await,
        SourceKind::Zip => archive::ZipAdapter.fetch(source, &ctx).await,
        SourceKind::HttpJson => http::HttpJsonAdapter.fetch(source, &ctx).await,
        SourceKind::GitRepo => git::GitRepoAdapter.fetch(source, &ctx).await,
    }
}

pub struct SkillMeta {
    pub path: String,
    pub name_hint: String,
    pub author: String,
    pub repository_url: String,
    pub source_url: String,
    pub license: Option<String>,
    pub stars: i64,
    pub commit_ref: Option<String>,
    pub version_label: Option<String>,
}

pub fn parse_skill_dir(
    root_name: &str,
    files: Vec<SkillFile>,
    meta: SkillMeta,
) -> Option<DiscoveredSkill> {
    let skill_file = files
        .iter()
        .find(|file| file.path.eq_ignore_ascii_case("SKILL.md"))?;
    let readme = skill_file.content.clone();
    let (frontmatter, body) = split_frontmatter(&skill_file.content);
    let frontmatter = frontmatter.unwrap_or_default();

    let name = frontmatter_string(&frontmatter, "name")
        .map(|value| clean_inline(&value))
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| {
            humanize(if meta.name_hint.is_empty() {
                root_name
            } else {
                &meta.name_hint
            })
        });
    let description = frontmatter_string(&frontmatter, "description")
        .map(|value| clean_inline(&value))
        .filter(|value| !value.is_empty())
        .or_else(|| first_paragraph(&body))
        .unwrap_or_default();
    let summary = truncate_chars(&description, 280);
    let license = frontmatter_string(&frontmatter, "license")
        .map(|value| clean_inline(&value))
        .filter(|value| !value.is_empty())
        .or(meta.license);
    let homepage = frontmatter_string(&frontmatter, "homepage")
        .or_else(|| frontmatter_string(&frontmatter, "metadata.homepage"))
        .map(|value| clean_inline(&value))
        .filter(|value| value.starts_with("https://"));
    let version = frontmatter_string(&frontmatter, "version")
        .map(|value| clean_inline(&value))
        .filter(|value| !value.is_empty())
        .or(meta.version_label);
    let author = frontmatter_string(&frontmatter, "author")
        .map(|value| clean_inline(&value))
        .filter(|value| !value.is_empty())
        .unwrap_or(meta.author);
    let category = classify(&format!("{name} {description} {}", body));

    let mut files = files;
    files.sort_by(|a, b| a.path.cmp(&b.path));

    Some(DiscoveredSkill {
        source_path: meta.path,
        name,
        summary,
        description: body,
        author,
        license,
        repository_url: meta.repository_url,
        homepage_url: homepage,
        category,
        commit_ref: meta.commit_ref,
        version_label: version,
        source_url: meta.source_url,
        files,
        readme,
        stars: meta.stars,
    })
}

pub fn file(path: impl Into<String>, content: impl Into<String>) -> SkillFile {
    let content = content.into();
    let sha256 = hex::encode(Sha256::digest(content.as_bytes()));
    SkillFile {
        path: path.into(),
        content,
        encoding: "utf-8".into(),
        sha256,
    }
}

pub fn content_hash(files: &[SkillFile]) -> String {
    let mut ordered: Vec<&SkillFile> = files.iter().collect();
    ordered.sort_by(|a, b| a.path.cmp(&b.path));
    let mut hasher = Sha256::new();
    for file in ordered {
        hasher.update(file.path.as_bytes());
        hasher.update([0]);
        hasher.update(file.content.as_bytes());
        hasher.update([0]);
    }
    hex::encode(hasher.finalize())
}

pub fn safe_relative_path(raw: &str) -> Option<String> {
    if raw.is_empty() || raw.len() > 240 || raw.contains('\0') || raw.contains('\\') {
        return None;
    }
    if raw.starts_with('/') || raw.starts_with("//") {
        return None;
    }
    let bytes = raw.as_bytes();
    if bytes.len() >= 2 && bytes[1] == b':' && bytes[0].is_ascii_alphabetic() {
        return None;
    }
    let mut components = Vec::new();
    for component in raw.split('/') {
        if component.is_empty() || component == "." || component == ".." {
            return None;
        }
        if component.ends_with(' ') || component.ends_with('.') {
            return None;
        }
        if is_reserved_windows_name(component) {
            return None;
        }
        components.push(component);
    }
    if components.len() > 20 {
        return None;
    }
    Some(components.join("/"))
}

fn is_reserved_windows_name(component: &str) -> bool {
    let stem = component
        .split('.')
        .next()
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase();
    matches!(
        stem.as_str(),
        "con"
            | "prn"
            | "aux"
            | "nul"
            | "com1"
            | "com2"
            | "com3"
            | "com4"
            | "com5"
            | "com6"
            | "com7"
            | "com8"
            | "com9"
            | "lpt1"
            | "lpt2"
            | "lpt3"
            | "lpt4"
            | "lpt5"
            | "lpt6"
            | "lpt7"
            | "lpt8"
            | "lpt9"
    )
}

pub fn decode_text(bytes: &[u8]) -> Option<String> {
    if bytes.contains(&0) {
        return None;
    }
    String::from_utf8(bytes.to_vec()).ok()
}

pub fn temp_run_dir(root: &Path) -> AppResult<PathBuf> {
    let path = root.join(format!("run-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&path)?;
    Ok(path)
}

pub fn validate_source_url(kind: &SourceKind, value: &str) -> AppResult<()> {
    let value = value.trim();
    if value.is_empty() || value.len() > 2048 {
        return Err(AppError::Validation("Source location is required".into()));
    }
    match kind {
        SourceKind::LocalDir => {
            let path = Path::new(value);
            if !path.is_absolute() || !path.is_dir() {
                return Err(AppError::Validation(
                    "Local source must be an existing absolute directory".into(),
                ));
            }
        }
        SourceKind::Zip => {
            let path = Path::new(value);
            if !path.is_absolute() || !path.is_file() {
                return Err(AppError::Validation(
                    "ZIP source must be an existing absolute file".into(),
                ));
            }
        }
        SourceKind::GithubRepo => {
            let parsed = url::Url::parse(value)?;
            if parsed.scheme() != "https"
                || parsed.host_str() != Some("github.com")
                || parsed.path().trim_matches('/').split('/').count() != 2
            {
                return Err(AppError::Validation(
                    "GitHub repository must look like https://github.com/owner/repo".into(),
                ));
            }
        }
        SourceKind::GithubOrg => {
            let parsed = url::Url::parse(value)?;
            if parsed.scheme() != "https"
                || parsed.host_str() != Some("github.com")
                || parsed.path().trim_matches('/').split('/').count() != 1
            {
                return Err(AppError::Validation(
                    "GitHub organization must look like https://github.com/org".into(),
                ));
            }
        }
        SourceKind::GitRepo | SourceKind::HttpJson => {
            let parsed = url::Url::parse(value)?;
            if parsed.scheme() != "https" {
                return Err(AppError::Validation("Remote sources must use HTTPS".into()));
            }
            if !parsed.username().is_empty() || parsed.password().is_some() {
                return Err(AppError::Validation(
                    "Credentials must not be embedded in source URLs".into(),
                ));
            }
            let host = parsed.host_str().unwrap_or_default().to_ascii_lowercase();
            if host == "localhost" || host.ends_with(".localhost") || is_private_ip(&host) {
                return Err(AppError::Validation(
                    "Remote sources must not target localhost or a private address".into(),
                ));
            }
        }
    }
    Ok(())
}

fn is_private_ip(host: &str) -> bool {
    let Ok(address) = host.parse::<std::net::IpAddr>() else {
        return false;
    };
    match address {
        std::net::IpAddr::V4(address) => {
            address.is_loopback()
                || address.is_private()
                || address.is_link_local()
                || address.is_unspecified()
        }
        std::net::IpAddr::V6(address) => address.is_loopback() || address.is_unspecified(),
    }
}

pub fn slugify(value: &str) -> String {
    let mut slug = String::new();
    for character in value.chars() {
        if character.is_ascii_alphanumeric() {
            slug.push(character.to_ascii_lowercase());
        } else if !slug.ends_with('-') {
            slug.push('-');
        }
    }
    let slug = slug.trim_matches('-').to_string();
    if slug.is_empty() {
        "skill".into()
    } else {
        truncate_chars(&slug, 64)
    }
}

pub fn is_known_category(value: &str) -> bool {
    matches!(
        value,
        "frontend"
            | "backend"
            | "design"
            | "architecture"
            | "security"
            | "devops"
            | "automation"
            | "ai"
            | "database"
            | "testing"
            | "research"
            | "productivity"
    )
}

pub fn humanize(value: &str) -> String {
    let value = value.trim_matches(['/', '\\']);
    let value = value.rsplit('/').next().unwrap_or(value);
    let mut words = Vec::new();
    for word in value.split(['-', '_', ' ']) {
        if word.is_empty() {
            continue;
        }
        let mut chars = word.chars();
        if let Some(first) = chars.next() {
            words.push(format!("{}{}", first.to_uppercase(), chars.as_str()));
        }
    }
    if words.is_empty() {
        "Untitled Skill".into()
    } else {
        words.join(" ")
    }
}

fn clean_inline(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn truncate_chars(value: &str, max: usize) -> String {
    let mut output: String = value.chars().take(max).collect();
    if value.chars().count() > max {
        output.push('…');
    }
    output
}

fn first_paragraph(body: &str) -> Option<String> {
    for line in body.lines() {
        let line = line.trim();
        if line.is_empty()
            || line.starts_with('#')
            || line.starts_with("```")
            || line.starts_with("---")
        {
            continue;
        }
        return Some(clean_inline(line.trim_start_matches(['-', '*', '>', ' '])));
    }
    None
}

fn split_frontmatter(content: &str) -> (Option<serde_yaml::Value>, String) {
    let content = content.trim_start_matches('\u{feff}');
    if !content.starts_with("---") {
        return (None, content.to_string());
    }
    let mut lines = content.lines();
    let _ = lines.next();
    let mut yaml = Vec::new();
    let mut body_started = false;
    let mut body = Vec::new();
    for line in lines {
        if !body_started && line.trim() == "---" {
            body_started = true;
            continue;
        }
        if body_started {
            body.push(line);
        } else {
            yaml.push(line);
        }
    }
    if !body_started {
        return (None, content.to_string());
    }
    let parsed = serde_yaml::from_str::<serde_yaml::Value>(&yaml.join("\n")).ok();
    (parsed, body.join("\n").trim().to_string())
}

fn frontmatter_string(value: &serde_yaml::Value, key: &str) -> Option<String> {
    let mut current = value;
    for part in key.split('.') {
        current = current.get(part)?;
    }
    match current {
        serde_yaml::Value::String(value) => Some(value.clone()),
        serde_yaml::Value::Number(value) => Some(value.to_string()),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_windows_escape_paths() {
        for path in [
            "../outside",
            "C:/outside",
            "\\\\server\\share",
            "folder\\file",
            "CON",
            "trailing. ",
            "folder//file",
        ] {
            assert!(safe_relative_path(path).is_none(), "accepted {path}");
        }
        assert_eq!(
            safe_relative_path("folder/SKILL.md").as_deref(),
            Some("folder/SKILL.md")
        );
    }

    #[test]
    fn private_remote_hosts_are_rejected() {
        for url in [
            "https://localhost/catalog.json",
            "https://127.0.0.1/catalog.json",
            "https://10.0.0.2/catalog.json",
            "https://192.168.1.4/catalog.json",
        ] {
            assert!(
                validate_source_url(&SourceKind::HttpJson, url).is_err(),
                "accepted {url}"
            );
        }
        assert!(
            validate_source_url(&SourceKind::HttpJson, "https://example.com/catalog.json").is_ok()
        );
    }
}

fn classify(text: &str) -> Option<String> {
    let text = text.to_ascii_lowercase();
    let rules: &[(&str, &[&str])] = &[
        (
            "security",
            &["security", "threat", "vulnerab", "owasp", "auth", "secret"],
        ),
        (
            "frontend",
            &[
                "react", "frontend", "css", "tailwind", "vue", "angular", "ui ",
            ],
        ),
        (
            "backend",
            &["backend", "api", "server", "endpoint", "spring", "express"],
        ),
        (
            "design",
            &["design", "ux", "accessib", "figma", "typography"],
        ),
        (
            "architecture",
            &["architecture", "refactor", "system design", "monorepo"],
        ),
        (
            "devops",
            &[
                "docker",
                "kubernetes",
                "ci/cd",
                "deploy",
                "terraform",
                "github actions",
            ],
        ),
        (
            "automation",
            &["automat", "workflow", "agent loop", "orchestrat"],
        ),
        (
            "ai",
            &[
                "llm",
                "prompt",
                "rag",
                "embedding",
                "agent",
                "openai",
                "claude",
            ],
        ),
        (
            "database",
            &[
                "database",
                "sql",
                "postgres",
                "sqlite",
                "migration",
                "query",
            ],
        ),
        (
            "testing",
            &[
                "test",
                "tdd",
                "playwright",
                "vitest",
                "jest",
                "e2e",
                "coverage",
            ],
        ),
        (
            "research",
            &["research", "source", "citation", "investigat"],
        ),
        (
            "productivity",
            &["plan", "document", "writing", "review", "workflow"],
        ),
    ];
    let mut best: Option<(&str, usize)> = None;
    for (category, terms) in rules {
        let score = terms.iter().filter(|term| text.contains(**term)).count();
        if score > 0 && best.is_none_or(|(_, current)| score > current) {
            best = Some((category, score));
        }
    }
    best.map(|(category, _)| category.to_string())
}
