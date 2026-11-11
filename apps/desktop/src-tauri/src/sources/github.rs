use super::archive::{skills_from_zip, ZipMeta};
use super::SourceContext;
use crate::domain::{Source, SourceSyncResult};
use crate::error::{AppError, AppResult};
use async_trait::async_trait;
use futures::StreamExt;
use serde::Deserialize;
use url::Url;

const MAX_ZIP_BYTES: u64 = 128 * 1024 * 1024;
const GITHUB_API: &str = "https://api.github.com";

pub struct GithubRepoAdapter;
pub struct GithubOrgAdapter;

#[cfg(test)]
mod tests {
    #[tokio::test]
    #[ignore = "diagnostic network call"]
    async fn diagnose_github_api() {
        let client = reqwest::Client::builder()
            .user_agent("SkillsLauncher/0.2 (+https://skillslauncher.app)")
            .build()
            .unwrap();
        let response = client
            .get("https://api.github.com/repos/anthropics/skills")
            .header("Accept", "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .send()
            .await
            .unwrap();
        println!("status={}", response.status());
        let body = response.text().await.unwrap();
        println!("body={}", body.chars().take(500).collect::<String>());
    }
}

#[derive(Debug, Default, Deserialize)]
struct RepoConfig {
    repo: Option<String>,
    branch: Option<String>,
    path: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct OrgConfig {
    limit: Option<usize>,
    branch: Option<String>,
    path: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RepoMeta {
    default_branch: String,
    full_name: String,
    #[serde(default)]
    stargazers_count: i64,
    license: Option<LicenseMeta>,
}

#[derive(Debug, Deserialize)]
struct LicenseMeta {
    spdx_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OrgRepo {
    full_name: String,
    html_url: String,
    owner: OrgOwner,
}

#[derive(Debug, Deserialize)]
struct OrgOwner {
    login: String,
}

#[async_trait]
impl super::SourceAdapter for GithubRepoAdapter {
    async fn fetch(&self, source: &Source, ctx: &SourceContext<'_>) -> AppResult<SourceSyncResult> {
        let config = config_for(source)?;
        let repo = config
            .repo
            .clone()
            .unwrap_or_else(|| repo_from_url(&source.url));
        validate_repo(&repo)?;
        let author = repo.split('/').next().unwrap_or("").to_string();
        let result = fetch_repo(
            &source.url,
            &repo,
            config.branch.as_deref(),
            config.path.as_deref(),
            &author,
            source.license.clone(),
            ctx,
        )
        .await?;
        Ok(result)
    }
}

#[async_trait]
impl super::SourceAdapter for GithubOrgAdapter {
    async fn fetch(&self, source: &Source, ctx: &SourceContext<'_>) -> AppResult<SourceSyncResult> {
        let config = config_for_org(source);
        let org = org_from_url(&source.url);
        validate_owner(&org)?;
        let limit = config.limit.unwrap_or(10).clamp(1, 25);
        let mut url = Url::parse(&format!("{GITHUB_API}/orgs/{org}/repos"))?;
        url.query_pairs_mut()
            .append_pair("per_page", "100")
            .append_pair("type", "public")
            .append_pair("sort", "updated");
        let repos: Vec<OrgRepo> = github_json(ctx, url.as_str()).await?;
        if repos.is_empty() {
            return Ok(SourceSyncResult {
                skills: Vec::new(),
                source_license: None,
            });
        }

        let mut skills = Vec::new();
        let mut license: Option<String> = None;
        let mut last_error = None;
        for repo in repos.into_iter().take(limit) {
            let result = fetch_repo(
                &repo.html_url,
                &repo.full_name,
                config.branch.as_deref(),
                config.path.as_deref(),
                &repo.owner.login,
                source.license.clone(),
                ctx,
            )
            .await;
            match result {
                Ok(mut found) => {
                    for skill in &mut found.skills {
                        skill.source_path = if skill.source_path == "." {
                            repo.full_name.clone()
                        } else {
                            format!("{}/{}", repo.full_name, skill.source_path)
                        };
                    }
                    if license.is_none() {
                        license = found.source_license.clone();
                    }
                    skills.extend(found.skills);
                }
                Err(error) => last_error = Some(error),
            }
        }
        if skills.is_empty() {
            if let Some(error) = last_error {
                return Err(error);
            }
        }
        Ok(SourceSyncResult {
            skills,
            source_license: license,
        })
    }
}

async fn fetch_repo(
    source_url: &str,
    repo: &str,
    branch: Option<&str>,
    path: Option<&str>,
    author: &str,
    license_hint: Option<String>,
    ctx: &SourceContext<'_>,
) -> AppResult<SourceSyncResult> {
    let mut meta_url = Url::parse(&format!("{GITHUB_API}/repos/"))?;
    {
        let mut segments = meta_url
            .path_segments_mut()
            .map_err(|_| AppError::Validation("Invalid GitHub API URL".into()))?;
        for part in repo.split('/') {
            segments.push(part);
        }
    }
    // The public archive endpoint is authoritative and still works when the metadata API is
    // rate limited or returns an unexpected status.
    let meta = github_json::<RepoMeta>(ctx, meta_url.as_str()).await.ok();
    let explicit_branch = branch.map(str::trim).filter(|value| !value.is_empty());
    let branch = explicit_branch
        .map(str::to_string)
        .or_else(|| meta.as_ref().map(|meta| meta.default_branch.clone()))
        .unwrap_or_else(|| "main".into());
    if branch.len() > 200 || branch.starts_with('-') || branch.contains("..") {
        return Err(AppError::Validation("Invalid GitHub branch".into()));
    }
    let subpath = path
        .map(|value| value.trim_matches('/').to_string())
        .filter(|value| !value.is_empty());
    if let Some(subpath) = &subpath {
        if super::safe_relative_path(subpath).is_none() {
            return Err(AppError::Validation("Invalid GitHub subpath".into()));
        }
    }

    let mut candidates = vec![branch.clone()];
    if explicit_branch.is_none() && meta.is_none() {
        for fallback in ["master", "develop"] {
            if !candidates.iter().any(|candidate| candidate == fallback) {
                candidates.push(fallback.to_string());
            }
        }
    }
    let mut selected = None;
    for candidate in candidates {
        if let Some(bytes) = download_codeload(ctx, repo, &candidate).await? {
            selected = Some((candidate, bytes));
            break;
        }
    }
    let (branch, bytes) = selected.ok_or_else(|| {
        AppError::NotFound(
            "GitHub branch was not found (tried the default, main, master and develop)".into(),
        )
    })?;
    let license = meta
        .as_ref()
        .and_then(|meta| meta.license.as_ref())
        .and_then(|license| license.spdx_id.clone())
        .filter(|value| !value.is_empty() && value != "NOASSERTION")
        .or(license_hint);
    let skills = skills_from_zip(
        &bytes,
        ZipMeta {
            author: author.to_string(),
            source_url: source_url.to_string(),
            license: license.clone(),
            stars: meta.as_ref().map(|meta| meta.stargazers_count).unwrap_or(0),
            branch: Some(branch.clone()),
            commit_ref: Some(branch.clone()),
            subpath,
        },
    )?;
    let _ = meta.as_ref().map(|meta| &meta.full_name);
    Ok(SourceSyncResult {
        skills,
        source_license: license,
    })
}

async fn download_codeload(
    ctx: &SourceContext<'_>,
    repo: &str,
    branch: &str,
) -> AppResult<Option<Vec<u8>>> {
    let mut url = Url::parse("https://codeload.github.com/")?;
    {
        let mut segments = url
            .path_segments_mut()
            .map_err(|_| AppError::Validation("Invalid GitHub archive URL".into()))?;
        for part in repo.split('/') {
            segments.push(part);
        }
        segments.push("zip");
        segments.push("refs");
        segments.push("heads");
        for part in branch.split('/') {
            segments.push(part);
        }
    }
    let mut request = ctx
        .http
        .get(url.as_str())
        .header("Accept", "application/zip");
    if let Some(token) = ctx.github_token {
        request = request.bearer_auth(token);
    }
    let response = request.send().await?;
    if response.status().as_u16() == 404 {
        return Ok(None);
    }
    if !response.status().is_success() {
        let status = response.status();
        if status.as_u16() == 403 || status.as_u16() == 429 {
            return Err(AppError::Other(
                "GitHub rate limit reached. Add a token in Settings or try again later.".into(),
            ));
        }
        return Err(AppError::Other(format!(
            "GitHub archive request failed ({status})"
        )));
    }
    if response
        .content_length()
        .is_some_and(|length| length > MAX_ZIP_BYTES)
    {
        return Err(AppError::Validation(
            "GitHub archive is larger than 64 MB".into(),
        ));
    }
    let mut stream = response.bytes_stream();
    let mut bytes = Vec::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        if (bytes.len() as u64 + chunk.len() as u64) > MAX_ZIP_BYTES {
            return Err(AppError::Validation(
                "GitHub archive is larger than 64 MB".into(),
            ));
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(Some(bytes))
}

async fn github_json<T: for<'de> Deserialize<'de>>(
    ctx: &SourceContext<'_>,
    url: &str,
) -> AppResult<T> {
    let mut request = ctx
        .http
        .get(url)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28");
    if let Some(token) = ctx.github_token {
        request = request.bearer_auth(token);
    }
    let response = request.send().await?;
    let status = response.status();
    if !status.is_success() {
        if status.as_u16() == 404 {
            return Err(AppError::NotFound(
                "GitHub repository or organization was not found".into(),
            ));
        }
        if status.as_u16() == 403 || status.as_u16() == 429 {
            return Err(AppError::Other(
                "GitHub rate limit reached. Add a token in Settings or try again later.".into(),
            ));
        }
        return Err(AppError::Other(format!(
            "GitHub API request failed ({status})"
        )));
    }
    response
        .json::<T>()
        .await
        .map_err(|error| AppError::Other(format!("Invalid GitHub response: {error}")))
}

fn config_for(source: &Source) -> AppResult<RepoConfig> {
    serde_json::from_value(source.config.clone())
        .map_err(|_| AppError::Validation("Invalid GitHub repository configuration".into()))
}

fn config_for_org(source: &Source) -> OrgConfig {
    serde_json::from_value(source.config.clone()).unwrap_or_default()
}

fn repo_from_url(url: &str) -> String {
    Url::parse(url)
        .ok()
        .map(|url| url.path().trim_matches('/').to_string())
        .unwrap_or_default()
}

fn org_from_url(url: &str) -> String {
    Url::parse(url)
        .ok()
        .and_then(|url| {
            url.path()
                .trim_matches('/')
                .split('/')
                .next()
                .map(str::to_string)
        })
        .unwrap_or_default()
}

fn validate_owner(owner: &str) -> AppResult<()> {
    if owner.is_empty()
        || owner.len() > 100
        || !owner.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')
        })
    {
        return Err(AppError::Validation("Invalid GitHub organization".into()));
    }
    Ok(())
}

fn validate_repo(repo: &str) -> AppResult<()> {
    let mut parts = repo.split('/');
    let owner = parts.next().unwrap_or_default();
    let name = parts.next().unwrap_or_default();
    if parts.next().is_some() || name.is_empty() {
        return Err(AppError::Validation("Invalid GitHub repository".into()));
    }
    validate_owner(owner)?;
    if name.len() > 100
        || name.starts_with('.')
        || !name.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')
        })
    {
        return Err(AppError::Validation("Invalid GitHub repository".into()));
    }
    Ok(())
}
