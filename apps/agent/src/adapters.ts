import { homedir } from "node:os";
import { join, normalize } from "node:path";
import {
  HOSTS,
  HOST_MAP,
  validateCompatibility,
  type CompatibilityResult,
  type HostDefinition,
  type HostId,
  type HostPlatform,
  type SkillManifest,
} from "@skills-hub/core";

export interface HostAdapter {
  host: HostDefinition;
  platform: HostPlatform;
  /** Documented user-level skill directories, expanded for this machine. */
  skillsPaths: string[];
  /** Documented configuration directories, expanded for this machine. */
  configPaths: string[];
  projectSkillsPath: string | null;
  supportsAgentSkills: boolean;
  exportOnly: boolean;
}

export function currentPlatform(): HostPlatform {
  if (process.platform === "win32") return "win32";
  if (process.platform === "darwin") return "darwin";
  return "linux";
}

/** Own-property check; `isHostId` from core uses `in`, which sees prototype keys. */
export function isKnownHost(value: string): value is HostId {
  return HOSTS.some((host) => host.id === value);
}

function homeDir(): string {
  if (process.platform === "win32") return process.env.USERPROFILE || homedir();
  return process.env.HOME || homedir();
}

const ENV_FALLBACKS: Record<string, () => string> = {
  APPDATA: () => join(homeDir(), "AppData", "Roaming"),
  LOCALAPPDATA: () => join(homeDir(), "AppData", "Local"),
  USERPROFILE: () => homeDir(),
  HOME: () => homeDir(),
};

/**
 * Expand the path tokens used in the host registry: `~`, `%APPDATA%`,
 * `%LOCALAPPDATA%`, `%USERPROFILE%`, `$HOME`, `${HOME}`.
 */
export function expandHostPath(pattern: string): string {
  let result = pattern.trim();
  if (result === "~" || result.startsWith("~/") || result.startsWith("~\\")) {
    result = join(homeDir(), result.slice(1).replace(/^[/\\]/, ""));
  }
  result = result.replace(/%([A-Za-z_]+)%/g, (match, name: string) => {
    const key = name.toUpperCase();
    const value = process.env[key] || ENV_FALLBACKS[key]?.();
    return value ?? match;
  });
  result = result.replace(/\$\{HOME\}/g, homeDir()).replace(/\$HOME\b/g, homeDir());
  return normalize(result);
}

/** UNC / network-share paths are never valid install targets or executables. */
export function isNetworkPath(path: string): boolean {
  return /^[\\/]{2}/.test(path);
}

function expandAll(patterns: string[]): string[] {
  return patterns.map(expandHostPath).filter((path) => !isNetworkPath(path));
}

export function adapterFor(hostId: HostId, platform: HostPlatform = currentPlatform()): HostAdapter {
  if (!isKnownHost(hostId)) throw new Error(`Unknown host: ${hostId}`);
  const host = HOST_MAP[hostId];
  if (!host) throw new Error(`Unknown host: ${hostId}`);
  return {
    host,
    platform,
    skillsPaths: expandAll(host.skillsPaths[platform]),
    configPaths: expandAll(host.configPaths[platform]),
    projectSkillsPath: host.projectSkillsPath,
    supportsAgentSkills: host.supportsAgentSkills,
    exportOnly: host.exportOnly,
  };
}

export function allAdapters(platform: HostPlatform = currentPlatform()): HostAdapter[] {
  return HOSTS.map((host) => adapterFor(host.id, platform));
}

/** Format compatibility is core's job; adapters only supply the host id and file set. */
export function compatibilityFor(manifest: SkillManifest, hostId: HostId): CompatibilityResult {
  return validateCompatibility(hostId, manifest.files, manifest.slug);
}

export function adapterManifest(platform: HostPlatform = currentPlatform()) {
  return allAdapters(platform).map((adapter) => ({
    host: adapter.host.id,
    name: adapter.host.name,
    format: adapter.host.format,
    supportsAgentSkills: adapter.supportsAgentSkills,
    userSkillsPaths: adapter.skillsPaths,
    projectSkillsPath: adapter.projectSkillsPath,
    exportOnly: adapter.exportOnly,
    docsUrl: adapter.host.docsUrl,
  }));
}
