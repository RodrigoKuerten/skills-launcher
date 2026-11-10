#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { dirname } from "node:path";
import { stdin, stdout } from "node:process";
import type { HostId } from "@skills-hub/core";
import { HOST_IDS } from "@skills-hub/core";
import { isKnownHost } from "./adapters.js";
import { detectAgents } from "./detect.js";
import {
  assertSlug,
  fetchManifest,
  findUpdates,
  installManifest,
  listInstalled,
  removeSkill,
  resolveInstallRoot,
  rollback,
} from "./installer.js";
import { formatPairing, startServer } from "./server.js";
import { getOrCreateToken, tokenPath } from "./store.js";
import { marketplaceToken, reportInstallation, type ReportStatus } from "./report.js";

const USAGE = `skills-hub — local AI skills companion

Usage:
  skills-hub detect [--json]
  skills-hub serve
  skills-hub pair
  skills-hub install <slug> --host <id> [--yes] [--app URL] [--project DIR]
  skills-hub install <slug> --all [--yes] [--app URL]
  skills-hub list
  skills-hub updates [--app URL]
  skills-hub update <slug> [--yes] [--app URL]
  skills-hub update --all [--yes] [--app URL]
  skills-hub rollback <slug> --host <id> [--yes]
  skills-hub remove <slug> --host <id> [--yes]

Hosts: ${HOST_IDS.join(", ")}
Environment: PORT, SKILLS_HUB_HOME, MARKETPLACE_URL, AGENT_ALLOWED_ORIGINS, ALLOW_REMOTE_MARKETPLACE`;

interface ParsedArgs {
  command: string | undefined;
  positionals: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command, ...rest] = argv;
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index]!;
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    const body = token.slice(2);
    if (body === "") throw new Error("Invalid flag.");
    const equals = body.indexOf("=");
    if (equals >= 0) {
      flags[body.slice(0, equals)] = body.slice(equals + 1);
      continue;
    }
    const next = rest[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags[body] = next;
      index += 1;
    } else {
      flags[body] = true;
    }
  }
  return { command, positionals, flags };
}

function rejectUnknown(flags: Record<string, string | boolean>, allowed: string[]): void {
  for (const name of Object.keys(flags)) {
    if (!allowed.includes(name)) throw new Error(`Unknown flag: --${name}`);
  }
}

function stringFlag(flags: Record<string, string | boolean>, name: string): string | undefined {
  const value = flags[name];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim() === "") throw new Error(`--${name} requires a value.`);
  return value;
}

function boolFlag(flags: Record<string, string | boolean>, name: string): boolean {
  return flags[name] === true || flags[name] === "true";
}

function requireSlug(positionals: string[]): string {
  const slug = positionals[0];
  if (!slug) throw new Error("A skill slug is required.");
  assertSlug(slug);
  return slug;
}

function requireHostFlag(flags: Record<string, string | boolean>): HostId {
  const value = stringFlag(flags, "host");
  if (!value) throw new Error("--host is required.");
  if (!isKnownHost(value)) throw new Error(`Unknown host "${value}". Use one of: ${HOST_IDS.join(", ")}.`);
  return value;
}

function appUrl(flags: Record<string, string | boolean>): string {
  return stringFlag(flags, "app") ?? process.env.MARKETPLACE_URL?.trim() ?? "http://localhost:3000";
}

async function report(installation: Parameters<typeof reportInstallation>[0], status: ReportStatus, app: string) {
  if (!marketplaceToken()) return;
  const result = await reportInstallation(installation, status, app);
  if (!result.reported) console.error(`  report: ${result.message ?? "failed"}`);
}

async function confirm(question: string, flags: Record<string, string | boolean>): Promise<boolean> {
  if (boolFlag(flags, "yes")) return true;
  if (!stdin.isTTY) return false;
  const readline = createInterface({ input: stdin, output: stdout });
  try {
    const answer = (await readline.question(`${question} [y/N] `)).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    readline.close();
  }
}

async function commandDetect(args: ParsedArgs): Promise<number> {
  rejectUnknown(args.flags, ["json"]);
  if (args.positionals.length > 0) throw new Error("detect takes no positional arguments.");
  const agents = await detectAgents();
  if (boolFlag(args.flags, "json")) {
    console.log(JSON.stringify(agents, null, 2));
  } else {
    for (const agent of agents) {
      console.log(`${agent.name} (${agent.host})`);
      console.log(`  detected:     ${agent.detected ? "yes" : "no"}`);
      console.log(`  executable:   ${agent.executablePath ?? "-"}`);
      console.log(`  version:      ${agent.version ?? "-"}`);
      console.log(`  skills path:  ${agent.skillsPath ?? "-"}`);
      console.log(`  auto-install: ${agent.autoInstall ? "yes" : "no"}`);
      for (const note of agent.notes) console.log(`  note:         ${note}`);
      console.log("");
    }
  }
  return 0;
}

async function commandServe(args: ParsedArgs): Promise<number> {
  rejectUnknown(args.flags, []);
  if (args.positionals.length > 0) throw new Error("serve takes no positional arguments.");
  const running = await startServer();
  console.log(formatPairing(running));
  return 0;
}

async function commandPair(args: ParsedArgs): Promise<number> {
  rejectUnknown(args.flags, []);
  if (args.positionals.length > 0) throw new Error("pair takes no positional arguments.");
  const token = await getOrCreateToken();
  const port = Number(process.env.PORT ?? 4780);
  console.log(`URL:   http://127.0.0.1:${Number.isFinite(port) ? port : 4780}`);
  console.log(`Token: ${token}`);
  console.log(`Token file: ${tokenPath()}`);
  console.log("Start the companion with: skills-hub serve");
  return 0;
}

async function commandInstall(args: ParsedArgs): Promise<number> {
  rejectUnknown(args.flags, ["host", "all", "yes", "app", "project"]);
  const slug = requireSlug(args.positionals);
  const all = boolFlag(args.flags, "all");
  const hostFlag = stringFlag(args.flags, "host");
  const projectDir = stringFlag(args.flags, "project");
  if (all && hostFlag) throw new Error("Use either --host or --all, not both.");
  if (all && projectDir) throw new Error("--project requires an explicit --host.");
  if (!all && !hostFlag) throw new Error("Choose --host <id> or --all.");

  const agents = await detectAgents();
  const targets: HostId[] = all
    ? agents
        .filter((agent) => agent.detected && agent.supportsAgentSkills)
        .map((agent) => agent.host)
    : [requireHostFlag(args.flags)];
  if (targets.length === 0) throw new Error("No supported agents detected on this machine.");

  const manifest = await fetchManifest(appUrl(args.flags), slug);
  for (const host of targets) {
    const agent = agents.find((entry) => entry.host === host);
    if (!agent?.detected) throw new Error(`${host} is not detected on this machine.`);
    const root = await resolveInstallRoot(host, { projectDir });
    const approved = await confirm(
      `Install ${slug} ${manifest.versionLabel} for ${host} into ${root}?`,
      args.flags,
    );
    if (!approved) {
      console.log("Cancelled.");
      return 1;
    }
    const result = await installManifest(manifest, { host, projectDir, expectedSlug: slug });
    console.log(`Installed ${slug} ${result.installed.versionLabel} for ${host}`);
    console.log(`  path:   ${result.installed.installPath}`);
    console.log(`  files:  ${result.files}`);
    if (result.backup) console.log(`  backup: ${result.backup.path}`);
    await report(result.installed, "INSTALLED", appUrl(args.flags));
  }
  return 0;
}

async function commandList(args: ParsedArgs): Promise<number> {
  rejectUnknown(args.flags, ["json"]);
  if (args.positionals.length > 0) throw new Error("list takes no positional arguments.");
  const installations = await listInstalled();
  if (boolFlag(args.flags, "json")) {
    console.log(JSON.stringify(installations, null, 2));
    return 0;
  }
  if (installations.length === 0) {
    console.log("No skills installed.");
    return 0;
  }
  for (const installation of installations) {
    console.log(`${installation.skillSlug} ${installation.versionLabel}`);
    console.log(`  host:   ${installation.host}`);
    console.log(`  path:   ${installation.installPath}`);
    console.log(`  hash:   ${installation.contentHash}`);
    console.log(`  source: ${installation.sourceUrl}`);
  }
  return 0;
}

async function commandUpdates(args: ParsedArgs): Promise<number> {
  rejectUnknown(args.flags, ["app"]);
  if (args.positionals.length > 0) throw new Error("updates takes no positional arguments.");
  const result = await findUpdates(appUrl(args.flags));
  if (result.updates.length === 0) {
    console.log(result.errors.length > 0 ? "No updates found (some checks failed)." : "Everything is up to date.");
  }
  for (const update of result.updates) {
    console.log(`${update.slug} (${update.host}): ${update.currentVersion} -> ${update.latestVersion}`);
    console.log(`  path: ${update.installPath}`);
  }
  for (const error of result.errors) {
    console.error(`Could not check ${error.slug}: ${error.message}`);
  }
  return result.errors.length > 0 ? 1 : 0;
}

async function commandUpdate(args: ParsedArgs): Promise<number> {
  rejectUnknown(args.flags, ["all", "yes", "app"]);
  const all = boolFlag(args.flags, "all");
  const slug = args.positionals[0];
  if (!slug && !all) throw new Error("Provide a skill slug or --all.");
  if (slug && all) throw new Error("Use either a slug or --all, not both.");
  if (slug) assertSlug(slug);
  if (args.positionals.length > 1) throw new Error("update accepts one slug.");

  const installations = (await listInstalled()).filter(
    (installation) => !slug || installation.skillSlug === slug,
  );
  if (installations.length === 0) throw new Error("No matching installation found.");

  const approved = await confirm(
    `Update ${installations.length} installation(s)? A backup is written first.`,
    args.flags,
  );
  if (!approved) {
    console.log("Cancelled.");
    return 1;
  }

  const manifests = new Map<string, Awaited<ReturnType<typeof fetchManifest>>>();
  for (const installation of installations) {
    if (!manifests.has(installation.skillSlug)) {
      manifests.set(installation.skillSlug, await fetchManifest(appUrl(args.flags), installation.skillSlug));
    }
  }

  let failed = false;
  for (const installation of installations) {
    const manifest = manifests.get(installation.skillSlug);
    if (!manifest) continue;
    try {
      const result = await installManifest(manifest, {
        host: installation.host,
        rootOverride: dirname(installation.installPath),
        expectedSlug: installation.skillSlug,
      });
      console.log(
        `Updated ${installation.skillSlug} for ${installation.host}: ${installation.versionLabel} -> ${result.installed.versionLabel}`,
      );
      await report(result.installed, "INSTALLED", appUrl(args.flags));
    } catch (error) {
      failed = true;
      console.error(
        `Failed to update ${installation.skillSlug} for ${installation.host}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  return failed ? 1 : 0;
}

async function commandRollback(args: ParsedArgs): Promise<number> {
  rejectUnknown(args.flags, ["host", "yes"]);
  const slug = requireSlug(args.positionals);
  const host = requireHostFlag(args.flags);
  const approved = await confirm(`Roll back ${slug} for ${host} to its latest backup?`, args.flags);
  if (!approved) {
    console.log("Cancelled.");
    return 1;
  }
  const result = await rollback(slug, host);
  console.log(`Rolled back ${slug} for ${host} to ${result.installed.versionLabel}`);
  console.log(`  path:   ${result.installed.installPath}`);
  console.log(`  backup: ${result.backup.path}`);
  await report(result.installed, "ROLLED_BACK", process.env.MARKETPLACE_URL ?? "http://localhost:3000");
  return 0;
}

async function commandRemove(args: ParsedArgs): Promise<number> {
  rejectUnknown(args.flags, ["host", "yes"]);
  const slug = requireSlug(args.positionals);
  const host = requireHostFlag(args.flags);
  const approved = await confirm(`Remove ${slug} from ${host}? A backup is kept.`, args.flags);
  if (!approved) {
    console.log("Cancelled.");
    return 1;
  }
  const result = await removeSkill(slug, host);
  console.log(`Removed ${slug} from ${host}`);
  if (result.backup) console.log(`  backup: ${result.backup.path}`);
  await report(result.installation, "REMOVED", process.env.MARKETPLACE_URL ?? "http://localhost:3000");
  return 0;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.command || args.command === "help" || boolFlag(args.flags, "help")) {
    console.log(USAGE);
    return 0;
  }
  switch (args.command) {
    case "detect":
      return commandDetect(args);
    case "serve":
      return commandServe(args);
    case "pair":
      return commandPair(args);
    case "install":
      return commandInstall(args);
    case "list":
      return commandList(args);
    case "updates":
      return commandUpdates(args);
    case "update":
      return commandUpdate(args);
    case "rollback":
      return commandRollback(args);
    case "remove":
      return commandRemove(args);
    default:
      throw new Error(`Unknown command: ${args.command}. Run "skills-hub help".`);
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
