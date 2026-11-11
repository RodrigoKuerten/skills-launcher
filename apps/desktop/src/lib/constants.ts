import type { RiskLevel, SkillSort, SourceKind, TrustLevel } from "./types";

export const APP_NAME = "Skills Launcher";
export const APP_VERSION = "0.2.0";

export interface HostMeta {
  id: string;
  name: string;
}

/** Host ids mirror the AgentAdapter registry in the Rust backend. */
export const HOSTS: HostMeta[] = [
  { id: "claude-code", name: "Claude Code" },
  { id: "codex", name: "OpenAI Codex" },
  { id: "opencode", name: "OpenCode" },
  { id: "cursor", name: "Cursor" },
  { id: "windsurf", name: "Windsurf" },
  { id: "copilot", name: "GitHub Copilot" },
  { id: "gemini-cli", name: "Gemini CLI" },
];

const HOST_BY_ID = new Map(HOSTS.map((host) => [host.id, host]));

export function hostName(id: string): string {
  return HOST_BY_ID.get(id)?.name ?? id;
}

export const TRUST_LEVELS: Array<{ value: TrustLevel; label: string }> = [
  { value: "OFFICIAL", label: "Official" },
  { value: "VERIFIED", label: "Verified" },
  { value: "COMMUNITY", label: "Community" },
];

export const RISK_LEVELS: Array<{ value: RiskLevel; label: string }> = [
  { value: "LOW", label: "Low risk" },
  { value: "MEDIUM", label: "Medium risk" },
  { value: "HIGH", label: "High risk" },
  { value: "CRITICAL", label: "Critical risk" },
];

export const SKILL_SORTS: Array<{ value: SkillSort; label: string }> = [
  { value: "quality", label: "Quality" },
  { value: "recent", label: "Recently updated" },
  { value: "name", label: "Name A–Z" },
  { value: "stars", label: "Most stars" },
  { value: "security", label: "Safest" },
];

export const SOURCE_KINDS: Array<{
  value: SourceKind;
  label: string;
  description: string;
  configHint: string;
}> = [
  {
    value: "github_repo",
    label: "GitHub repository",
    description: "Scan a public repository for SKILL.md folders.",
    configHint: "https://github.com/owner/repo (tree URLs accepted)",
  },
  {
    value: "github_org",
    label: "GitHub organization",
    description: "Discover repositories in an organization and scan each one.",
    configHint: "https://github.com/owner",
  },
  {
    value: "local_dir",
    label: "Local folder",
    description: "Read skills from a folder on this machine.",
    configHint: "Selected with the native picker",
  },
  {
    value: "zip",
    label: "ZIP archive",
    description: "Read skills from a local ZIP archive.",
    configHint: "Selected with the native picker",
  },
  {
    value: "git_repo",
    label: "Git repository",
    description: "Clone a repository with system Git, then scan it.",
    configHint: "https://host/owner/repo.git",
  },
  {
    value: "http_json",
    label: "HTTP JSON catalog",
    description: "Load a catalog from a JSON endpoint.",
    configHint: "https://example.com/catalog.json",
  },
];

export const SOURCE_KIND_LABEL: Record<SourceKind, string> = Object.fromEntries(
  SOURCE_KINDS.map((kind) => [kind.value, kind.label]),
) as Record<SourceKind, string>;

export const OPERATION_LABEL: Record<string, string> = {
  install: "Install",
  update: "Update",
  uninstall: "Uninstall",
  remove: "Remove",
  rollback: "Rollback",
  sync: "Source sync",
  settings: "Settings",
  detect: "Agent scan",
  source_add: "Source added",
  source_remove: "Source removed",
  source_update: "Source updated",
};
