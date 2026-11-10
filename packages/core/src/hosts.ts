import type { HostDefinition, HostId } from "./types";

/**
 * Host registry. Verified against official documentation on 2026-11-09:
 * - https://code.claude.com/docs/en/skills
 * - https://developers.openai.com/codex/skills
 * - https://opencode.ai/docs/skills
 * - https://cursor.com/docs/skills
 * - https://docs.windsurf.com/windsurf/cascade/skills
 * - https://code.visualstudio.com/docs/copilot/customization/agent-skills
 * - https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/using-agent-skills.md
 *
 * `~` = user home. `%APPDATA%` / `%LOCALAPPDATA%` are expanded on Windows.
 * A host is never auto-installed unless detection has runtime evidence.
 */
export const HOSTS: HostDefinition[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    format: "agent-skills",
    supportsAgentSkills: true,
    executableNames: ["claude"],
    versionArgs: [["--version"], ["-v"]],
    configPaths: {
      win32: ["~/.claude"],
      darwin: ["~/.claude"],
      linux: ["~/.claude"],
    },
    skillsPaths: {
      win32: ["~/.claude/skills"],
      darwin: ["~/.claude/skills"],
      linux: ["~/.claude/skills"],
    },
    projectSkillsPath: ".claude/skills",
    exportOnly: false,
    docsUrl: "https://code.claude.com/docs/en/skills",
  },
  {
    id: "codex",
    name: "OpenAI Codex",
    format: "agent-skills",
    supportsAgentSkills: true,
    executableNames: ["codex"],
    versionArgs: [["--version"]],
    configPaths: {
      win32: ["~/.codex"],
      darwin: ["~/.codex"],
      linux: ["~/.codex"],
    },
    skillsPaths: {
      win32: ["~/.codex/skills", "~/.agents/skills"],
      darwin: ["~/.codex/skills", "~/.agents/skills"],
      linux: ["~/.codex/skills", "~/.agents/skills"],
    },
    projectSkillsPath: ".agents/skills",
    exportOnly: false,
    docsUrl: "https://developers.openai.com/codex/skills",
  },
  {
    id: "opencode",
    name: "OpenCode",
    format: "agent-skills",
    supportsAgentSkills: true,
    executableNames: ["opencode"],
    versionArgs: [["--version"], ["-v"]],
    configPaths: {
      win32: ["~/.config/opencode"],
      darwin: ["~/.config/opencode"],
      linux: ["~/.config/opencode"],
    },
    skillsPaths: {
      win32: ["~/.config/opencode/skills"],
      darwin: ["~/.config/opencode/skills"],
      linux: ["~/.config/opencode/skills"],
    },
    projectSkillsPath: ".opencode/skills",
    exportOnly: false,
    docsUrl: "https://opencode.ai/docs/skills",
  },
  {
    id: "cursor",
    name: "Cursor",
    format: "agent-skills",
    supportsAgentSkills: true,
    executableNames: ["agent", "cursor"],
    versionArgs: [["--version"], ["-v"]],
    configPaths: {
      win32: ["~/.cursor"],
      darwin: ["~/.cursor"],
      linux: ["~/.cursor", "~/.config/Cursor"],
    },
    skillsPaths: {
      win32: ["~/.cursor/skills"],
      darwin: ["~/.cursor/skills"],
      linux: ["~/.cursor/skills"],
    },
    projectSkillsPath: ".cursor/skills",
    exportOnly: false,
    docsUrl: "https://cursor.com/docs/skills",
  },
  {
    id: "windsurf",
    name: "Windsurf",
    format: "agent-skills",
    supportsAgentSkills: true,
    executableNames: ["windsurf", "devin"],
    versionArgs: [["--version"]],
    configPaths: {
      win32: ["~/.codeium/windsurf", "~/.config/devin"],
      darwin: ["~/.codeium/windsurf", "~/.config/devin"],
      linux: ["~/.config/devin"],
    },
    skillsPaths: {
      win32: ["~/.config/devin/skills", "~/.agents/skills"],
      darwin: ["~/.config/devin/skills", "~/.agents/skills"],
      linux: ["~/.config/devin/skills", "~/.agents/skills"],
    },
    projectSkillsPath: ".devin/skills",
    exportOnly: false,
    docsUrl: "https://docs.windsurf.com/windsurf/cascade/skills",
  },
  {
    id: "copilot",
    name: "GitHub Copilot",
    format: "agent-skills",
    supportsAgentSkills: true,
    executableNames: ["copilot"],
    versionArgs: [["version"], ["--version"]],
    configPaths: {
      win32: ["~/.copilot"],
      darwin: ["~/.copilot"],
      linux: ["~/.copilot"],
    },
    skillsPaths: {
      win32: ["~/.copilot/skills"],
      darwin: ["~/.copilot/skills"],
      linux: ["~/.copilot/skills"],
    },
    projectSkillsPath: ".github/skills",
    exportOnly: false,
    docsUrl: "https://code.visualstudio.com/docs/copilot/customization/agent-skills",
  },
  {
    id: "gemini-cli",
    name: "Gemini CLI",
    format: "agent-skills",
    supportsAgentSkills: true,
    executableNames: ["gemini"],
    versionArgs: [["--version"], ["-v"]],
    configPaths: {
      win32: ["~/.gemini"],
      darwin: ["~/.gemini"],
      linux: ["~/.gemini"],
    },
    skillsPaths: {
      win32: ["~/.gemini/skills"],
      darwin: ["~/.gemini/skills"],
      linux: ["~/.gemini/skills"],
    },
    projectSkillsPath: ".gemini/skills",
    exportOnly: false,
    docsUrl:
      "https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/using-agent-skills.md",
  },
];

export const HOST_MAP: Record<HostId, HostDefinition> = Object.fromEntries(
  HOSTS.map((host) => [host.id, host]),
) as Record<HostId, HostDefinition>;

export function getHost(id: string): HostDefinition | undefined {
  return Object.hasOwn(HOST_MAP, id) ? HOST_MAP[id as HostId] : undefined;
}

export function isHostId(value: string): value is HostId {
  return Object.hasOwn(HOST_MAP, value);
}

/** Licenses whose terms allow mirroring/download. Others are source-only. */
const PERMISSIVE_LICENSES = new Set([
  "MIT",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "MPL-2.0",
  "Unlicense",
  "CC0-1.0",
  "0BSD",
]);

export function isDownloadAllowed(license: string | null | undefined): boolean {
  if (!license) return false;
  return PERMISSIVE_LICENSES.has(license.trim());
}
