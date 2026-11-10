import { randomBytes, randomUUID } from "node:crypto";
import { cp, lstat, mkdir, readdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  HOSTS,
  getHost,
  hashSkillFiles,
  isSafeRelativePath,
  sha256Hex,
  type HostId,
  type InstallFile,
  type InstalledSkill,
  type SkillManifest,
} from "@skills-hub/core";
import { adapterFor, currentPlatform, isKnownHost, isNetworkPath } from "./adapters.js";
import { detectAgents } from "./detect.js";
import { appendJournal, backupsRoot, getHubHome, readState, updateState, type BackupRecord } from "./store.js";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;
const MAX_FILES = 80;
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;
const MAX_FILE_BYTES = 512 * 1024;
const MANIFEST_BODY_LIMIT = 16 * 1024 * 1024;

export interface ResolveRootOptions {
  projectDir?: string;
  rootOverride?: string;
}

export interface InstallOptions extends ResolveRootOptions {
  host: HostId;
  mode?: "user" | "project";
  /** The slug the caller requested; the manifest must not substitute it. */
  expectedSlug?: string;
}

export interface InstallResult {
  installed: InstalledSkill;
  backup: BackupRecord | null;
  files: number;
}

export interface RemoveResult {
  removed: boolean;
  backup: BackupRecord | null;
  path: string | null;
  installation: InstalledSkill;
}

export interface RollbackResult {
  installed: InstalledSkill;
  backup: BackupRecord;
}

export interface UpdateCandidate {
  slug: string;
  host: HostId;
  currentVersion: string;
  latestVersion: string;
  currentHash: string;
  latestHash: string;
  installPath: string;
}

export interface UpdatesResult {
  updates: UpdateCandidate[];
  errors: Array<{ slug: string; message: string }>;
}

export function assertSlug(slug: string): void {
  if (typeof slug !== "string" || !SLUG_RE.test(slug)) {
    throw new Error("Invalid skill slug: expected lowercase letters, digits and dashes (max 80).");
  }
}

function assertSafeManifestPath(path: string): void {
  if (isNetworkPath(path) || isAbsolute(path) || !isSafeRelativePath(path)) {
    throw new Error(`Unsafe file path in manifest: ${JSON.stringify(path)}`);
  }
  if (process.platform === "win32") {
    const windowsUnsafe = path.split("/").some(
      (segment) =>
        /[<>:"|?*]/.test(segment) ||
        /[ .]$/.test(segment) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(segment),
    );
    if (windowsUnsafe) {
      throw new Error(`File path is not portable to Windows: ${JSON.stringify(path)}`);
    }
  }
}

function decodedFile(file: InstallFile): Buffer {
  const encoding = file.encoding === "base64" ? "base64" : "utf8";
  return Buffer.from(file.content, encoding);
}

/**
 * Validate a manifest before any filesystem work. Integrity only — the
 * manifest and its bytes come from the same server trust domain.
 */
export function verifyManifest(manifest: SkillManifest): void {
  if (!manifest || typeof manifest !== "object") throw new Error("Manifest must be an object.");
  assertSlug(manifest.slug);
  if (manifest.integrity !== "sha256-manifest") {
    throw new Error("Manifest must use sha256-manifest integrity.");
  }
  if (manifest.distribution !== "FULL") {
    throw new Error("This skill is source-only; a full file manifest is required to install.");
  }
  for (const [key, value] of [
    ["name", manifest.name],
    ["versionLabel", manifest.versionLabel],
    ["instructions", manifest.instructions],
    ["sourceUrl", manifest.sourceUrl],
  ] as const) {
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(`Manifest ${key} must be a non-empty string.`);
    }
  }
  if (!Array.isArray(manifest.files)) throw new Error("Manifest files must be an array.");
  if (manifest.files.length > MAX_FILES) {
    throw new Error(`Manifest has too many files (${manifest.files.length} > ${MAX_FILES}).`);
  }
  if (typeof manifest.contentHash !== "string" || !/^[a-f0-9]{64}$/i.test(manifest.contentHash)) {
    throw new Error("Manifest contentHash must be a sha256 hex digest.");
  }

  const seen = new Set<string>();
  const seenPortable = new Set<string>();
  let totalBytes = 0;
  const normalized: InstallFile[] = [];

  for (const file of manifest.files) {
    if (!file || typeof file !== "object" || typeof file.path !== "string" || typeof file.content !== "string") {
      throw new Error("Every manifest file needs a string path and content.");
    }
    assertSafeManifestPath(file.path);
    if (seen.has(file.path)) throw new Error(`Duplicate file path in manifest: ${file.path}`);
    const portable = file.path.normalize("NFC").toLowerCase();
    if (seenPortable.has(portable)) {
      throw new Error(`Duplicate file path (case-insensitive) in manifest: ${file.path}`);
    }
    seen.add(file.path);
    seenPortable.add(portable);

    const encoding: "utf8" | "base64" = file.encoding === "base64" ? "base64" : "utf8";
    const bytes = Buffer.from(file.content, encoding);
    if (bytes.length > MAX_FILE_BYTES) {
      throw new Error(`File too large: ${file.path} (${bytes.length} > ${MAX_FILE_BYTES} bytes).`);
    }
    totalBytes += bytes.length;
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new Error(`Manifest exceeds the ${MAX_TOTAL_BYTES} byte total size limit.`);
    }

    const digest = sha256Hex(bytes);
    if (file.sha256 !== digest) {
      throw new Error(`Checksum mismatch for ${file.path}.`);
    }
    normalized.push({ path: file.path, content: file.content, encoding, sha256: digest });
  }

  const computed = hashSkillFiles(normalized);
  if (computed !== manifest.contentHash) {
    throw new Error("Manifest content hash does not match its files.");
  }
}

function isInside(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel) && !rel.startsWith(`..${sep}`));
}

function assertAbsolutePath(path: string, label: string): string {
  if (typeof path !== "string" || !path.trim() || !isAbsolute(path) || isNetworkPath(path)) {
    throw new Error(`${label} must be an absolute local path.`);
  }
  return resolve(path);
}

async function assertDirectory(path: string, label: string): Promise<string> {
  const info = await stat(path);
  if (!info.isDirectory()) throw new Error(`${label} is not a directory.`);
  return realpath(path);
}

async function firstExistingDirectory(paths: string[]): Promise<string | null> {
  for (const path of paths) {
    try {
      if ((await stat(path)).isDirectory()) return path;
    } catch {
      // keep looking
    }
  }
  return null;
}

/**
 * Allowed roots are the documented user skill directories, an explicit
 * project root passed by the caller, an explicit test/intentional override,
 * or the companion home for backups.
 */
export async function resolveInstallRoot(
  hostId: HostId,
  options: ResolveRootOptions = {},
): Promise<string> {
  if (!isKnownHost(hostId)) throw new Error(`Unknown host: ${hostId}`);

  if (options.rootOverride) {
    return assertAbsolutePath(options.rootOverride, "rootOverride");
  }

  const host = getHost(hostId);
  if (!host) throw new Error(`Unknown host: ${hostId}`);
  const adapter = adapterFor(hostId, currentPlatform());

  if (options.projectDir) {
    const project = await assertDirectory(
      assertAbsolutePath(options.projectDir, "projectDir"),
      "projectDir",
    );
    if (!host.projectSkillsPath) {
      throw new Error(`${host.name} does not document a project-level skill directory.`);
    }
    const root = join(project, host.projectSkillsPath);
    if (!isInside(project, root)) throw new Error("Project skill directory escapes the project.");
    return root;
  }

  if (adapter.skillsPaths.length === 0) {
    throw new Error(`No user skill directory is documented for ${host.name} on this platform.`);
  }
  const existing = await firstExistingDirectory(adapter.skillsPaths);
  return existing ?? adapter.skillsPaths[0]!;
}

function safeIso(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function managedKey(host: HostId, slug: string): string {
  return `${host}:${slug}`;
}

async function listFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(current: string): Promise<void> {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const path = join(current, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) files.push(relative(root, path).split(sep).join("/"));
    }
  }
  await walk(root);
  return files.sort();
}

async function recordBackup(
  host: HostId,
  slug: string,
  sourceDir: string,
  previous: InstalledSkill | undefined,
  managedFiles: string[] | undefined,
): Promise<BackupRecord> {
  const dest = join(backupsRoot(), host, `${slug}-${safeIso()}-${randomBytes(3).toString("hex")}`);
  await mkdir(dirname(dest), { recursive: true, mode: 0o700 });
  await cp(sourceDir, dest, {
    recursive: true,
    force: false,
    errorOnExist: true,
    dereference: false,
    preserveTimestamps: true,
  });
  const backup: BackupRecord = {
    id: randomUUID(),
    host,
    skillSlug: slug,
    path: dest,
    createdAt: new Date().toISOString(),
    versionLabel: previous?.versionLabel ?? "unknown",
    contentHash: previous?.contentHash ?? "",
    managedFiles,
  };
  await updateState((state) => {
    state.backups.push(backup);
  });
  return backup;
}

async function writeManifestFiles(tmpDir: string, files: InstallFile[]): Promise<void> {
  for (const file of files) {
    const destination = join(tmpDir, file.path);
    if (!isInside(tmpDir, destination)) throw new Error(`Refusing to write outside the install directory: ${file.path}`);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, decodedFile(file), { mode: 0o644 });
  }
}

async function copyUnknownFiles(
  sourceDir: string,
  tmpDir: string,
  known: Set<string>,
  previousManaged: string[] | undefined,
): Promise<void> {
  const managed = previousManaged ? new Set(previousManaged) : null;
  async function walk(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const sourcePath = join(current, entry.name);
      const relativePath = relative(sourceDir, sourcePath).split(sep).join("/");
      if (entry.isDirectory()) {
        await walk(sourcePath);
        continue;
      }
      if (!entry.isFile() || known.has(relativePath)) continue;
      // Files the previous manifest owned but the new one no longer lists are
      // dropped; files outside that set are user extras and survive updates.
      if (managed?.has(relativePath)) continue;
      const destination = join(tmpDir, ...relativePath.split("/"));
      if (!isInside(tmpDir, destination)) continue;
      try {
        await mkdir(dirname(destination), { recursive: true });
        await cp(sourcePath, destination, { force: false, errorOnExist: true, dereference: false });
      } catch {
        // A colliding directory/file shape is resolved by the manifest write,
        // which already happened; unknown extras are best-effort.
      }
    }
  }
  await walk(sourceDir);
}

async function swapIntoPlace(
  target: string,
  tmpDir: string,
  existing: boolean,
  backup: BackupRecord | null,
): Promise<void> {
  const aside = `${target}.old-${randomBytes(4).toString("hex")}`;
  if (existing) await rename(target, aside);

  try {
    await rename(tmpDir, target);
  } catch (error) {
    if (existing) {
      try {
        await rename(aside, target);
      } catch {
        const source = backup?.path ?? aside;
        try {
          await cp(source, target, { recursive: true, force: false, dereference: false });
          if (source === aside) await rm(aside, { recursive: true, force: true }).catch(() => undefined);
        } catch (restoreError) {
          throw new Error(
            `Install failed and the previous version could not be restored (backup: ${source}): ${
              restoreError instanceof Error ? restoreError.message : String(restoreError)
            }`,
          );
        }
      }
    }
    throw new Error(`Install failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (existing) await rm(aside, { recursive: true, force: true }).catch(() => undefined);
}

async function hostDetected(hostId: HostId): Promise<boolean> {
  const agents = await detectAgents();
  return agents.some((agent) => agent.host === hostId && agent.detected);
}

export async function installManifest(manifest: SkillManifest, options: InstallOptions): Promise<InstallResult> {
  verifyManifest(manifest);
  if (options.expectedSlug && manifest.slug !== options.expectedSlug) {
    throw new Error(`Manifest slug mismatch: requested ${options.expectedSlug}, received ${manifest.slug}.`);
  }
  const host = getHost(options.host);
  if (!host) throw new Error(`Unknown host: ${options.host}`);
  if (host.exportOnly) throw new Error(`${host.name} is export-only; automatic installation is disabled.`);
  if (options.mode === "project" && !options.projectDir) {
    throw new Error("projectDir is required in project mode.");
  }
  if (!options.rootOverride && !(await hostDetected(options.host))) {
    throw new Error(`${host.name} is not detected on this machine. Use a supported host or pass rootOverride in tests.`);
  }

  const root = await resolveInstallRoot(options.host, options);
  await mkdir(root, { recursive: true });
  const realRoot = await realpath(root);
  if (options.projectDir) {
    const project = await realpath(assertAbsolutePath(options.projectDir, "projectDir"));
    if (!isInside(project, realRoot)) throw new Error("Project skill directory resolves outside the project.");
  }

  const target = join(realRoot, manifest.slug);
  if (!isInside(realRoot, target)) throw new Error("Skill directory escapes the install root.");

  const state = await readState();
  const previous = state.installations.find(
    (installation) => installation.host === options.host && installation.skillSlug === manifest.slug,
  );
  const key = managedKey(options.host, manifest.slug);
  const previousManaged = state.managedFiles[key];

  let targetInfo;
  try {
    targetInfo = await lstat(target);
  } catch {
    targetInfo = null;
  }
  if (targetInfo?.isSymbolicLink()) {
    throw new Error(`Refusing to replace symlinked skill directory: ${target}`);
  }
  const existing = targetInfo !== null;
  if (targetInfo && !targetInfo.isDirectory()) {
    throw new Error(`Skill install path exists and is not a directory: ${target}`);
  }

  const backup = existing ? await recordBackup(options.host, manifest.slug, target, previous, previousManaged) : null;
  const tmpDir = join(realRoot, `.${manifest.slug}.tmp-${randomBytes(6).toString("hex")}`);

  try {
    await mkdir(tmpDir, { recursive: false });
    await writeManifestFiles(tmpDir, manifest.files);
    if (existing) {
      await copyUnknownFiles(
        target,
        tmpDir,
        new Set(manifest.files.map((file) => file.path)),
        previousManaged,
      );
    }
    await swapIntoPlace(target, tmpDir, existing, backup);
  } catch (error) {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    await appendJournal({
      op: "INSTALL",
      status: "error",
      host: options.host,
      slug: manifest.slug,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  const now = new Date().toISOString();
  const installed = await updateState((next) => {
    if (backup && !next.backups.some((entry) => entry.id === backup.id)) next.backups.push(backup);
    next.managedFiles[key] = manifest.files.map((file) => file.path);
    const record: InstalledSkill = {
      skillSlug: manifest.slug,
      name: manifest.name,
      host: options.host,
      versionLabel: manifest.versionLabel,
      contentHash: manifest.contentHash,
      installPath: target,
      installedAt: previous?.installedAt ?? now,
      updatedAt: now,
      sourceUrl: manifest.sourceUrl,
    };
    const index = next.installations.findIndex(
      (installation) => installation.host === options.host && installation.skillSlug === manifest.slug,
    );
    if (index >= 0) next.installations[index] = record;
    else next.installations.push(record);
    return record;
  });

  await appendJournal({
    op: "INSTALL",
    status: "ok",
    host: options.host,
    slug: manifest.slug,
    version: manifest.versionLabel,
    contentHash: manifest.contentHash,
    path: target,
    files: manifest.files.length,
    backup: backup?.path ?? null,
  });

  return { installed, backup, files: manifest.files.length };
}

export async function listInstalled(): Promise<InstalledSkill[]> {
  const state = await readState();
  return [...state.installations].sort(
    (a, b) => a.skillSlug.localeCompare(b.skillSlug) || a.host.localeCompare(b.host),
  );
}

function assertTrackedPath(path: string): string {
  const absolute = assertAbsolutePath(path, "installPath");
  return absolute;
}

function latestBackup(backups: BackupRecord[], host: HostId, slug: string): BackupRecord | undefined {
  return backups
    .filter((backup) => backup.host === host && backup.skillSlug === slug)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

export async function removeSkill(slug: string, host: HostId): Promise<RemoveResult> {
  assertSlug(slug);
  if (!isKnownHost(host)) throw new Error(`Unknown host: ${host}`);
  const state = await readState();
  const installation = state.installations.find(
    (entry) => entry.host === host && entry.skillSlug === slug,
  );
  if (!installation) throw new Error(`Skill ${slug} is not installed for ${host}.`);

  const target = assertTrackedPath(installation.installPath);
  const key = managedKey(host, slug);
  const managed = state.managedFiles[key];
  let backup: BackupRecord | null = null;
  let exists = false;
  try {
    const info = await lstat(target);
    if (info.isSymbolicLink()) throw new Error(`Refusing to remove symlinked skill directory: ${target}`);
    if (!info.isDirectory()) throw new Error(`Install path is not a directory: ${target}`);
    exists = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (exists) backup = await recordBackup(host, slug, target, installation, managed);
  if (exists) await rm(target, { recursive: true, force: true });

  await updateState((next) => {
    next.installations = next.installations.filter(
      (entry) => !(entry.host === host && entry.skillSlug === slug),
    );
    delete next.managedFiles[key];
  });
  await appendJournal({ op: "REMOVE", status: "ok", state: "REMOVED", host, slug, path: target, backup: backup?.path ?? null });
  return { removed: exists, backup, path: exists ? target : null, installation };
}

export async function rollback(slug: string, host: HostId): Promise<RollbackResult> {
  assertSlug(slug);
  if (!isKnownHost(host)) throw new Error(`Unknown host: ${host}`);
  const state = await readState();
  const backup = latestBackup(state.backups, host, slug);
  if (!backup) throw new Error(`No backup exists for ${slug} on ${host}.`);

  const previous = state.installations.find(
    (entry) => entry.host === host && entry.skillSlug === slug,
  );
  const target = previous
    ? assertTrackedPath(previous.installPath)
    : (() => {
        const root = adapterFor(host).skillsPaths[0];
        if (!root) throw new Error(`No user skill directory is documented for ${host}.`);
        return join(root, slug);
      })();
  const parent = dirname(target);
  await mkdir(parent, { recursive: true });
  const realParent = await realpath(parent);
  if (!isInside(realParent, target)) throw new Error("Rollback target escapes its install root.");

  let info;
  try {
    info = await lstat(target);
  } catch {
    info = null;
  }
  if (info?.isSymbolicLink()) throw new Error(`Refusing to replace symlinked skill directory: ${target}`);
  if (info && !info.isDirectory()) throw new Error(`Rollback path is not a directory: ${target}`);

  const tmpDir = join(realParent, `.${slug}.rollback-${randomBytes(6).toString("hex")}`);
  try {
    await cp(backup.path, tmpDir, { recursive: true, force: false, dereference: false, preserveTimestamps: true });
    await swapIntoPlace(target, tmpDir, info !== null, null);
  } catch (error) {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    await appendJournal({
      op: "ROLLBACK",
      status: "error",
      host,
      slug,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  const now = new Date().toISOString();
  const key = managedKey(host, slug);
  const restoredManaged = backup.managedFiles ?? (await listFiles(backup.path));
  const installed = await updateState((next) => {
    const index = next.installations.findIndex(
      (entry) => entry.host === host && entry.skillSlug === slug,
    );
    next.managedFiles[key] = restoredManaged;
    const record: InstalledSkill = {
      skillSlug: slug,
      name: previous?.name ?? slug,
      host,
      versionLabel: backup.versionLabel,
      contentHash: backup.contentHash,
      installPath: target,
      installedAt: previous?.installedAt ?? now,
      updatedAt: now,
      sourceUrl: previous?.sourceUrl ?? "",
    };
    if (index >= 0) next.installations[index] = record;
    else next.installations.push(record);
    return record;
  });

  await appendJournal({ op: "ROLLBACK", status: "ok", state: "ROLLED_BACK", host, slug, path: target, backup: backup.path });
  return { installed, backup };
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
}

export function validateAppUrl(appUrl: string): URL {
  let url: URL;
  try {
    url = new URL(appUrl);
  } catch {
    throw new Error("appUrl must be a valid absolute URL.");
  }
  if (url.username || url.password) throw new Error("appUrl must not contain credentials.");
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("appUrl must use http or https.");
  }
  if (url.protocol === "http:" && !isLoopbackHostname(url.hostname)) {
    throw new Error("Plain HTTP is only allowed for localhost or 127.0.0.1.");
  }
  if (url.protocol === "https:" && process.env.ALLOW_REMOTE_MARKETPLACE !== "1") {
    throw new Error("Remote marketplaces require ALLOW_REMOTE_MARKETPLACE=1.");
  }
  return url;
}

export async function fetchManifest(appUrl: string, slug: string): Promise<SkillManifest> {
  assertSlug(slug);
  const base = validateAppUrl(appUrl);
  base.search = "";
  base.hash = "";
  const url = `${base.toString().replace(/\/+$/, "")}/api/v1/skills/${encodeURIComponent(slug)}/manifest`;

  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
      headers: { accept: "application/json" },
    });
  } catch (error) {
    throw new Error(`Could not fetch manifest for ${slug}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) throw new Error(`Manifest request for ${slug} failed with HTTP ${response.status}.`);

  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MANIFEST_BODY_LIMIT) throw new Error("Manifest response is too large.");
  const text = await response.text();
  if (Buffer.byteLength(text) > MANIFEST_BODY_LIMIT) throw new Error("Manifest response is too large.");

  let manifest: SkillManifest;
  try {
    manifest = JSON.parse(text) as SkillManifest;
  } catch {
    throw new Error(`Manifest response for ${slug} is not valid JSON.`);
  }
  verifyManifest(manifest);
  if (manifest.slug !== slug) {
    throw new Error(`Manifest slug mismatch: requested ${slug}, received ${manifest.slug}.`);
  }
  return manifest;
}

export async function findUpdates(appUrl: string): Promise<UpdatesResult> {
  const state = await readState();
  const bySlug = new Map<string, SkillManifest>();
  const errors: UpdatesResult["errors"] = [];
  const candidates: UpdateCandidate[] = [];

  for (const slug of [...new Set(state.installations.map((entry) => entry.skillSlug))]) {
    try {
      bySlug.set(slug, await fetchManifest(appUrl, slug));
    } catch (error) {
      errors.push({ slug, message: error instanceof Error ? error.message : String(error) });
    }
  }

  for (const installation of state.installations) {
    const latest = bySlug.get(installation.skillSlug);
    if (!latest || latest.contentHash === installation.contentHash) continue;
    candidates.push({
      slug: installation.skillSlug,
      host: installation.host,
      currentVersion: installation.versionLabel,
      latestVersion: latest.versionLabel,
      currentHash: installation.contentHash,
      latestHash: latest.contentHash,
      installPath: installation.installPath,
    });
  }
  return { updates: candidates, errors };
}

/** Exposed for CLI/API safety checks and tests. */
export function isAllowedInstallPath(path: string): boolean {
  const absolute = resolve(path);
  if (isNetworkPath(absolute)) return false;
  if (isInside(getHubHome(), absolute)) return true;
  return allSkillRoots().some((root) => isInside(root, absolute));
}

function allSkillRoots(): string[] {
  return HOSTS.flatMap((host) => adapterFor(host.id).skillsPaths);
}

export { SLUG_RE };
