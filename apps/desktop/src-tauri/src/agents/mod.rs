mod install;

use crate::db::Db;
use crate::domain::DetectedAgent;
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::Duration;
use tokio::process::Command;

const MANUAL_AGENT_PREFIX: &str = "agent_manual.";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ManualAgentConfig {
    pub executable_path: Option<String>,
    pub skills_path: Option<String>,
}

pub use install::{
    auto_update, import_installed_skills, install_skill, list_backups, rollback_installation,
    uninstall_skill, update_installation,
};

pub(crate) struct HostDescriptor {
    id: &'static str,
    name: &'static str,
    executables: &'static [&'static str],
    user_root: &'static str,
    project_root: &'static str,
    docs_url: &'static str,
}

const HOSTS: &[HostDescriptor] = &[
    HostDescriptor {
        id: "claude-code",
        name: "Claude Code",
        executables: &["claude"],
        user_root: ".claude/skills",
        project_root: ".claude/skills",
        docs_url: "https://docs.anthropic.com/en/docs/claude-code",
    },
    HostDescriptor {
        id: "codex",
        name: "OpenAI Codex",
        executables: &["codex"],
        user_root: ".agents/skills",
        project_root: ".agents/skills",
        docs_url: "https://developers.openai.com/codex/",
    },
    HostDescriptor {
        id: "opencode",
        name: "OpenCode",
        executables: &["opencode", "opencode-cli"],
        user_root: ".config/opencode/skills",
        project_root: ".opencode/skills",
        docs_url: "https://opencode.ai/docs/skills/",
    },
    HostDescriptor {
        id: "cursor",
        name: "Cursor",
        executables: &["cursor-agent", "cursor"],
        user_root: ".cursor/skills",
        project_root: ".cursor/skills",
        docs_url: "https://cursor.com/docs/skills",
    },
    HostDescriptor {
        id: "copilot",
        name: "GitHub Copilot",
        executables: &["copilot"],
        user_root: ".copilot/skills",
        project_root: ".github/skills",
        docs_url:
            "https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills",
    },
    HostDescriptor {
        id: "gemini-cli",
        name: "Gemini CLI",
        executables: &["gemini"],
        user_root: ".gemini/skills",
        project_root: ".gemini/skills",
        docs_url: "https://geminicli.com/docs/cli/skills/",
    },
    HostDescriptor {
        id: "windsurf",
        name: "Windsurf / Devin Desktop",
        executables: &["devin-desktop", "windsurf"],
        user_root: ".codeium/windsurf/skills",
        project_root: ".windsurf/skills",
        docs_url: "https://docs.devin.ai/desktop/devin-desktop-faq",
    },
];

pub fn recover_stale_swaps(data_dir: &Path) {
    // Never wait on the UI thread: a held lock means an install is running, and every
    // install recovers its own root.
    let Some(_lock) = install::try_lock_installs(data_dir) else {
        return;
    };
    let Ok(home) = home_dir() else {
        return;
    };
    for descriptor in HOSTS {
        recover_swaps_in(&join_relative(&home, descriptor.user_root));
    }
}

/// Removes staging folders and restores targets left aside by an interrupted swap.
/// The caller must hold the install lock.
fn recover_swaps_in(root: &Path) {
    let Ok(entries) = std::fs::read_dir(root) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.starts_with('.') {
            continue;
        }
        if name.contains(".skills-launcher-tmp-") {
            let _ = std::fs::remove_dir_all(entry.path());
            continue;
        }
        let Some((target_name, _)) = name
            .trim_start_matches('.')
            .split_once(".skills-launcher-old-")
        else {
            continue;
        };
        if target_name.is_empty() {
            continue;
        }
        let target = root.join(target_name);
        if target.exists() {
            let _ = std::fs::remove_dir_all(entry.path());
        } else {
            let _ = std::fs::rename(entry.path(), target);
        }
    }
}

pub async fn detect_all(db: &Db) -> AppResult<Vec<DetectedAgent>> {
    let mut agents = Vec::new();
    for descriptor in HOSTS {
        agents.push(detect_one(db, descriptor).await?);
    }
    Ok(agents)
}

pub fn set_auto_install(db: &Db, host: &str, enabled: bool) -> AppResult<()> {
    descriptor(host)?;
    db.set_setting(
        &format!("agent_auto_install.{host}"),
        if enabled { "true" } else { "false" },
    )
}

pub(crate) fn descriptor(host: &str) -> AppResult<&'static HostDescriptor> {
    HOSTS
        .iter()
        .find(|descriptor| descriptor.id == host)
        .ok_or_else(|| AppError::Validation(format!("Unknown agent host: {host}")))
}

pub(crate) fn user_skills_root(descriptor: &HostDescriptor) -> AppResult<PathBuf> {
    Ok(join_relative(&home_dir()?, descriptor.user_root))
}

fn installed_count(db: &Db, host: &str) -> AppResult<i64> {
    db.with_conn(|conn| {
        Ok(conn.query_row(
            "SELECT COUNT(*) FROM installations WHERE host=?1 AND status='INSTALLED'",
            [host],
            |row| row.get(0),
        )?)
    })
}

pub(crate) fn load_manual_agent(db: &Db, host: &str) -> AppResult<Option<ManualAgentConfig>> {
    let Some(raw) = db.get_setting(&format!("{MANUAL_AGENT_PREFIX}{host}"))? else {
        return Ok(None);
    };
    if raw.trim().is_empty() {
        return Ok(None);
    }
    Ok(serde_json::from_str(&raw).ok())
}

/// The install root for a host, including a user-supplied manual skills path.
pub(crate) fn configured_skills_root(db: &Db, host: &str) -> AppResult<PathBuf> {
    if let Some(manual) = load_manual_agent(db, host)? {
        if let Some(path) = manual.skills_path {
            return Ok(PathBuf::from(path));
        }
    }
    user_skills_root(descriptor(host)?)
}

pub fn set_manual_agent(
    db: &Db,
    host: &str,
    executable_path: Option<&str>,
    skills_path: Option<&str>,
) -> AppResult<()> {
    let descriptor = descriptor(host)?;
    let home = crate::paths::canonical(&home_dir()?).map_err(AppError::Io)?;
    let executable_path = executable_path
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .map(|path| {
            if !path.is_absolute() || !path.is_file() {
                return Err(AppError::Validation(
                    "Manual executable must be an existing absolute file".into(),
                ));
            }
            Ok(path.to_string_lossy().to_string())
        })
        .transpose()?;
    let skills_path = skills_path
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .map(|path| {
            if !path.is_absolute() {
                return Err(AppError::Validation(
                    "Manual skills folder must be an absolute path".into(),
                ));
            }
            let canonical = crate::paths::canonical_or_create(&path).map_err(AppError::Io)?;
            if !canonical.starts_with(&home) || canonical == home {
                return Err(AppError::Security(
                    "Manual skills folder must stay inside the user's home directory".into(),
                ));
            }
            Ok(canonical.to_string_lossy().to_string())
        })
        .transpose()?;
    let config = ManualAgentConfig {
        executable_path,
        skills_path,
    };
    let installed = installed_count(db, host)?;
    let previous = load_manual_agent(db, host)?;
    if installed > 0
        && previous
            .as_ref()
            .and_then(|value| value.skills_path.as_ref())
            != config.skills_path.as_ref()
    {
        return Err(AppError::Validation(
            "Uninstall this agent's installed skills before changing its manual skills folder."
                .into(),
        ));
    }
    db.set_setting(
        &format!("{MANUAL_AGENT_PREFIX}{host}"),
        &serde_json::to_string(&config)
            .map_err(|error| AppError::Other(format!("Could not encode agent config: {error}")))?,
    )?;
    let _ = db.log_operation(
        "agent_manual",
        None,
        Some(host),
        "success",
        Some(&format!("{} added or updated manually", descriptor.name)),
    );
    Ok(())
}

pub fn clear_manual_agent(db: &Db, host: &str) -> AppResult<()> {
    descriptor(host)?;
    if installed_count(db, host)? > 0 {
        return Err(AppError::Validation(
            "Uninstall this agent's installed skills before removing the manual entry.".into(),
        ));
    }
    db.delete_setting(&format!("{MANUAL_AGENT_PREFIX}{host}"))?;
    let _ = db.log_operation(
        "agent_manual",
        None,
        Some(host),
        "success",
        Some("Manual agent entry removed"),
    );
    Ok(())
}

fn join_relative(base: &Path, relative: &str) -> PathBuf {
    relative
        .split('/')
        .fold(base.to_path_buf(), |path, part| path.join(part))
}

fn manual_entry_is_redundant(
    manual: &ManualAgentConfig,
    auto_detected: bool,
    default_root: &Path,
) -> bool {
    auto_detected
        && manual.executable_path.is_none()
        && manual
            .skills_path
            .as_deref()
            .map_or(true, |path| Path::new(path) == default_root)
}

async fn detect_one(db: &Db, descriptor: &HostDescriptor) -> AppResult<DetectedAgent> {
    let home = home_dir()?;
    let mut notes = Vec::new();
    let auto_executable = find_executable(descriptor);
    let mut executable = auto_executable.clone();
    if descriptor.id == "copilot" && executable.is_none() {
        if let Some(code) = which::which("code").ok().filter(|path| path.is_file()) {
            if has_copilot_extension(&home) {
                executable = Some(code);
                notes.push("VS Code GitHub Copilot extension found".into());
            }
        }
    }
    let mut detected = executable.is_some();
    let mut version = if let Some(executable) = &executable {
        let version = probe_version(executable).await;
        if version.is_none() {
            notes.push("Runtime found, but its version probe failed".into());
        }
        version
    } else {
        None
    };
    let config_path = config_candidates(descriptor, &home)
        .into_iter()
        .find(|path| path.exists());
    let github_copilot_cli = descriptor.id == "copilot"
        && version
            .as_deref()
            .is_some_and(|value| value.to_ascii_lowercase().contains("github copilot"));
    if descriptor.id == "copilot"
        && detected
        && !github_copilot_cli
        && config_path.is_none()
        && !has_copilot_extension(&home)
    {
        detected = false;
        executable = None;
        version = None;
        notes.push("A generic copilot executable was found, but no GitHub Copilot CLI, config or VS Code extension evidence exists.".into());
    }
    let mut skills_root = join_relative(&home, descriptor.user_root);
    let manual = load_manual_agent(db, descriptor.id)?;
    let mut manual_mode = false;
    if let Some(manual) = manual {
        if manual_entry_is_redundant(&manual, auto_executable.is_some(), &skills_root) {
            notes.push(
                "Automatic runtime evidence found; the manual entry is kept as a fallback.".into(),
            );
        } else {
            manual_mode = true;
            detected = true;
            if let Some(path) = &manual.executable_path {
                executable = Some(PathBuf::from(path));
            }
            if let Some(path) = &manual.skills_path {
                skills_root = PathBuf::from(path);
                notes.push(format!("Manual skills root: {}", skills_root.display()));
            }
            notes.push("Manually added: detection was overridden by the user.".into());
            if version.is_none() {
                if let Some(executable) = &executable {
                    version = probe_version(executable).await;
                }
            }
        }
    }
    if detected {
        if let Some(executable) = &executable {
            notes.push(format!("Runtime evidence: {}", executable.display()));
        } else if manual_mode {
            notes.push("No executable path was supplied for this manual entry.".into());
        }
        notes.push(format!("Docs: {}", descriptor.docs_url));
    } else {
        notes.push(
            "No runtime evidence found; folders alone are not treated as an installation.".into(),
        );
    }
    if !detected && config_path.is_some() {
        notes.push("A config folder exists, but the agent was not detected.".into());
    }
    if !detected && skills_root.exists() {
        notes.push("A skills folder exists, but the agent was not detected.".into());
    }
    if descriptor.id == "codex" {
        let alternate = home.join(".codex/skills");
        if skills_root.exists() && alternate.exists() && skills_root != alternate {
            notes.push(
                "Two Codex skill roots exist; .agents/skills is used for new installs.".into(),
            );
        }
    }
    let auto_install = db
        .get_setting(&format!("agent_auto_install.{}", descriptor.id))?
        .as_deref()
        == Some("true");
    Ok(DetectedAgent {
        host: descriptor.id.into(),
        name: descriptor.name.into(),
        detected,
        manual: manual_mode,
        executable_path: executable.map(|path| path.to_string_lossy().to_string()),
        version,
        config_path: config_path.map(|path| path.to_string_lossy().to_string()),
        skills_path: Some(skills_root.to_string_lossy().to_string()),
        project_skills_path: Some(descriptor.project_root.into()),
        supports_agent_skills: true,
        auto_install,
        notes,
    })
}

fn find_executable(descriptor: &HostDescriptor) -> Option<PathBuf> {
    for name in descriptor.executables {
        if let Ok(path) = which::which(name) {
            if is_executable_file(&path) {
                return Some(path);
            }
        }
    }
    let mut candidates = app_candidates(descriptor);
    if descriptor.id == "opencode" {
        candidates.sort_by_key(|path| {
            !path
                .file_name()
                .is_some_and(|name| name.to_string_lossy().contains("opencode-cli"))
        });
    }
    candidates.into_iter().find(|path| is_executable_file(path))
}

fn is_executable_file(path: &Path) -> bool {
    let Ok(metadata) = path.metadata() else {
        return false;
    };
    if !metadata.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        metadata.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))]
    {
        true
    }
}

fn home_dir() -> AppResult<PathBuf> {
    dirs::home_dir().ok_or_else(|| AppError::Other("Could not resolve the home directory".into()))
}

fn config_candidates(descriptor: &HostDescriptor, home: &Path) -> Vec<PathBuf> {
    let config = dirs::config_dir().unwrap_or_else(|| home.join(".config"));
    match descriptor.id {
        "claude-code" => vec![
            home.join(".claude.json"),
            home.join(".claude/settings.json"),
        ],
        "codex" => vec![home.join(".codex/config.toml")],
        "opencode" => vec![
            home.join(".config/opencode/opencode.json"),
            home.join(".config/opencode/opencode.jsonc"),
            config.join("opencode/opencode.json"),
        ],
        "cursor" => vec![
            config.join("Cursor/User/settings.json"),
            home.join(".cursor/settings.json"),
        ],
        "copilot" => vec![
            home.join(".copilot/config.json"),
            home.join(".config/github-copilot/config.json"),
        ],
        "gemini-cli" => vec![home.join(".gemini/settings.json")],
        "windsurf" => vec![
            home.join(".codeium/windsurf"),
            config.join("Windsurf/User/settings.json"),
        ],
        _ => Vec::new(),
    }
}

#[cfg(any(target_os = "linux", test))]
fn versioned_binary_candidates(root: &Path, binary: &str) -> Vec<PathBuf> {
    let Ok(versions) = std::fs::read_dir(root) else {
        return Vec::new();
    };
    let mut paths: Vec<PathBuf> = versions
        .flatten()
        .map(|version| version.path().join(binary))
        .filter(|path| is_executable_file(path))
        .collect();
    paths.sort();
    paths.reverse();
    paths
}

fn app_candidates(descriptor: &HostDescriptor) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    let host = descriptor.id;
    #[cfg(target_os = "linux")]
    if let Some(home) = dirs::home_dir() {
        for directory in [".local/bin", ".npm-global/bin", ".bun/bin"] {
            for name in descriptor.executables {
                paths.push(home.join(directory).join(name));
            }
        }
    }
    if let Some(local) = std::env::var_os("LOCALAPPDATA").map(PathBuf::from) {
        match host {
            "cursor" => {
                paths.push(local.join("Programs/Cursor/Cursor.exe"));
                paths.push(local.join("Programs/cursor/Cursor.exe"));
            }
            "windsurf" => paths.push(local.join("Programs/Windsurf/Windsurf.exe")),
            _ => {}
        }
    }
    if let Some(program_files) = std::env::var_os("PROGRAMFILES").map(PathBuf::from) {
        match host {
            "cursor" => paths.push(program_files.join("Cursor/Cursor.exe")),
            "windsurf" => paths.push(program_files.join("Windsurf/Windsurf.exe")),
            _ => {}
        }
    }
    if host == "opencode" {
        if let Some(local) = std::env::var_os("LOCALAPPDATA").map(PathBuf::from) {
            paths.push(local.join("Programs/@opencodedesktop/OpenCode.exe"));
        }
        if let Some(roaming) = std::env::var_os("APPDATA").map(PathBuf::from) {
            let cli = roaming.join("ai.opencode.desktop/cli");
            if let Ok(versions) = std::fs::read_dir(cli) {
                for version in versions.flatten() {
                    paths.push(version.path().join("opencode-cli.exe"));
                }
            }
        }
        #[cfg(target_os = "linux")]
        {
            if let Some(config) = dirs::config_dir() {
                paths.extend(versioned_binary_candidates(
                    &config.join("ai.opencode.desktop/cli"),
                    "opencode-cli",
                ));
            }
            // The Linux desktop package installs the Electron binary here; the
            // bundled CLI above is preferred because it answers --version.
            paths.push(PathBuf::from("/opt/OpenCode/ai.opencode"));
            paths.push(PathBuf::from("/opt/opencode/ai.opencode"));
            paths.push(PathBuf::from("/usr/lib/opencode/ai.opencode"));
        }
    }
    #[cfg(target_os = "macos")]
    {
        match host {
            "cursor" => paths.push(PathBuf::from(
                "/Applications/Cursor.app/Contents/MacOS/Cursor",
            )),
            "windsurf" => {
                paths.push(PathBuf::from(
                    "/Applications/Devin.app/Contents/MacOS/Devin",
                ));
                paths.push(PathBuf::from(
                    "/Applications/Windsurf.app/Contents/MacOS/Windsurf",
                ));
            }
            _ => {}
        }
    }
    #[cfg(target_os = "linux")]
    if host == "windsurf" {
        paths.push(PathBuf::from("/usr/bin/devin-desktop"));
        paths.push(PathBuf::from("/usr/share/devin-desktop/devin-desktop"));
        paths.push(PathBuf::from("/opt/devin-desktop/devin-desktop"));
        paths.push(PathBuf::from("/opt/windsurf/windsurf"));
        paths.push(PathBuf::from("/usr/share/windsurf/windsurf"));
    }
    paths
}

fn has_copilot_extension(home: &Path) -> bool {
    let extensions = home.join(".vscode/extensions");
    let Ok(entries) = std::fs::read_dir(extensions) else {
        return false;
    };
    entries.flatten().any(|entry| {
        entry
            .file_name()
            .to_string_lossy()
            .to_ascii_lowercase()
            .starts_with("github.copilot")
    })
}

#[cfg(test)]
#[allow(clippy::items_after_test_module)]
mod tests {
    use super::*;

    #[test]
    fn finds_versioned_opencode_cli_candidates_newest_first() {
        let root =
            std::env::temp_dir().join(format!("skills-launcher-cli-{}", uuid::Uuid::new_v4()));
        for version in ["2.3.0-x64", "2.4.0-x64", "2.5.0-x64"] {
            std::fs::create_dir_all(root.join(version)).unwrap();
        }
        std::fs::write(root.join("2.3.0-x64/opencode-cli"), b"x").unwrap();
        std::fs::write(root.join("2.4.0-x64/opencode-cli"), b"x").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            for path in [
                root.join("2.3.0-x64/opencode-cli"),
                root.join("2.4.0-x64/opencode-cli"),
            ] {
                std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755)).unwrap();
            }
        }

        let paths = versioned_binary_candidates(&root, "opencode-cli");
        let versions: Vec<String> = paths
            .iter()
            .filter_map(|path| path.parent()?.file_name()?.to_str().map(str::to_owned))
            .collect();
        assert_eq!(versions, vec!["2.4.0-x64", "2.3.0-x64"]);
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn redundant_manual_entry_becomes_a_fallback() {
        let default_root = Path::new("/home/u/.config/opencode/skills");
        let empty = ManualAgentConfig {
            executable_path: None,
            skills_path: None,
        };
        assert!(manual_entry_is_redundant(&empty, true, default_root));
        assert!(!manual_entry_is_redundant(&empty, false, default_root));
        assert!(!manual_entry_is_redundant(
            &ManualAgentConfig {
                executable_path: Some("/usr/bin/opencode".into()),
                skills_path: None,
            },
            true,
            default_root,
        ));
        assert!(!manual_entry_is_redundant(
            &ManualAgentConfig {
                executable_path: None,
                skills_path: Some("/custom/skills".into()),
            },
            true,
            default_root,
        ));
        assert!(manual_entry_is_redundant(
            &ManualAgentConfig {
                executable_path: None,
                skills_path: Some("/home/u/.config/opencode/skills".into()),
            },
            true,
            default_root,
        ));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn opencode_candidates_include_linux_desktop_binary() {
        let descriptor = HOSTS.iter().find(|host| host.id == "opencode").unwrap();
        assert!(app_candidates(descriptor)
            .iter()
            .any(|path| path == Path::new("/opt/OpenCode/ai.opencode")));
    }

    #[tokio::test]
    #[ignore = "reads the real machine to verify detection evidence"]
    async fn detect_real_agents() {
        let data =
            std::env::temp_dir().join(format!("skills-launcher-detect-{}", uuid::Uuid::new_v4()));
        let db = Db::open(&data).unwrap();
        let agents = detect_all(&db).await.unwrap();
        for agent in &agents {
            println!(
                "{} detected={} exe={:?} version={:?} skills={:?} notes={:?}",
                agent.name,
                agent.detected,
                agent.executable_path,
                agent.version,
                agent.skills_path,
                agent.notes
            );
        }
        assert_eq!(agents.len(), 7);
        let _ = std::fs::remove_dir_all(data);
    }
}

async fn probe_version(executable: &Path) -> Option<String> {
    #[cfg(windows)]
    {
        if executable.extension().is_some_and(|extension| {
            extension.eq_ignore_ascii_case("cmd") || extension.eq_ignore_ascii_case("bat")
        }) {
            return None;
        }
    }
    let mut command = Command::new(executable);
    command
        .arg("--version")
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);
    let output = tokio::time::timeout(Duration::from_secs(3), command.output())
        .await
        .ok()?
        .ok()?;
    let text = if output.stdout.is_empty() {
        String::from_utf8_lossy(&output.stderr)
    } else {
        String::from_utf8_lossy(&output.stdout)
    };
    text.lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(|line| line.chars().take(160).collect())
}
