/**
 * Shared domain contracts. Web and the local companion both depend on these.
 * Keep this file dependency-free.
 */

export type HostId =
  | "claude-code"
  | "codex"
  | "opencode"
  | "cursor"
  | "windsurf"
  | "copilot"
  | "gemini-cli";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type TrustLevel =
  | "OFFICIAL"
  | "VERIFIED_COMMUNITY"
  | "IN_REVIEW"
  | "STALE"
  | "ARCHIVED"
  | "UNSAFE";

export type CompatibilityStatus = "VERIFIED" | "EXPORT_ONLY" | "UNSUPPORTED";

export interface SkillFile {
  /** POSIX-style relative path, e.g. "SKILL.md" or "scripts/run.py". */
  path: string;
  content: string;
  encoding?: "utf8" | "base64";
  /** sha256 of the decoded bytes; filled by the canonical file-set builder. */
  sha256?: string;
}

export interface ParsedSkill {
  name: string;
  description: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

export type ParseResult =
  | { ok: true; skill: ParsedSkill; warnings: string[] }
  | { ok: false; errors: string[]; warnings: string[] };

export type ScanCategory =
  | "shell"
  | "injection"
  | "secrets"
  | "obfuscation"
  | "files"
  | "network";

export interface ScanFinding {
  ruleId: string;
  severity: RiskLevel;
  category: ScanCategory;
  message: string;
  file: string;
  line?: number;
  excerpt?: string;
}

export interface ScanResult {
  findings: ScanFinding[];
  riskLevel: RiskLevel;
  securityScore: number;
  publishable: boolean;
  counts: Record<RiskLevel, number>;
}

export interface QualityInput {
  sourceTrust: "OFFICIAL" | "VERIFIED" | "COMMUNITY";
  stars: number;
  forks: number;
  pushedAt: string | Date | null;
  docsLength: number;
  hasLicense: boolean;
  hasInstallInstructions: boolean;
  compatibilityVerified: number;
  securityScore: number;
  riskLevel: RiskLevel;
  archived: boolean;
  hasDescription: boolean;
  fileCount: number;
}

export interface QualityResult {
  total: number;
  breakdown: Record<string, number>;
  trustLevel: TrustLevel;
  signals: string[];
}

export interface CompatibilityResult {
  host: HostId;
  status: CompatibilityStatus;
  notes: string[];
}

export type HostPlatform = "win32" | "darwin" | "linux";

export interface HostDefinition {
  id: HostId;
  name: string;
  /** The on-disk format the host understands today. */
  format: "agent-skills" | "rules";
  /** Agent Skills standard (SKILL.md) support, verified against official docs. */
  supportsAgentSkills: boolean;
  /** Executables used for PATH detection. */
  executableNames: string[];
  /** Arguments used to query the version; tried in order. */
  versionArgs: string[][];
  /** Known user configuration roots. Empty array = undocumented. */
  configPaths: Record<HostPlatform, string[]>;
  /** Candidate user-level skill directories, first existing one wins. */
  skillsPaths: Record<HostPlatform, string[]>;
  /** Repo-relative skill directory, when the host documents one. */
  projectSkillsPath: string | null;
  /** Never install automatically; export only. */
  exportOnly: boolean;
  docsUrl: string;
}

export interface InstallFile {
  path: string;
  content: string;
  encoding: "utf8" | "base64";
  sha256: string;
}

export interface SkillManifest {
  slug: string;
  name: string;
  versionLabel: string;
  contentHash: string;
  /** Integrity check only — the server and bytes share a trust domain. */
  integrity: "sha256-manifest";
  distribution: "FULL" | "SOURCE_ONLY";
  files: InstallFile[];
  compatibility: Partial<Record<HostId, CompatibilityStatus>>;
  instructions: string;
  sourceUrl: string;
}

export interface InstalledSkill {
  skillSlug: string;
  name: string;
  host: HostId;
  versionLabel: string;
  contentHash: string;
  installPath: string;
  installedAt: string;
  updatedAt: string;
  sourceUrl: string;
}

export interface DetectedAgent {
  host: HostId;
  name: string;
  detected: boolean;
  executablePath: string | null;
  version: string | null;
  configPath: string | null;
  skillsPath: string | null;
  supportsAgentSkills: boolean;
  autoInstall: boolean;
  notes: string[];
}

export const HOST_IDS: HostId[] = [
  "claude-code",
  "codex",
  "opencode",
  "cursor",
  "windsurf",
  "copilot",
  "gemini-cli",
];

export const RISK_ORDER: Record<RiskLevel, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};
