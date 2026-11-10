/**
 * Pure selection rules for GitHub skill imports. No DB, network or Next imports:
 * the engine passes plain tree entries in, so every rule here is unit-testable.
 */

import type { RiskLevel } from "@skills-hub/core";

export interface TreeEntry {
  path: string;
  type?: string;
  size?: number;
}

export interface SelectOptions {
  maxFiles?: number;
  maxFileBytes?: number;
  maxTotalBytes?: number;
}

export interface SelectedFiles {
  files: string[];
  notes: string[];
  totalBytes: number;
}

export interface AutoPublishInput {
  trustTier: string;
  parsedOk: boolean;
  scan: {
    publishable: boolean;
    riskLevel?: RiskLevel;
    counts?: Partial<Record<RiskLevel, number>>;
  };
  quality: { total: number };
}

export interface AutoPublishDecision {
  publish: boolean;
  reason: string;
}

const DEFAULT_MAX_FILES = 80;
const DEFAULT_MAX_FILE_BYTES = 512 * 1024;
const DEFAULT_MAX_TOTAL_BYTES = 4 * 1024 * 1024;

const SKIP_SEGMENTS = new Set([".git", "node_modules", "template"]);

const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp", ".tiff", ".avif", ".svg",
  ".pdf", ".zip", ".gz", ".tgz", ".bz2", ".xz", ".7z", ".rar", ".tar", ".jar", ".war",
  ".exe", ".dll", ".so", ".dylib", ".bin", ".wasm", ".o", ".a", ".obj", ".lib", ".pyc",
  ".pyo", ".node", ".class", ".woff", ".woff2", ".ttf", ".otf", ".eot", ".mp3", ".mp4",
  ".m4a", ".wav", ".ogg", ".mov", ".avi", ".mkv", ".webm", ".flac", ".psd", ".ai",
  ".sketch", ".fig", ".db", ".sqlite", ".sqlite3", ".lockb",
]);

const LOCKFILES = new Set([
  "package-lock.json", "npm-shrinkwrap.json", "yarn.lock", "pnpm-lock.yaml", "bun.lock",
  "bun.lockb", "composer.lock", "poetry.lock", "cargo.lock", "gemfile.lock", "pipfile.lock",
  "flake.lock", "uv.lock", "go.sum",
]);

function normalize(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

function isUnsafe(path: string): boolean {
  if (!path || path.startsWith("/") || /^[A-Za-z]:/.test(path)) return true;
  return path.split("/").some((part) => !part || part === "." || part === "..");
}

/** Hidden/vendor path segments never contribute skill content. */
function isExcludedPath(path: string): boolean {
  const parts = path.split("/");
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i] ?? "";
    if (SKIP_SEGMENTS.has(part)) return true;
    if (part.startsWith(".")) return true;
    if (i > 0 && parts[i - 1] === ".github" && part.startsWith("plugin")) return true;
  }
  return false;
}

/**
 * Directories holding a case-sensitive `SKILL.md`. `prefix` limits the scan to
 * one repository subdirectory; returned roots stay repository-relative.
 */
export function extractSkillRoots(treePaths: string[], prefix?: string): string[] {
  const scope = normalize(prefix ?? "");
  if (scope && isUnsafe(scope)) return [];

  const roots = new Set<string>();
  for (const raw of treePaths) {
    const path = normalize(raw);
    if (!path || isUnsafe(path)) continue;
    if (path !== "SKILL.md" && !path.endsWith("/SKILL.md")) continue;

    const root = path === "SKILL.md" ? "." : path.slice(0, -"/SKILL.md".length);
    if (scope && root !== scope && !root.startsWith(`${scope}/`)) continue;
    // An explicit source.path may point inside a dot directory (e.g. skills/.curated);
    // only unconfigured hidden/vendor segments are skipped.
    const relativeRoot = scope
      ? root === scope
        ? ""
        : root.slice(scope.length + 1)
      : root;
    if (relativeRoot && relativeRoot !== "." && isExcludedPath(relativeRoot)) continue;
    roots.add(root);
  }
  return [...roots].sort();
}

/** Picks the portable, text, size-bounded subset of a skill directory. */
export function selectSkillFiles(
  root: string,
  treeEntries: TreeEntry[],
  options: SelectOptions = {},
): SelectedFiles {
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
  const base = root === "." || root === "" ? "" : normalize(root);

  const candidates: Array<{ path: string; size: number }> = [];
  let excludedVendor = 0;
  let excludedBinary = 0;
  let excludedLock = 0;
  let excludedLarge = 0;
  let excludedUnsafe = 0;
  const seen = new Set<string>();

  for (const entry of treeEntries) {
    if (entry.type && entry.type !== "blob") continue;
    const path = normalize(entry.path);
    if (!path || isUnsafe(path)) {
      excludedUnsafe += 1;
      continue;
    }
    if (base && !path.startsWith(`${base}/`)) continue;
    const relative = base ? path.slice(base.length + 1) : path;
    if (!relative || isUnsafe(relative)) {
      excludedUnsafe += 1;
      continue;
    }
    if (isExcludedPath(relative)) {
      excludedVendor += 1;
      continue;
    }
    if (seen.has(relative)) continue;

    const lower = relative.toLowerCase();
    const name = lower.slice(lower.lastIndexOf("/") + 1);
    const dot = name.lastIndexOf(".");
    const extension = dot > 0 ? name.slice(dot) : "";
    if (LOCKFILES.has(name)) {
      excludedLock += 1;
      continue;
    }
    if (BINARY_EXTENSIONS.has(extension)) {
      excludedBinary += 1;
      continue;
    }
    const size = entry.size ?? 0;
    if (entry.size != null && entry.size > maxFileBytes) {
      excludedLarge += 1;
      continue;
    }
    seen.add(relative);
    candidates.push({ path: relative, size });
  }

  candidates.sort((a, b) => {
    if (a.path === "SKILL.md") return -1;
    if (b.path === "SKILL.md") return 1;
    return a.path.localeCompare(b.path);
  });

  const files: string[] = [];
  const notes: string[] = [];
  let totalBytes = 0;
  let countCapped = false;
  let sizeCapped = false;

  for (const candidate of candidates) {
    if (files.length >= maxFiles) {
      countCapped = true;
      break;
    }
    if (totalBytes + candidate.size > maxTotalBytes) {
      sizeCapped = true;
      continue;
    }
    files.push(candidate.path);
    totalBytes += candidate.size;
  }

  if (excludedVendor) notes.push(`excluded ${excludedVendor} hidden/vendor path(s)`);
  if (excludedBinary) notes.push(`excluded ${excludedBinary} binary file(s)`);
  if (excludedLock) notes.push(`excluded ${excludedLock} lockfile(s)`);
  if (excludedLarge) notes.push(`excluded ${excludedLarge} file(s) over ${Math.round(maxFileBytes / 1024)}KB`);
  if (excludedUnsafe) notes.push(`excluded ${excludedUnsafe} unsafe path(s)`);
  if (countCapped) notes.push(`file cap reached (${maxFiles})`);
  if (sizeCapped) notes.push(`total size cap reached (${Math.round(maxTotalBytes / 1024)}KB)`);
  if (!files.includes("SKILL.md")) notes.push("SKILL.md missing from selection");

  return { files, notes, totalBytes };
}

/** Lowercase, portable slug. Collisions fall back to a source-qualified slug. */
export function buildSkillSlug(name: string, sourceSlug: string, existingSlug?: string): string {
  const base = slugify(name) || "skill";
  if (!existingSlug || slugify(existingSlug) !== base) return base;
  const suffix = slugify(sourceSlug) || "source";
  return `${base}-${suffix}`;
}

/** Pure auto-publish gate; anything questionable waits for review. */
export function shouldAutoPublish(input: AutoPublishInput): AutoPublishDecision {
  const tier = input.trustTier.toUpperCase();
  if (tier === "COMMUNITY") {
    return { publish: false, reason: "community sources always require review" };
  }
  if (tier !== "OFFICIAL" && tier !== "VERIFIED") {
    return { publish: false, reason: `unknown trust tier: ${input.trustTier}` };
  }
  if (!input.parsedOk) {
    return { publish: false, reason: "SKILL.md did not parse" };
  }
  if (!input.scan.publishable) {
    return { publish: false, reason: "scanner marked the skill unpublished" };
  }

  if (tier === "OFFICIAL") {
    if (input.quality.total < 60) {
      return { publish: false, reason: `quality ${input.quality.total} is below 60` };
    }
    return { publish: true, reason: "official source, publishable scan, quality >= 60" };
  }

  if (input.quality.total < 75) {
    return { publish: false, reason: `quality ${input.quality.total} is below 75` };
  }
  const counts = input.scan.counts ?? {};
  const mediumPlus =
    (counts.MEDIUM ?? 0) + (counts.HIGH ?? 0) + (counts.CRITICAL ?? 0);
  if (mediumPlus > 0 || (input.scan.riskLevel && input.scan.riskLevel !== "LOW")) {
    return { publish: false, reason: "verified source has MEDIUM+ findings" };
  }
  return { publish: true, reason: "verified source, quality >= 75, no MEDIUM+ findings" };
}

export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
