import { readSkillFrontmatter } from "./parser";
import type {
  RiskLevel,
  ScanCategory,
  ScanFinding,
  ScanResult,
  SkillFile,
} from "./types";
import { RISK_ORDER } from "./types";
import { isTextFile } from "./version";

export const SCANNER_VERSION = "1.0.0";

interface LineRule {
  ruleId: string;
  severity: RiskLevel;
  category: ScanCategory;
  message: string;
  pattern: RegExp;
}

const LINE_RULES: LineRule[] = [
  {
    ruleId: "pipe-to-shell",
    severity: "CRITICAL",
    category: "shell",
    message: "Downloads content and pipes it directly into a shell.",
    pattern:
      /\b(?:curl|wget)\b[^\n|]*\|\s*(?:sudo\s+)?(?:\S*\/)?(?:ba|z|da)?sh\b/i,
  },
  {
    ruleId: "powershell-encoded-command",
    severity: "CRITICAL",
    category: "shell",
    message: "Runs PowerShell with an encoded command, hiding the payload.",
    pattern:
      /\b(?:powershell|pwsh)(?:\.exe)?\b[^\n]{0,80}\s-(?:enc|encodedcommand)\b/i,
  },
  {
    ruleId: "invoke-expression",
    severity: "CRITICAL",
    category: "shell",
    message: "Executes dynamically built code with Invoke-Expression.",
    pattern: /\bInvoke-Expression\b/i,
  },
  {
    ruleId: "destructive-rm",
    severity: "CRITICAL",
    category: "shell",
    message:
      "Recursively force-deletes the filesystem root or the home directory.",
    pattern:
      /\brm\s+-(?:[a-z]*r[a-z]*f[a-z]*|[a-z]*f[a-z]*r[a-z]*)\s+(?:--\s+)?(?:\/|~|\$HOME)(?=[\s\/'"`;|&)]|$)/i,
  },
  {
    ruleId: "ssh-key-access",
    severity: "CRITICAL",
    category: "secrets",
    message: "References SSH keys or the ~/.ssh directory.",
    pattern:
      /(?:~|\$HOME|\/home\/[^\s/]+|\/Users\/[^\s/]+)\/\.ssh\b|\bid_(?:rsa|dsa|ecdsa|ed25519)\b/i,
  },
  {
    ruleId: "browser-credential-store",
    severity: "CRITICAL",
    category: "secrets",
    message: "References browser cookies or saved credentials.",
    pattern:
      /\b(?:Login Data|cookies\.sqlite|Cookies|logins\.json|key[34]\.db|Local State)\b/i,
  },
  {
    ruleId: "private-key-block",
    severity: "CRITICAL",
    category: "secrets",
    message: "Contains a private key block.",
    pattern: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/,
  },
  {
    ruleId: "prompt-injection",
    severity: "CRITICAL",
    category: "injection",
    message: "Contains instructions that try to override the agent's rules.",
    pattern:
      /(?:ignore|disregard)\s+(?:all\s+)?(?:previous|prior|above)\s+instructions|do\s+not\s+tell\s+the\s+user|don'?t\s+tell\s+the\s+user|disable\s+(?:all\s+)?(?:safety|guardrails?|security)/i,
  },
  {
    ruleId: "secret-exfiltration",
    severity: "CRITICAL",
    category: "injection",
    message: "Asks the agent to send or expose secrets.",
    pattern:
      /\b(?:send|upload|post|transmit|exfiltrate)\b[^\n]{0,80}(?:\.env\b|environment variables?|credentials?|api keys?|\.ssh\b)/i,
  },
  {
    ruleId: "exfiltration",
    severity: "CRITICAL",
    category: "injection",
    message: "Mentions exfiltrating data.",
    pattern: /\bexfiltrat(?:e|es|ed|ing|ion)\b/i,
  },
  {
    ruleId: "sudo",
    severity: "HIGH",
    category: "shell",
    message: "Runs commands with elevated privileges via sudo.",
    pattern: /\bsudo\b/i,
  },
  {
    ruleId: "chmod-777",
    severity: "HIGH",
    category: "shell",
    message: "Sets world-writable permissions with chmod 777.",
    pattern: /\bchmod\s+(?:-R\s+)?0?777\b/i,
  },
  {
    ruleId: "eval",
    severity: "HIGH",
    category: "injection",
    message: "Evaluates dynamically constructed code with eval().",
    pattern: /\beval\s*\(/i,
  },
  {
    ruleId: "child-process",
    severity: "HIGH",
    category: "shell",
    message: "Uses Node's child_process module to execute commands.",
    pattern: /\bchild_process\b/i,
  },
  {
    ruleId: "subprocess-shell",
    severity: "HIGH",
    category: "shell",
    message: "Runs a subprocess with shell=True.",
    pattern: /\bsubprocess\.[A-Za-z_]+\([^\n]*\bshell\s*=\s*True\b/,
  },
  {
    ruleId: "hardcoded-credential",
    severity: "HIGH",
    category: "secrets",
    message: "Contains a hardcoded API key, token or password.",
    pattern:
      /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b|\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b|\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b|(?:api[_-]?key|apikey|secret|token|password|passwd|access[_-]?key|private[_-]?key)\s*[:=]\s*["'`]?[A-Za-z0-9_\-+/=]{16,}/i,
  },
  {
    ruleId: "obfuscated-unicode",
    severity: "HIGH",
    category: "obfuscation",
    message: "Contains zero-width or bidirectional Unicode characters.",
    pattern: /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069]/,
  },
  {
    ruleId: "outbound-network",
    severity: "MEDIUM",
    category: "network",
    message: "Makes an outbound network request.",
    pattern:
      /\b(?:curl|wget)\b|\bfetch\s*\(|\brequests\.(?:get|post|put|patch|delete|head|request)\s*\(|\baxios(?:\.(?:get|post|put|patch|delete|head|request)|\.create)?\s*[.(]/i,
  },
  {
    ruleId: "write-outside-skill",
    severity: "MEDIUM",
    category: "files",
    message: "Writes files outside the skill directory.",
    pattern:
      /(?:^|[^=])>{1,2}\s*["']?(?:[A-Za-z]:[\\/]|~[\\/]|\$HOME[\\/]|\.\.[\\/]|\/(?:etc|usr|bin|sbin|boot|root|home|var|opt|tmp|Library|Applications|System)\b)/i,
  },
  {
    ruleId: "write-outside-skill",
    severity: "MEDIUM",
    category: "files",
    message: "Writes files outside the skill directory.",
    pattern:
      /\b(?:writeFile(?:Sync)?|appendFile(?:Sync)?|createWriteStream|open|shutil\.(?:copy|move)|cp|mv|install|rsync)\b[^\n]*(?:[A-Za-z]:[\\/]|~[\\/]|\$HOME[\\/]|\.\.[\\/]|\/(?:etc|usr|bin|sbin|boot|root|home|var|opt|tmp|Library|Applications|System)\b)/i,
  },
];

const EXECUTABLE_EXTENSIONS = new Set([
  "exe",
  "dll",
  "so",
  "dylib",
  "bin",
  "msi",
  "scr",
  "com",
  "bat",
  "cmd",
  "ps1",
  "sh",
  "bash",
  "zsh",
  "jar",
]);

const SCRIPT_EXTENSIONS = new Set([
  "sh",
  "bash",
  "zsh",
  "ps1",
  "bat",
  "cmd",
  "py",
  "js",
  "mjs",
  "cjs",
  "ts",
  "rb",
  "pl",
  "php",
  "lua",
]);

function displayPath(path: string): string {
  let normalized = path.replace(/\\/g, "/");
  normalized = normalized.replace(/^[A-Za-z]:\//, "");
  normalized = normalized.replace(/^\/+/, "");
  while (normalized.startsWith("./")) normalized = normalized.slice(2);
  return normalized;
}

function extensionOf(path: string): string {
  const base = path.replace(/\\/g, "/").split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot < 0 ? "" : base.slice(dot + 1).toLowerCase();
}

function redactSecrets(text: string): string {
  return text
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]")
    .replace(/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, "[REDACTED_AWS_KEY]")
    .replace(
      /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
      "[REDACTED_GITHUB_TOKEN]",
    )
    .replace(/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, "[REDACTED_GITHUB_TOKEN]")
    .replace(/\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g, "[REDACTED_API_KEY]")
    .replace(
      /((?:api[_-]?key|apikey|secret|token|password|passwd|access[_-]?key|private[_-]?key)\s*[:=]\s*["'`]?)[A-Za-z0-9_\-+/=]{8,}/gi,
      "$1[REDACTED]",
    );
}

function excerptOf(line: string): string {
  const clean = redactSecrets(line.trim());
  return clean.length <= 120 ? clean : `${clean.slice(0, 117)}...`;
}

function base64DecodedLength(content: string): number {
  const cleaned = content.replace(/\s+/g, "");
  if (cleaned.length === 0) return 0;
  const padding = cleaned.endsWith("==") ? 2 : cleaned.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((cleaned.length * 3) / 4) - padding);
}

function fileSizeBytes(file: SkillFile): number {
  if (file.encoding === "base64") return base64DecodedLength(file.content);
  return new TextEncoder().encode(file.content).length;
}

function hasWildcardAllowedTools(value: unknown): boolean {
  if (typeof value === "string") {
    return value.split(/[,\s]+/).includes("*");
  }
  if (Array.isArray(value)) {
    return value.some((item) => item === "*" || (typeof item === "string" && item.trim() === "*"));
  }
  return false;
}

export function scanSkillFiles(files: SkillFile[]): ScanResult {
  const findings: ScanFinding[] = [];
  const seen = new Set<string>();

  const add = (finding: ScanFinding): void => {
    const key = `${finding.ruleId}\0${finding.file}\0${finding.line ?? 0}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push(finding);
  };

  for (const file of files) {
    const filePath = displayPath(file.path);
    const extension = extensionOf(file.path);

    if (fileSizeBytes(file) > 200 * 1024) {
      add({
        ruleId: "oversized-file",
        severity: "LOW",
        category: "files",
        message: "File is larger than 200 KB.",
        file: filePath,
        excerpt: excerptOf(filePath),
      });
    }

    const hasDotSegment = file.path
      .replace(/\\/g, "/")
      .split("/")
      .some(
        (segment) =>
          segment.startsWith(".") && segment !== "." && segment !== "..",
      );

    if (hasDotSegment) {
      add({
        ruleId: "hidden-file",
        severity: "MEDIUM",
        category: "files",
        message: "Ships a hidden file or dotfile.",
        file: filePath,
        excerpt: excerptOf(filePath),
      });
    }

    if (EXECUTABLE_EXTENSIONS.has(extension)) {
      add({
        ruleId: "executable-file",
        severity: "MEDIUM",
        category: "files",
        message: "Ships an executable or shell-script file.",
        file: filePath,
        excerpt: excerptOf(filePath),
      });
    }

    // Binary and base64 files are only size-checked; never decode and scan them.
    if (file.encoding === "base64" || !isTextFile(file.path)) continue;

    const lines = file.content.split(/\r?\n/);
    const isSkillMarkdown =
      (file.path.replace(/\\/g, "/").split("/").pop() ?? "").toLowerCase() ===
      "skill.md";

    if (isSkillMarkdown) {
      const read = readSkillFrontmatter(file.content);
      if (read.ok && hasWildcardAllowedTools(read.frontmatter["allowed-tools"])) {
        const index = lines.findIndex((line) =>
          /^\s*allowed-tools\s*:/i.test(line),
        );
        add({
          ruleId: "allowed-tools-wildcard",
          severity: "LOW",
          category: "shell",
          message: "Grants wildcard tool permissions via allowed-tools.",
          file: filePath,
          line: index >= 0 ? index + 1 : undefined,
          excerpt: index >= 0 ? excerptOf(lines[index] ?? "") : undefined,
        });
      }
    }

    let insideFence = false;
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? "";
      const lineNumber = index + 1;

      for (const rule of LINE_RULES) {
        if (rule.pattern.test(line)) {
          add({
            ruleId: rule.ruleId,
            severity: rule.severity,
            category: rule.category,
            message: rule.message,
            file: filePath,
            line: lineNumber,
            excerpt: excerptOf(line),
          });
        }
      }

      const isFence = /^\s*(?:```|~~~)/.test(line);
      const executableContext =
        SCRIPT_EXTENSIONS.has(extension) || (isSkillMarkdown && insideFence);

      if (
        !isFence &&
        executableContext &&
        /[A-Za-z0-9+/]{121,}={0,2}/.test(line)
      ) {
        add({
          ruleId: "long-base64-blob",
          severity: "HIGH",
          category: "obfuscation",
          message: "Contains a long base64 blob in an executable context.",
          file: filePath,
          line: lineNumber,
          excerpt: excerptOf(line),
        });
      }

      if (isFence) insideFence = !insideFence;
    }
  }

  const counts: Record<RiskLevel, number> = {
    LOW: 0,
    MEDIUM: 0,
    HIGH: 0,
    CRITICAL: 0,
  };

  let riskLevel: RiskLevel = "LOW";
  for (const finding of findings) {
    counts[finding.severity] += 1;
    if (RISK_ORDER[finding.severity] > RISK_ORDER[riskLevel]) {
      riskLevel = finding.severity;
    }
  }

  const securityScore = Math.max(
    0,
    100 -
      counts.CRITICAL * 40 -
      counts.HIGH * 20 -
      counts.MEDIUM * 8 -
      counts.LOW * 2,
  );

  return {
    findings,
    riskLevel,
    securityScore,
    publishable: counts.HIGH === 0 && counts.CRITICAL === 0,
    counts,
  };
}
