import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { HostId, InstalledSkill } from "@skills-hub/core";

export interface BackupRecord {
  id: string;
  host: HostId;
  skillSlug: string;
  /** Absolute path of the backup directory. */
  path: string;
  createdAt: string;
  versionLabel: string;
  contentHash: string;
  /** Files this installation owned at backup time (absent in older state). */
  managedFiles?: string[];
}

export interface AgentState {
  version: 1;
  machineId: string;
  autoUpdate: boolean;
  installations: InstalledSkill[];
  backups: BackupRecord[];
  /** host:slug -> files the companion owns; user extras are never listed. */
  managedFiles: Record<string, string[]>;
}

export function getHubHome(): string {
  const override = process.env.SKILLS_HUB_HOME?.trim();
  return override ? override : join(homedir(), ".skills-hub");
}

export function statePath(): string {
  return join(getHubHome(), "state.json");
}

export function tokenPath(): string {
  return join(getHubHome(), "agent.token");
}

export function journalPath(): string {
  return join(getHubHome(), "operations.jsonl");
}

export function backupsRoot(): string {
  return join(getHubHome(), "backups");
}

function emptyState(): AgentState {
  return {
    version: 1,
    machineId: randomUUID(),
    autoUpdate: false,
    installations: [],
    backups: [],
    managedFiles: {},
  };
}

export async function readState(): Promise<AgentState> {
  const path = statePath();
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const state = emptyState();
    await writeState(state);
    return state;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`State file is corrupt: ${path}`);
  }
  const state = parsed as Partial<AgentState>;
  if (
    state.version !== 1 ||
    typeof state.machineId !== "string" ||
    !Array.isArray(state.installations) ||
    !Array.isArray(state.backups)
  ) {
    throw new Error(`State file has an unsupported shape: ${path}`);
  }
  return {
    ...state,
    autoUpdate: state.autoUpdate === true,
    managedFiles:
      state.managedFiles && typeof state.managedFiles === "object" && !Array.isArray(state.managedFiles)
        ? state.managedFiles
        : {},
  } as AgentState;
}

export async function writeState(state: AgentState): Promise<void> {
  const path = statePath();
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(tmp, path);
}

let stateQueue: Promise<void> = Promise.resolve();

/**
 * Read-modify-write helper. Serialized in-process because the HTTP server can
 * receive concurrent install/remove requests; without the queue the last
 * writer silently drops another operation's state record.
 */
export async function updateState<T>(mutate: (state: AgentState) => T): Promise<T> {
  const run = stateQueue.then(async () => {
    const state = await readState();
    const result = mutate(state);
    await writeState(state);
    return result;
  });
  stateQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function getOrCreateToken(): Promise<string> {
  const path = tokenPath();
  try {
    const existing = (await readFile(path, "utf8")).trim();
    if (/^[A-Za-z0-9_-]{43}$/.test(existing)) return existing;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const token = randomBytes(32).toString("base64url");
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${token}\n`, { encoding: "utf8", mode: 0o600 });
  return token;
}

/**
 * Append one operation to the local journal. Secrets (the pairing token) are
 * never passed here; callers log identifiers and outcomes only.
 */
export async function appendJournal(entry: Record<string, unknown>): Promise<void> {
  const path = journalPath();
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const line = JSON.stringify({ at: new Date().toISOString(), ...entry });
  try {
    await writeFile(path, `${line}\n`, { encoding: "utf8", mode: 0o600, flag: "a" });
  } catch (error) {
    // The journal must never make an otherwise valid install fail.
    console.error(`[skills-hub] could not write operation journal: ${String(error)}`);
  }
}
