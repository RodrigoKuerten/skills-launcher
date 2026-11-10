import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { delimiter, extname, join } from "node:path";
import type { DetectedAgent, HostDefinition, HostId, HostPlatform } from "@skills-hub/core";
import { HOSTS } from "@skills-hub/core";
import { adapterFor, currentPlatform, expandHostPath, isNetworkPath } from "./adapters.js";

interface AppEvidence {
  win32: string[];
  darwin: string[];
  linux: string[];
}

/**
 * Known desktop install locations. These are evidence that the host is
 * installed even when its CLI is not on PATH; they are not skill directories.
 */
const DESKTOP_EVIDENCE: Partial<Record<HostId, AppEvidence>> = {
  "claude-code": {
    win32: [
      "%LOCALAPPDATA%/AnthropicClaude/claude.exe",
      "%LOCALAPPDATA%/Programs/Claude/Claude.exe",
    ],
    darwin: ["/Applications/Claude.app/Contents/MacOS/Claude"],
    linux: [],
  },
  cursor: {
    win32: ["%LOCALAPPDATA%/Programs/cursor/Cursor.exe", "%LOCALAPPDATA%/Programs/Cursor/Cursor.exe"],
    darwin: ["/Applications/Cursor.app/Contents/MacOS/Cursor"],
    linux: [
      "~/.local/share/applications/cursor.desktop",
      "/usr/share/applications/cursor.desktop",
    ],
  },
  opencode: {
    win32: ["%LOCALAPPDATA%/Programs/@opencodedesktop/OpenCode.exe"],
    darwin: ["/Applications/OpenCode.app/Contents/MacOS/OpenCode"],
    linux: [
      "~/.local/share/applications/opencode.desktop",
      "/usr/share/applications/opencode.desktop",
    ],
  },
  windsurf: {
    win32: [
      "%LOCALAPPDATA%/Programs/Windsurf/Windsurf.exe",
      "%LOCALAPPDATA%/Programs/windsurf/Windsurf.exe",
    ],
    darwin: ["/Applications/Windsurf.app/Contents/MacOS/Windsurf"],
    linux: [
      "~/.local/share/applications/windsurf.desktop",
      "/usr/share/applications/windsurf.desktop",
    ],
  },
};

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function isExecutableFile(path: string): Promise<boolean> {
  if (isNetworkPath(path)) return false;
  try {
    const info = await stat(path);
    if (!info.isFile()) return false;
    if (process.platform !== "win32") await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function pathExtensions(): string[] {
  if (process.platform !== "win32") return [""];
  const raw = process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD";
  const values = raw
    .split(";")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .map((value) => (value.startsWith(".") ? value : `.${value}`));
  return [...new Set(values)];
}

/** Scan PATH for one of the documented executables. No shell, no `where`. */
export async function findExecutable(names: string[]): Promise<string | null> {
  const dirs = (process.env.PATH || "")
    .split(delimiter)
    .map((dir) => dir.trim().replace(/^"(.*)"$/, "$1"))
    .filter(Boolean)
    .filter((dir) => !isNetworkPath(dir));
  const extensions = pathExtensions();

  for (const name of names) {
    const hasExtension = extname(name) !== "";
    for (const extension of hasExtension ? [""] : extensions) {
      for (const dir of dirs) {
        const candidate = join(dir, `${name}${extension}`);
        if (await isExecutableFile(candidate)) return candidate;
      }
    }
  }
  return null;
}

const SEMVER_TOKEN = /\b(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)\b/;

function queryVersion(executablePath: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      execFile(
        executablePath,
        args,
        { timeout: 2000, killSignal: "SIGKILL", windowsHide: true, maxBuffer: 64 * 1024 },
        (_error, stdout, stderr) => {
          const output = `${stdout || ""}\n${stderr || ""}`;
          const match = output.match(SEMVER_TOKEN);
          resolve(match?.[1] ?? null);
        },
      );
    } catch {
      // Windows .cmd/.bat cannot be spawned without a shell; detection still
      // counts the executable, but the version stays unknown.
      resolve(null);
    }
  });
}

async function detectVersion(host: HostDefinition, executablePath: string): Promise<string | null> {
  for (const args of host.versionArgs) {
    if (!Array.isArray(args) || args.length === 0) continue;
    const version = await queryVersion(executablePath, args);
    if (version) return version;
  }
  return null;
}

async function firstExisting(paths: string[]): Promise<string | null> {
  for (const path of paths) {
    if (await exists(path)) return path;
  }
  return null;
}

function desktopCandidates(hostId: HostId, platform: HostPlatform): string[] {
  const evidence = DESKTOP_EVIDENCE[hostId]?.[platform] ?? [];
  return evidence.map(expandHostPath).filter((path) => !isNetworkPath(path));
}

export async function detectAgent(
  host: HostDefinition,
  platform: HostPlatform = currentPlatform(),
): Promise<DetectedAgent> {
  const notes: string[] = [];
  const adapter = adapterFor(host.id, platform);

  const executablePath = await findExecutable(host.executableNames);
  const version = executablePath ? await detectVersion(host, executablePath) : null;
  const configPath = await firstExisting(adapter.configPaths);
  const existingSkillsPath = await firstExisting(adapter.skillsPaths);
  const appPath = executablePath ? null : await firstExisting(desktopCandidates(host.id, platform));

  if (executablePath) notes.push(`executable on PATH: ${executablePath}`);
  if (version) notes.push(`version: ${version}`);
  if (executablePath && !version) notes.push("version output could not be parsed");
  if (configPath) notes.push(`config directory: ${configPath}`);
  if (existingSkillsPath) notes.push(`skills directory: ${existingSkillsPath}`);
  if (appPath) notes.push(`app found, CLI not on PATH: ${appPath}`);

  const detected = Boolean(executablePath || appPath);
  if (!detected) {
    notes.push(
      configPath
        ? "no executable or known app install found; a config directory alone is not detection"
        : "no executable on PATH or known app install found",
    );
  }

  return {
    host: host.id,
    name: host.name,
    detected,
    executablePath,
    version,
    configPath,
    skillsPath: detected ? (existingSkillsPath ?? adapter.skillsPaths[0] ?? null) : null,
    supportsAgentSkills: host.supportsAgentSkills,
    // A desktop app with a documented skills directory can still receive files
    // even when its CLI is not on PATH; the CLI is only needed for version probes.
    autoInstall: detected && host.supportsAgentSkills && !host.exportOnly,
    notes,
  };
}

/** Always returns every registry host, detected or not, in registry order. */
export async function detectAgents(): Promise<DetectedAgent[]> {
  const platform = currentPlatform();
  return Promise.all(
    HOSTS.map(async (host) => {
      try {
        return await detectAgent(host, platform);
      } catch (error) {
        return {
          host: host.id,
          name: host.name,
          detected: false,
          executablePath: null,
          version: null,
          configPath: null,
          skillsPath: null,
          supportsAgentSkills: host.supportsAgentSkills,
          autoInstall: false,
          notes: [`detection failed: ${error instanceof Error ? error.message : String(error)}`],
        } satisfies DetectedAgent;
      }
    }),
  );
}
