/**
 * Source sync engine + DB-backed job queue. Server and CLI share this module;
 * imports stay relative so `tsx scripts/sync.ts` works without Next aliases.
 */

import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { Agent, fetch as undiciFetch } from "undici";
import {
  SCANNER_VERSION,
  hashSkillFiles,
  isSafeRelativePath,
  parseSkillMarkdown,
  qualityScore,
  scanSkillFiles,
  validateAllHosts,
  versionLabel,
  withFileHashes,
} from "@skills-hub/core";
import type {
  CompatibilityResult,
  ParsedSkill,
  QualityInput,
  ScanResult,
  SkillFile,
} from "@skills-hub/core";
import type { Prisma } from "@prisma/client";
import { db, ensureSqlitePragmas } from "../db";
import { normalizeSearch } from "../search";
import {
  fetchRawFile,
  getLatestCommitSha,
  getRepo,
  getTree,
  parseRepo,
  type GitHubRepo,
} from "./github";
import {
  buildSkillSlug,
  extractSkillRoots,
  selectSkillFiles,
  shouldAutoPublish,
  slugify,
} from "./select";

const MAX_RAW_FILE_BYTES = 512 * 1024;
const FETCH_CONCURRENCY = 4;
const JOB_LOCK_MINUTES = 30;

type SourceRow = NonNullable<Awaited<ReturnType<typeof db.source.findUnique>>>;
type ClaimedJob = NonNullable<Awaited<ReturnType<typeof db.job.findUnique>>>;

export interface SyncOptions {
  trigger?: string;
  maxSkills?: number;
  budget?: number;
}

export interface SyncSummary {
  runId: string;
  status: string;
  found: number;
  created: number;
  updated: number;
  unchanged: number;
  quarantined: number;
  archived: number;
}

interface Counters {
  found: number;
  created: number;
  updated: number;
  unchanged: number;
  quarantined: number;
  archived: number;
}

interface FeedItem {
  externalId: string;
  title: string;
  url: string;
  summary: string;
  publishedAt: Date | null;
}

export interface JobResult {
  jobId: string;
  sourceId?: string;
  status: "DONE" | "RETRY" | "FAILED";
  error?: string;
  summary?: SyncSummary;
}

export interface ProcessResult {
  reaped: number;
  results: JobResult[];
}

export interface SyncAllResult {
  sourceId: string;
  slug: string;
  status: string;
  summary?: SyncSummary;
  error?: string;
}

// ---------------------------------------------------------------------------
// Source sync
// ---------------------------------------------------------------------------

/** Sync one source and always persist a SyncRun, including on failure. */
export async function syncSource(
  sourceId: string,
  options: SyncOptions = {},
): Promise<SyncSummary> {
  const source = await db.source.findUnique({ where: { id: sourceId } });
  if (!source) throw new Error(`Source not found: ${sourceId}`);

  const run = await db.syncRun.create({
    data: {
      sourceId: source.id,
      status: "RUNNING",
      trigger: options.trigger ?? "manual",
    },
  });

  const counters: Counters = {
    found: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    quarantined: 0,
    archived: 0,
  };
  let status = "OK";
  let errorMessage: string | null = null;

  try {
    if (!source.enabled && !["admin", "cli"].includes(options.trigger ?? "")) {
      status = "SKIPPED";
      errorMessage = "Source is disabled; queued job skipped";
      return { runId: run.id, status, ...counters };
    }
    if (source.type === "GITHUB_REPO") {
      await syncGithubSource(source, options, counters);
    } else if (source.type === "RSS" || source.type === "HTTP_JSON") {
      await syncFeedSource(source, counters);
    } else {
      throw new Error(`Unsupported source type: ${source.type}`);
    }
    return { runId: run.id, status, ...counters };
  } catch (error) {
    status = "ERROR";
    errorMessage = redactTextUrls(error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    await db.syncRun
      .update({
        where: { id: run.id },
        data: { status, ...counters, error: errorMessage, finishedAt: new Date() },
      })
      .catch(() => undefined);
    await db.source
      .update({
        where: { id: source.id },
        data: {
          lastCheckedAt: new Date(),
          lastStatus: status,
          lastError: errorMessage,
        },
      })
      .catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// GitHub
// ---------------------------------------------------------------------------

async function syncGithubSource(
  source: SourceRow,
  options: SyncOptions,
  counters: Counters,
): Promise<void> {
  if (!source.repo) throw new Error(`Source ${source.slug} has no repo (owner/name)`);
  const parsedRepo = parseRepo(source.repo);
  if (!parsedRepo) throw new Error(`Invalid GitHub repo: ${source.repo}`);
  const { owner, name } = parsedRepo;

  const repo = await getRepo(owner, name);
  // owner/name is transferable; the numeric id is the stable identity an admin
  // approved. Refuse to keep importing if the repository changed hands.
  if (source.githubRepoId && String(repo.id) !== source.githubRepoId) {
    throw new Error(
      `Repository identity changed for ${owner}/${name} (expected id ${source.githubRepoId}, got ${repo.id}); review the source before syncing`,
    );
  }
  const license = normalizeLicense(repo.license);
  await db.source.update({
    where: { id: source.id },
    data: { githubRepoId: String(repo.id), license },
  });

  const ref = source.branch || repo.default_branch;
  const tree = await getTree(owner, name, ref);

  if (source.lastTreeSha === tree.sha && source.lastCheckedAt) {
    // Tree content is unchanged, but repo-level flags may have moved.
    await db.skill.updateMany({
      where: { sourceId: source.id },
      data: { archived: repo.archived },
    });
    counters.unchanged = await db.skill.count({
      where: { sourceId: source.id, status: { not: "ARCHIVED" } },
    });
    return;
  }

  let commitSha = tree.sha;
  try {
    commitSha = await getLatestCommitSha(owner, name, ref);
  } catch {
    // Commit sha is metadata; a moving ref still produces a correct content hash.
  }

  const configuredPath = (source.path ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/\/+$/, "");
  const prefix = configuredPath && configuredPath !== "." ? configuredPath : undefined;
  if (prefix && !isSafeRelativePath(prefix)) {
    throw new Error(`Invalid source path: ${source.path}`);
  }

  const maxSkills = options.maxSkills ?? 40;
  let budget = options.budget ?? 400;
  const allRoots = extractSkillRoots(
    tree.tree.map((entry) => entry.path),
    prefix,
  );
  const roots = allRoots.slice(0, maxSkills);
  counters.found = roots.length;

  const categoryIds = await loadCategoryIds();
  const now = new Date();
  let partial = false;

  for (const root of roots) {
    if (budget <= 0) {
      partial = true;
      break;
    }

    const selection = selectSkillFiles(root, tree.tree);
    if (!selection.files.includes("SKILL.md")) continue;
    if (selection.files.length > budget) {
      partial = true;
      break;
    }
    budget -= selection.files.length;

    const fetched = (
      await mapLimit(selection.files, FETCH_CONCURRENCY, async (relative) => {
        const repoPath = root === "." ? relative : `${root}/${relative}`;
        try {
          const raw = await fetchRawFile(owner, name, ref, repoPath, MAX_RAW_FILE_BYTES);
          return { path: relative, content: raw.text } satisfies SkillFile;
        } catch (error) {
          // One optional asset must not fail the whole source. The version is
          // quarantined below because its snapshot is incomplete.
          console.warn(`[sync] ${source.slug}: skipped ${repoPath}:`, error instanceof Error ? error.message : error);
          return null;
        }
      })
    ).filter((file): file is SkillFile => file !== null);
    if (!fetched.some((file) => file.path === "SKILL.md")) continue;
    const incompleteSnapshot = fetched.length !== selection.files.length;
    if (incompleteSnapshot) partial = true;

    const hashed = withFileHashes(fetched);
    const contentHash = hashSkillFiles(hashed);
    const skillMd = fetched.find((file) => file.path === "SKILL.md");
    if (!skillMd) continue;

    const parsed = parseSkillMarkdown(skillMd.content);
    const skill = parsed.ok ? parsed.skill : fallbackSkill(root, skillMd.content);
    const scan = scanSkillFiles(hashed);
    const compatibility = validateAllHosts(
      hashed,
      root === "." ? undefined : root.slice(root.lastIndexOf("/") + 1),
    );
    const compatibilityMap = Object.fromEntries(
      compatibility.map((result) => [result.host, result.status]),
    );
    const trust = sourceTrust(source.trustTier);
    const quality = qualityScore({
      sourceTrust: trust,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      pushedAt: repo.pushed_at,
      docsLength: skill.body.length,
      hasLicense: Boolean(license),
      hasInstallInstructions: /install|usage/i.test(skill.body),
      compatibilityVerified: compatibility.filter((result) => result.status === "VERIFIED").length,
      securityScore: scan.securityScore,
      riskLevel: scan.riskLevel,
      archived: repo.archived,
      hasDescription: Boolean(skill.description.trim()),
      fileCount: hashed.length,
    });
    const decision = shouldAutoPublish({
      trustTier: source.trustTier,
      parsedOk: parsed.ok,
      scan,
      quality,
    });
    if (incompleteSnapshot && decision.publish) {
      decision.publish = false;
      decision.reason = "snapshot is incomplete (some files could not be fetched)";
    }
    const categoryId = resolveCategoryId(
      `${skill.name}\n${skill.description}\n${skill.body}`,
      categoryIds,
    );
    const treePath =
      root === "." ? "" : `/${root.split("/").map(encodeURIComponent).join("/")}`;
    const versionSourceUrl = `https://github.com/${repo.full_name}/tree/${commitSha}${treePath}`;
    const repositoryUrl = repo.html_url || `https://github.com/${repo.full_name}`;
    const searchText = normalizeSearch(
      [skill.name, skill.description, skill.body, repo.full_name].join(" "),
    );
    const versionData: Omit<Prisma.SkillVersionUncheckedCreateInput, "skillId"> = {
      versionLabel: versionLabel(hashed, now),
      contentHash,
      commitSha,
      treeSha: tree.sha,
      files: JSON.stringify(hashed),
      readme: skill.body,
      frontmatter: JSON.stringify(skill.frontmatter ?? {}),
      fileCount: hashed.length,
      totalBytes: totalFileBytes(hashed),
      qualityScore: clampScore(quality.total),
      securityScore: clampScore(scan.securityScore),
      riskLevel: scan.riskLevel,
      scanFindings: JSON.stringify(scan.findings),
      compatibility: JSON.stringify(compatibilityMap),
      status: "QUARANTINED",
      incomplete: incompleteSnapshot,
      license,
      trustLevel: quality.trustLevel,
      scannerVersion: SCANNER_VERSION,
      sourceUrl: versionSourceUrl,
      fetchedAt: now,
      publishedAt: null,
    };

    const existing = await db.skill.findUnique({
      where: { sourceId_sourcePath: { sourceId: source.id, sourcePath: root } },
      include: { currentVersion: true },
    });

    // A rejection is a moderation decision, not a temporary sync state.
    if (existing?.status === "REJECTED" && decision.publish) {
      decision.publish = false;
      decision.reason = "skill was rejected by an admin";
    }

    if (existing?.currentVersion?.contentHash === contentHash) {
      counters.unchanged += 1;
      await db.skill.update({
        where: { id: existing.id },
        data: {
          stars: repo.stargazers_count,
          forks: repo.forks_count,
          archived: repo.archived,
          lastSyncedAt: now,
          // Re-evaluate trust/scan metadata when the source policy changed,
          // without silently unpublishing an existing snapshot.
          qualityScore: clampScore(quality.total),
          securityScore: clampScore(scan.securityScore),
          riskLevel: scan.riskLevel,
          trustLevel: quality.trustLevel,
          license,
          searchText,
        },
      });
      continue;
    }

    if (existing) {
      const duplicate = await db.skillVersion.findUnique({
        where: { skillId_contentHash: { skillId: existing.id, contentHash } },
      });
      if (duplicate) {
        if (duplicate.status === "QUARANTINED" && decision.publish && !duplicate.incomplete) {
          await db.$transaction(
            async (tx) => {
              await publishVersion(tx, {
                skillId: existing.id,
                versionId: duplicate.id,
                compatibility,
                categoryId: categoryId ?? existing.categoryId,
                quality,
                scan,
                repo,
                license,
                repositoryUrl,
                sourceUrl: duplicate.sourceUrl,
                searchText,
                now,
              });
            },
            { timeout: 30_000 },
          );
          counters.updated += 1;
        } else {
          counters.unchanged += 1;
          await db.skill.update({
            where: { id: existing.id },
            data: {
              lastSyncedAt: now,
              stars: repo.stargazers_count,
              forks: repo.forks_count,
              trustLevel: quality.trustLevel,
              qualityScore: clampScore(quality.total),
              securityScore: clampScore(scan.securityScore),
              riskLevel: scan.riskLevel,
              license,
              searchText,
            },
          });
        }
        continue;
      }

      await db.$transaction(
        async (tx) => {
          const version = await tx.skillVersion.create({
            data: { ...versionData, skillId: existing.id },
          });
          if (decision.publish) {
            await publishVersion(tx, {
              skillId: existing.id,
              versionId: version.id,
              compatibility,
              categoryId: categoryId ?? existing.categoryId,
              quality,
              scan,
              repo,
              license,
              repositoryUrl,
              sourceUrl: versionSourceUrl,
              searchText,
              now,
            });
          } else {
            await tx.skill.update({
              where: { id: existing.id },
              data: {
                lastSyncedAt: now,
                stars: repo.stargazers_count,
                forks: repo.forks_count,
                searchText,
              },
            });
          }
        },
        { timeout: 30_000 },
      );
      counters.updated += 1;
      if (!decision.publish) counters.quarantined += 1;
      continue;
    }

    const slug = await allocateSlug(skill.name, source.slug);
    await db.$transaction(
      async (tx) => {
        const created = await tx.skill.create({
          data: {
            slug,
            name: skill.name,
            summary: skill.description.slice(0, 500),
            description: skill.description,
            searchText,
            author: repo.full_name.split("/")[0] ?? source.name,
            repositoryUrl,
            sourceUrl: versionSourceUrl,
            license,
            stars: repo.stargazers_count,
            forks: repo.forks_count,
            status: "QUARANTINED",
            archived: repo.archived,
            categoryId,
            sourceId: source.id,
            sourcePath: root,
            sourceRef: ref,
            lastSyncedAt: now,
          },
        });
        const version = await tx.skillVersion.create({
          data: { ...versionData, skillId: created.id },
        });
        if (decision.publish) {
          await publishVersion(tx, {
            skillId: created.id,
            versionId: version.id,
            compatibility,
            categoryId,
            quality,
            scan,
            repo,
            license,
            repositoryUrl,
            sourceUrl: versionSourceUrl,
            searchText,
            now,
          });
        }
      },
      { timeout: 30_000 },
    );
    counters.created += 1;
    if (!decision.publish) counters.quarantined += 1;
  }

  const complete = !tree.truncated && allRoots.length <= roots.length && !partial;

  if (complete) {
    const rootSet = new Set(roots);
    const existingSkills = await db.skill.findMany({
      where: { sourceId: source.id, status: { not: "ARCHIVED" } },
      select: { id: true, sourcePath: true },
    });
    const stale = existingSkills.filter((skill) => !rootSet.has(skill.sourcePath));
    if (stale.length > 0) {
      const archived = await db.skill.updateMany({
        where: { id: { in: stale.map((skill) => skill.id) } },
        data: { status: "ARCHIVED" },
      });
      counters.archived += archived.count;
    }
  }

  if (repo.archived) {
    await db.skill.updateMany({
      where: { sourceId: source.id },
      data: { archived: true },
    });
  }

  if (complete) {
    await db.source.update({ where: { id: source.id }, data: { lastTreeSha: tree.sha } });
  }
}

interface PublishInput {
  skillId: string;
  versionId: string;
  compatibility: CompatibilityResult[];
  categoryId: string | null;
  quality: ReturnType<typeof qualityScore>;
  scan: ScanResult;
  repo: GitHubRepo;
  license: string | null;
  repositoryUrl: string;
  sourceUrl: string;
  searchText: string;
  now: Date;
}

/** Pointer move + metadata refresh + compatibility upserts, inside the caller's transaction. */
async function publishVersion(tx: Prisma.TransactionClient, input: PublishInput): Promise<void> {
  await tx.skillVersion.update({
    where: { id: input.versionId },
    data: { status: "PUBLISHED", publishedAt: input.now },
  });
  await tx.skill.update({
    where: { id: input.skillId },
    data: {
      currentVersionId: input.versionId,
      status: "ACTIVE",
      qualityScore: clampScore(input.quality.total),
      securityScore: clampScore(input.scan.securityScore),
      riskLevel: input.scan.riskLevel,
      trustLevel: input.quality.trustLevel,
      license: input.license,
      sourceUrl: input.sourceUrl,
      repositoryUrl: input.repositoryUrl,
      searchText: input.searchText,
      lastSyncedAt: input.now,
      categoryId: input.categoryId,
      stars: input.repo.stargazers_count,
      forks: input.repo.forks_count,
      archived: input.repo.archived,
    },
  });
  const hosts = input.compatibility.map((result) => result.host);
  await tx.skillHost.deleteMany({
    where: { skillId: input.skillId, ...(hosts.length ? { host: { notIn: hosts } } : {}) },
  });
  for (const result of input.compatibility) {
    const data = {
      status: result.status,
      notes: result.notes.join("\n"),
      validatedAt: input.now,
    };
    await tx.skillHost.upsert({
      where: { skillId_host: { skillId: input.skillId, host: result.host } },
      update: data,
      create: { skillId: input.skillId, host: result.host, ...data },
    });
  }
}

function normalizeLicense(license: GitHubRepo["license"]): string | null {
  const spdx = license?.spdx_id?.trim();
  if (!spdx || spdx === "NOASSERTION") return null;
  return spdx;
}

function sourceTrust(tier: string): QualityInput["sourceTrust"] {
  const value = tier.toUpperCase();
  if (value === "OFFICIAL") return "OFFICIAL";
  if (value === "VERIFIED") return "VERIFIED";
  return "COMMUNITY";
}

function fallbackSkill(root: string, raw: string): ParsedSkill {
  const directory = root === "." ? "root-skill" : root.slice(root.lastIndexOf("/") + 1);
  const heading = raw.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const firstLine = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#") && !line.startsWith("---"));
  const description = (heading ?? firstLine ?? directory).slice(0, 1024);
  return {
    name: heading ?? directory,
    description,
    frontmatter: {},
    body: raw,
  };
}

function totalFileBytes(files: SkillFile[]): number {
  return files.reduce(
    (total, file) =>
      total + Buffer.byteLength(file.content, file.encoding === "base64" ? "base64" : "utf8"),
    0,
  );
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

async function allocateSlug(name: string, sourceSlug: string): Promise<string> {
  const base = buildSkillSlug(name, sourceSlug);
  if (!(await slugTaken(base))) return base;

  const qualified = buildSkillSlug(name, sourceSlug, base);
  if (!(await slugTaken(qualified))) return qualified;

  let suffix = 2;
  while (suffix < 100) {
    const candidate = `${qualified}-${suffix}`;
    if (!(await slugTaken(candidate))) return candidate;
    suffix += 1;
  }
  return `${qualified}-${Date.now().toString(36)}`;
}

async function slugTaken(slug: string): Promise<boolean> {
  const row = await db.skill.findUnique({ where: { slug }, select: { id: true } });
  return Boolean(row);
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index] as T);
    }
  });
  await Promise.all(runners);
  return results;
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

const CATEGORY_RULES: Array<{ slug: string; pattern: RegExp }> = [
  { slug: "security", pattern: /\b(security|vulnerabilit(?:y|ies)|owasp|threat|encrypt|secrets?|audit|authentication|authorization|auth)\b/gi },
  { slug: "testing", pattern: /\b(tests?|testing|vitest|jest|cypress|playwright|e2e|tdd|quality assurance|qa)\b/gi },
  { slug: "database", pattern: /\b(database|sql|postgres(?:ql)?|mysql|sqlite|prisma|mongodb|redis|query|migration|schema)\b/gi },
  { slug: "devops", pattern: /\b(devops|docker|kubernetes|k8s|terraform|deploy(?:ment)?|ci\/cd|github actions|aws|azure|gcp|infrastructure)\b/gi },
  { slug: "ai", pattern: /\b(ai|llm|prompt|agents?|mcp|openai|anthropic|claude|gemini|rag|embeddings?|machine learning)\b/gi },
  { slug: "frontend", pattern: /\b(frontend|front-end|react|vue|svelte|angular|next\.?js|css|tailwind|html|browser|ui)\b/gi },
  { slug: "backend", pattern: /\b(backend|back-end|api|server|express|fastapi|django|flask|rails|spring|microservices?|node)\b/gi },
  { slug: "design", pattern: /\b(design|figma|ux|accessibility|a11y|typography|visual|brand|component library)\b/gi },
  { slug: "architecture", pattern: /\b(architecture|architect|refactor|system design|design patterns?|monorepo|code review|scalability)\b/gi },
  { slug: "automation", pattern: /\b(automation|automate|workflow|scripts?|scheduler|cron|scrap(?:er|ing)|puppeteer)\b/gi },
  { slug: "research", pattern: /\b(research|search|web search|documentation|docs|analysis|summarize|summary|citations?)\b/gi },
  { slug: "productivity", pattern: /\b(productivity|notes?|todo|writing|email|calendar|task|organization|planning)\b/gi },
];

async function loadCategoryIds(): Promise<Map<string, string>> {
  const categories = await db.category.findMany({ select: { id: true, slug: true } });
  return new Map(categories.map((category) => [category.slug, category.id]));
}

function resolveCategoryId(text: string, ids: Map<string, string>): string | null {
  let bestSlug: string | null = null;
  let bestScore = 0;
  for (const rule of CATEGORY_RULES) {
    const score = text.match(rule.pattern)?.length ?? 0;
    if (score > bestScore) {
      bestScore = score;
      bestSlug = rule.slug;
    }
  }
  return bestSlug ? (ids.get(bestSlug) ?? null) : null;
}

// ---------------------------------------------------------------------------
// RSS / HTTP JSON
// ---------------------------------------------------------------------------

function privateAddress(address: string): boolean {
  if (address.includes(":")) {
    const value = address.toLowerCase();
    return (
      value === "::1" ||
      value === "::" ||
      value.startsWith("fe80:") ||
      value.startsWith("fc") ||
      value.startsWith("fd") ||
      value.startsWith("::ffff:")
    );
  }
  const [a = 0, b = 0] = address.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

/** Resolve once and pin the connecting address to prevent DNS rebinding. */
async function assertPublicFeedTarget(
  rawUrl: string,
): Promise<{ address: string; family: 4 | 6 }> {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:") throw new Error("Feed sources must use https");
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".localhost")) {
    throw new Error("Private feed host blocked");
  }
  let records: Array<{ address: string; family: number }>;
  try {
    records = await lookup(host, { all: true });
  } catch {
    throw new Error(`Feed hostname could not be resolved: ${host}`);
  }
  const record = records.find((entry) => !privateAddress(entry.address));
  if (!record) throw new Error(`Feed hostname resolves to a private address: ${host}`);
  return { address: record.address, family: record.family === 6 ? 6 : 4 };
}

function redactTextUrls(text: string): string {
  return text.replace(/https?:\/\/[^\s"'<>]+/g, (raw) => {
    try {
      const url = new URL(raw);
      url.search = "";
      url.hash = "";
      url.username = "";
      url.password = "";
      return url.toString();
    } catch {
      return "[url]";
    }
  });
}

async function readCappedText(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error(`Feed body is ${declared} bytes (cap ${maxBytes})`);
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error(`Feed body exceeds ${maxBytes} bytes`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

async function syncFeedSource(source: SourceRow, counters: Counters): Promise<void> {
  const headers: Record<string, string> = {};
  if (source.etag) headers["If-None-Match"] = source.etag;
  if (source.lastModified) headers["If-Modified-Since"] = source.lastModified;
  if (source.type === "HTTP_JSON") {
    try {
      const config = JSON.parse(source.config) as { auth?: unknown };
      if (typeof config.auth === "string") {
        const token = process.env[config.auth]?.trim();
        if (token) headers.Authorization = `Bearer ${token}`;
      }
    } catch {
      // Invalid config only means no optional auth header.
    }
  }

  const target = await assertPublicFeedTarget(source.url);
  // Pin the resolved address for the actual connection. A second DNS lookup
  // would reopen a rebinding window between validation and fetch.
  const dispatcher = new Agent({
    connect: {
      lookup: ((_hostname: string, _options: unknown, callback: (...args: unknown[]) => void) =>
        callback(null, [{ address: target.address, family: target.family }])) as never,
    },
  });
  let text = "";
  let etag: string | null = null;
  let lastModified: string | null = null;
  try {
    const response = (await undiciFetch(source.url, {
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(25_000),
      dispatcher,
    })) as unknown as Response;
    etag = response.headers.get("etag");
    lastModified = response.headers.get("last-modified");
    if (response.status === 304) return;
    if (response.status >= 300 && response.status < 400) {
      throw new Error(`Feed ${source.url} redirects; register the final feed URL`);
    }
    if (!response.ok) {
      throw new Error(`Feed ${source.url} returned ${response.status}`);
    }
    text = await readCappedText(response, 2 * 1024 * 1024);
  } finally {
    await dispatcher.close();
  }

  const items = (source.type === "HTTP_JSON" ? parseJsonItems(text) : parseFeedItems(text)).slice(0, 50);
  const existing = await db.discovery.findMany({
    where: { sourceId: source.id },
    select: { externalId: true },
  });
  const known = new Set(existing.map((row) => row.externalId));
  let created = 0;
  let unchanged = 0;

  for (const item of items) {
    const externalId = item.externalId.trim();
    if (!externalId || !item.url) continue;
    if (known.has(externalId)) {
      await db.discovery.update({
        where: { sourceId_externalId: { sourceId: source.id, externalId } },
        data: {
          title: item.title,
          url: item.url,
          summary: item.summary,
          publishedAt: item.publishedAt,
        },
      });
      unchanged += 1;
    } else {
      await db.discovery.create({
        data: {
          sourceId: source.id,
          externalId,
          title: item.title,
          url: item.url,
          summary: item.summary,
          publishedAt: item.publishedAt,
          status: "NEW",
        },
      });
      known.add(externalId);
      created += 1;
    }
  }

  counters.found = items.length;
  counters.created = created;
  counters.unchanged = unchanged;
  await db.source.update({
    where: { id: source.id },
    data: {
      etag: etag ?? source.etag,
      lastModified: lastModified ?? source.lastModified,
    },
  });
}

function parseFeedItems(xml: string): FeedItem[] {
  const blocks = [...xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)];
  const items: FeedItem[] = [];
  for (const block of blocks) {
    const body = block[2] ?? "";
    const link = atomLink(body) ?? tagText(body, "link") ?? tagText(body, "guid");
    const url = stripTags(link ?? "");
    const externalId = stripTags(tagText(body, "guid") ?? tagText(body, "id") ?? url);
    if (!externalId || !url) continue;
    const title = stripTags(tagText(body, "title") ?? "");
    const summary = stripTags(
      tagText(body, "description") ?? tagText(body, "summary") ?? tagText(body, "content") ?? "",
    ).slice(0, 500);
    const publishedRaw =
      tagText(body, "pubDate") ??
      tagText(body, "published") ??
      tagText(body, "updated") ??
      tagText(body, "dc:date");
    items.push({
      externalId,
      title: title.slice(0, 300) || "Untitled",
      url,
      summary,
      publishedAt: toDate(publishedRaw),
    });
  }
  return items;
}

function parseJsonItems(raw: string): FeedItem[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("HTTP_JSON source returned invalid JSON");
  }
  const root = isRecord(data) ? data : {};
  const list = Array.isArray(data)
    ? data
    : Array.isArray(root.items)
      ? root.items
      : Array.isArray(root.entries)
        ? root.entries
        : Array.isArray(root.data)
          ? root.data
          : [];
  const items: FeedItem[] = [];
  for (const entry of list) {
    if (!isRecord(entry)) continue;
    const url = stringField(entry, ["url", "link", "html_url", "permalink"]);
    if (!url) continue;
    const externalId = stringField(entry, ["id", "guid", "uuid"]) ?? url;
    const title = stringField(entry, ["title", "name"]) ?? "Untitled";
    const summary = stringField(entry, ["summary", "description", "excerpt", "content"]) ?? "";
    const published = stringField(entry, [
      "publishedAt",
      "published",
      "pubDate",
      "date",
      "updated_at",
      "updated",
    ]);
    items.push({
      externalId,
      title: title.slice(0, 300),
      url,
      summary: summary.slice(0, 500),
      publishedAt: toDate(published),
    });
  }
  return items;
}

function tagText(block: string, name: string): string | null {
  const pattern = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i");
  const match = block.match(pattern);
  if (!match?.[1]) return null;
  return unwrapCdata(match[1]).trim() || null;
}

function atomLink(block: string): string | null {
  const match = block.match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\/?>/i);
  return match?.[1] ?? null;
}

function unwrapCdata(value: string): string {
  const match = value.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return match?.[1] ?? value;
}

function stripTags(value: string): string {
  return decodeEntities(unwrapCdata(value).replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (match, name: string) => named[name.toLowerCase()] ?? match);
}

function toDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (isRecord(value) && typeof value.text === "string" && value.text.trim()) {
      return value.text.trim();
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Job queue
// ---------------------------------------------------------------------------

/** Queue one SYNC_SOURCE job per due source, deduped against PENDING/RUNNING jobs. */
export async function enqueueDueSources(now: Date = new Date()): Promise<number> {
  await ensureSqlitePragmas();
  const sources = await db.source.findMany({ where: { enabled: true } });
  const active = await db.job.findMany({
    where: { status: { in: ["PENDING", "RUNNING"] } },
    select: { dedupeKey: true },
  });
  const activeKeys = new Set(active.map((job) => job.dedupeKey).filter(Boolean));
  let created = 0;

  for (const source of sources) {
    const dueAt = source.lastCheckedAt
      ? source.lastCheckedAt.getTime() + source.frequencyMinutes * 60_000
      : 0;
    if (dueAt > now.getTime()) continue;

    const dedupeKey = `sync:${source.id}`;
    if (activeKeys.has(dedupeKey)) continue;

    const queued = await db.$transaction(async (tx) => {
      const existing = await tx.job.findFirst({
        where: { dedupeKey, status: { in: ["PENDING", "RUNNING"] } },
        select: { id: true },
      });
      if (existing) return false;
      try {
        await tx.job.create({
          data: {
            type: "SYNC_SOURCE",
            payload: JSON.stringify({ sourceId: source.id }),
            dedupeKey,
            openKey: dedupeKey,
            runAt: now,
          },
        });
      } catch (error) {
        if ((error as { code?: string }).code === "P2002") return false;
        throw error;
      }
      return true;
    });
    if (queued) {
      activeKeys.add(dedupeKey);
      created += 1;
    }
  }
  return created;
}

/** Claim one runnable job; only the updateMany winner gets it. */
export async function claimJob(workerId: string): Promise<ClaimedJob | null> {
  // Another worker may win the conditional update; retry a few candidates so
  // one lost race does not look like an empty queue.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const job = await db.job.findFirst({
      where: { status: "PENDING", runAt: { lte: new Date() } },
      orderBy: { runAt: "asc" },
    });
    if (!job) return null;

    const claimed = await db.job.updateMany({
      where: { id: job.id, status: "PENDING" },
      data: {
        status: "RUNNING",
        lockedAt: new Date(),
        lockedBy: workerId,
        attempts: { increment: 1 },
      },
    });
    if (claimed.count === 1) return db.job.findUnique({ where: { id: job.id } });
  }
  return null;
}

/** Reap stale running jobs, then process up to `limit` jobs sequentially. */
export async function processJobs(limit = 5): Promise<ProcessResult> {
  await ensureSqlitePragmas();
  const workerId = `worker-${process.pid}-${randomUUID().slice(0, 8)}`;

  const reaped = await db.job.updateMany({
    where: {
      status: "RUNNING",
      lockedAt: { lt: new Date(Date.now() - JOB_LOCK_MINUTES * 60_000) },
    },
    data: { status: "PENDING", lockedAt: null, lockedBy: null },
  });

  const results: JobResult[] = [];
  for (let index = 0; index < limit; index += 1) {
    const job = await claimJob(workerId);
    if (!job) break;

    const sourceId = jobSourceId(job.payload);
    try {
      if (job.type !== "SYNC_SOURCE") throw new Error(`Unsupported job type: ${job.type}`);
      if (!sourceId) throw new Error("Job payload is missing sourceId");
      const summary = await syncSource(sourceId, { trigger: "scheduler" });
      await db.job.update({
        where: { id: job.id },
        data: { status: "DONE", lockedAt: null, lockedBy: null, lastError: null, openKey: null },
      });
      results.push({ jobId: job.id, sourceId, status: "DONE", summary });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (job.attempts < job.maxAttempts) {
        const delayMs = 2 ** job.attempts * 60_000;
        await db.job.update({
          where: { id: job.id },
          data: {
            status: "PENDING",
            runAt: new Date(Date.now() + delayMs),
            lockedAt: null,
            lockedBy: null,
            lastError: message,
          },
        });
        results.push({ jobId: job.id, sourceId: sourceId ?? undefined, status: "RETRY", error: message });
      } else {
        await db.job.update({
          where: { id: job.id },
          data: { status: "FAILED", lockedAt: null, lockedBy: null, lastError: message, openKey: null },
        });
        results.push({ jobId: job.id, sourceId: sourceId ?? undefined, status: "FAILED", error: message });
      }
    }
  }
  return { reaped: reaped.count, results };
}

function jobSourceId(payload: string): string | null {
  try {
    const parsed: unknown = JSON.parse(payload);
    return isRecord(parsed) && typeof parsed.sourceId === "string" ? parsed.sourceId : null;
  } catch {
    return null;
  }
}

export async function runDueSources(options: { limit?: number } = {}) {
  await ensureSqlitePragmas();
  const enqueued = await enqueueDueSources();
  const processed = await processJobs(options.limit ?? 5);
  return { enqueued, ...processed };
}

/** Seed/CLI helper: sync enabled sources sequentially, oldest check first. */
export async function syncAllEnabled(
  options: { maxSources?: number } = {},
): Promise<SyncAllResult[]> {
  await ensureSqlitePragmas();
  const sources = await db.source.findMany({
    where: { enabled: true },
    orderBy: { lastCheckedAt: "asc" },
    take: options.maxSources ?? 10,
  });
  const results: SyncAllResult[] = [];
  for (const source of sources) {
    try {
      const summary = await syncSource(source.id, { trigger: "cli" });
      results.push({ sourceId: source.id, slug: source.slug, status: summary.status, summary });
    } catch (error) {
      results.push({
        sourceId: source.id,
        slug: source.slug,
        status: "ERROR",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}
