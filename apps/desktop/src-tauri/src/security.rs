use crate::domain::{Finding, SkillFile};
use regex::Regex;
use std::collections::BTreeSet;
use std::sync::OnceLock;

pub struct ScanResult {
    pub risk_level: String,
    pub score: i64,
    pub findings: Vec<Finding>,
}

const MAX_FINDINGS: usize = 40;

pub fn scan(files: &[SkillFile], readme: &str) -> ScanResult {
    let mut findings = Vec::new();
    let mut seen = BTreeSet::new();

    for file in files {
        if !is_license_path(&file.path) {
            scan_text(&file.path, &file.content, &mut findings, &mut seen);
        }
    }
    scan_text("SKILL.md", readme, &mut findings, &mut seen);

    findings.truncate(MAX_FINDINGS);
    let mut score: i64 = 100;
    let mut worst = "LOW";
    for finding in &findings {
        let (weight, level) = match finding.severity.as_str() {
            "CRITICAL" => (45, 4),
            "HIGH" => (30, 3),
            "MEDIUM" => (12, 2),
            _ => (4, 1),
        };
        score -= weight;
        if level == 4 {
            worst = "CRITICAL";
        } else if level == 3 && worst != "CRITICAL" {
            worst = "HIGH";
        } else if level == 2 && worst == "LOW" {
            worst = "MEDIUM";
        }
    }

    let risk_level = if worst == "LOW" && findings.is_empty() {
        "LOW"
    } else {
        worst
    };
    ScanResult {
        risk_level: risk_level.into(),
        score: score.clamp(0, 100),
        findings,
    }
}

fn scan_text(path: &str, text: &str, findings: &mut Vec<Finding>, seen: &mut BTreeSet<String>) {
    let lower = text.to_lowercase();

    for (code, severity, message, needles) in RULES {
        if needles.iter().any(|needle| lower.contains(needle)) {
            push(findings, seen, severity, code, message, Some(path));
        }
    }

    let hidden = text
        .chars()
        .any(|c| matches!(c, '\u{202a}'..='\u{202e}' | '\u{2066}'..='\u{2069}'));
    if hidden {
        push(
            findings,
            seen,
            "HIGH",
            "HIDDEN_UNICODE",
            "Contains hidden bidirectional text control characters.",
            Some(path),
        );
    }

    {
        let regex = url_regex();
        for matched in regex.find_iter(text) {
            let url = matched
                .as_str()
                .trim_end_matches(['.', ',', ')', ']', '>', '"', '\'']);
            if url.len() > 500 {
                continue;
            }
            if let Ok(parsed) = url::Url::parse(url) {
                let host = parsed.host_str().unwrap_or_default().to_ascii_lowercase();
                if host.is_empty() {
                    continue;
                }
                if parsed.scheme() == "http" {
                    push(
                        findings,
                        seen,
                        "MEDIUM",
                        "NON_HTTPS_LINK",
                        &format!("Uses a non-HTTPS link: {host}"),
                        Some(path),
                    );
                }
                if parsed.host_str().is_some_and(|host| {
                    host.parse::<std::net::IpAddr>().is_ok() && !host.starts_with("127.")
                }) {
                    push(
                        findings,
                        seen,
                        "HIGH",
                        "RAW_IP_LINK",
                        "Links to a raw IP address instead of a named host.",
                        Some(path),
                    );
                }
                if is_shortener(&host) {
                    push(
                        findings,
                        seen,
                        "MEDIUM",
                        "SHORTENER_LINK",
                        "Uses a link shortener, hiding the destination.",
                        Some(path),
                    );
                }
            }
        }
    }

    if is_script_path(path) {
        push(
            findings,
            seen,
            "LOW",
            "SCRIPT_FILE",
            "Includes an executable or script file. Skills Launcher never runs it.",
            Some(path),
        );
    }
}

const RULES: &[(&str, &str, &str, &[&str])] = &[
    (
        "PROMPT_INJECTION",
        "CRITICAL",
        "Contains language that tries to override or reveal agent instructions.",
        &[
            "ignore previous instructions",
            "ignore all previous instructions",
            "ignore prior instructions",
            "disregard previous instructions",
            "disregard the above",
            "reveal your system prompt",
            "reveal the system prompt",
            "print your system prompt",
            "do not tell the user",
            "without telling the user",
        ],
    ),
    (
        "EXFILTRATION",
        "CRITICAL",
        "Contains language or commands associated with sending data out.",
        &[
            "exfiltrate",
            "curl | sh",
            "curl | bash",
            "wget | sh",
            "powershell -enc",
            "invoke-expression",
            "invoke-webrequest",
            "base64 -d | sh",
        ],
    ),
    (
        "DESTRUCTIVE_COMMAND",
        "HIGH",
        "Contains a destructive shell command.",
        &[
            "rm -rf /",
            "del /f /s /q c:\\",
            "format c:",
            "remove-item -recurse -force",
        ],
    ),
    (
        "SECRET_REQUEST",
        "HIGH",
        "Asks for credentials, tokens or private keys.",
        &[
            "send your api key",
            "paste your token",
            "provide your password",
            "send me your private key",
            "upload your private key",
            "share your ssh key",
        ],
    ),
    (
        "REMOTE_EXECUTION",
        "HIGH",
        "Describes fetching and executing remote code.",
        &[
            "download and run",
            "execute the downloaded",
            "run the script from the internet",
        ],
    ),
    (
        "OVERRIDE_SAFETY",
        "HIGH",
        "Asks the agent to bypass safety or approval checks.",
        &[
            "bypass safety",
            "disable safety",
            "skip approval",
            "no confirmation needed",
            "auto-approve",
        ],
    ),
];

fn push(
    findings: &mut Vec<Finding>,
    seen: &mut BTreeSet<String>,
    severity: &str,
    code: &str,
    message: &str,
    file: Option<&str>,
) {
    let key = format!("{code}|{}", file.unwrap_or(""));
    if seen.insert(key) {
        findings.push(Finding {
            severity: severity.into(),
            code: code.into(),
            message: message.into(),
            file: file.map(str::to_string),
        });
    }
}

fn is_license_path(path: &str) -> bool {
    let name = path.rsplit('/').next().unwrap_or(path).to_ascii_lowercase();
    matches!(
        name.as_str(),
        "license" | "license.txt" | "license.md" | "copying" | "notice" | "notice.txt"
    )
}

fn is_script_path(path: &str) -> bool {
    let lower = path.to_ascii_lowercase();
    [
        ".exe", ".dll", ".bat", ".cmd", ".ps1", ".sh", ".py", ".js", ".ts", ".rb", ".pl", ".jar",
        ".msi", ".scr", ".vbs", ".com",
    ]
    .iter()
    .any(|extension| lower.ends_with(extension))
}

fn is_shortener(host: &str) -> bool {
    matches!(
        host,
        "bit.ly" | "t.co" | "tinyurl.com" | "goo.gl" | "ow.ly" | "is.gd" | "buff.ly"
    )
}

fn url_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| Regex::new(r#"https?://[^\s<>"']+"#).expect("valid URL regex"))
}
