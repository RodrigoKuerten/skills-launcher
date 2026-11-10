export type SourceKind =
  | "github_repo"
  | "github_org"
  | "local_dir"
  | "zip"
  | "git_repo"
  | "http_json";

export type TrustLevel = "OFFICIAL" | "VERIFIED" | "COMMUNITY";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type VersionStatus = "PUBLISHED" | "QUARANTINED";
export type SkillSort = "quality" | "recent" | "name" | "stars" | "security";
export type Theme = "dark" | "light";
export type SourceHealth = "ok" | "error" | "never" | "disabled";

export interface Source {
  id: string;
  name: string;
  kind: SourceKind;
  url: string;
  author: string;
  description: string;
  config: Record<string, unknown>;
  trust: TrustLevel;
  license: string | null;
  enabled: boolean;
  autoSync: boolean;
  intervalMinutes: number;
  lastSyncAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  skillCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SourceInput {
  name: string;
  kind: SourceKind;
  url: string;
  author?: string;
  description?: string;
  config?: Record<string, unknown>;
  trust?: TrustLevel;
  enabled?: boolean;
  autoSync?: boolean;
  intervalMinutes?: number;
}

export interface SourceRun {
  id: string;
  sourceId: string;
  status: string;
  found: number;
  created: number;
  updated: number;
  unchanged: number;
  blocked: number;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface Category {
  slug: string;
  name: string;
  description: string;
  icon: string;
  sortOrder: number;
  skillCount: number;
}

export interface Finding {
  severity: RiskLevel | string;
  code: string;
  message: string;
  file: string | null;
}

export interface VersionSummary {
  id: string;
  versionLabel: string;
  contentHash: string;
  publishedAt: string | null;
  createdAt: string;
  filesCount: number;
  securityScore: number;
  riskLevel: RiskLevel;
  status: VersionStatus;
  commitRef: string | null;
  findings: Finding[];
}

export interface SkillHost {
  host: string;
  status: string;
  notes: string;
}

export interface SkillSummary {
  id: string;
  slug: string;
  name: string;
  summary: string;
  author: string;
  category: string | null;
  license: string | null;
  repositoryUrl: string;
  sourceId: string;
  sourceName: string;
  sourceKind: SourceKind;
  trust: TrustLevel;
  riskLevel: RiskLevel;
  securityScore: number;
  qualityScore: number;
  stars: number;
  archived: boolean;
  status: string;
  latestVersion: VersionSummary | null;
  hosts: SkillHost[];
  installCount: number;
  updatedAt: string;
}

export interface SkillDetail extends SkillSummary {
  description: string;
  readme: string;
  versions: VersionSummary[];
  installations: Installation[];
}

export interface SkillQuery {
  q?: string;
  category?: string;
  sourceId?: string;
  host?: string;
  risk?: string;
  trust?: string;
  sort?: SkillSort;
  page?: number;
  pageSize?: number;
  includeBlocked?: boolean;
}

export interface SkillPage {
  items: SkillSummary[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export interface DetectedAgent {
  host: string;
  name: string;
  detected: boolean;
  executablePath: string | null;
  version: string | null;
  configPath: string | null;
  skillsPath: string | null;
  projectSkillsPath: string | null;
  supportsAgentSkills: boolean;
  autoInstall: boolean;
  notes: string[];
}

export interface Installation {
  id: string;
  skillId: string;
  skillName: string;
  skillSlug: string;
  versionId: string | null;
  versionLabel: string | null;
  host: string;
  installPath: string;
  contentHash: string;
  status: string;
  installedAt: string;
  updatedAt: string;
  latestVersionId: string | null;
  latestVersionLabel: string | null;
}

export interface Backup {
  id: string;
  installationId: string | null;
  skillId: string | null;
  host: string | null;
  path: string;
  versionLabel: string | null;
  contentHash: string | null;
  createdAt: string;
}

export interface Operation {
  id: string;
  kind: string;
  skillId: string | null;
  host: string | null;
  status: string;
  detail: string | null;
  createdAt: string;
}

export interface UpdateItem {
  installation: Installation;
  changeSummary: string;
}

export interface SyncSummary {
  runId: string;
  sourceId: string;
  status: string;
  found: number;
  created: number;
  updated: number;
  unchanged: number;
  blocked: number;
  error: string | null;
}

export interface Settings {
  theme: Theme | string;
  autoSync: boolean;
  autoSyncIntervalMinutes: number;
  githubTokenSet: boolean;
  remoteCatalogUrl: string;
}

export interface SettingsInput {
  theme?: string;
  autoSync?: boolean;
  autoSyncIntervalMinutes?: number;
  githubToken?: string;
  remoteCatalogUrl?: string;
}

export interface Stats {
  sources: number;
  enabledSources: number;
  skills: number;
  blockedSkills: number;
  installed: number;
  updates: number;
  categories: number;
  lastSyncAt: string | null;
}

export interface Bootstrap {
  stats: Stats;
  sources: Source[];
  categories: Category[];
  settings: Settings;
  recentOperations: Operation[];
}

export interface SourceExport {
  format: string;
  version: number;
  exportedAt: string;
  sources: SourceInput[];
}

export interface InstallOutcome {
  host: string;
  ok: boolean;
  message: string;
  installPath: string | null;
}

export interface InstallResponse {
  outcomes: InstallOutcome[];
}

export interface InstallRequest {
  skillId: string;
  versionId: string | null;
  hosts: string[];
  allowRisky: boolean;
}
