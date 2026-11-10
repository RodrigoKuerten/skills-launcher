/**
 * Sync CLI. Run with `npm run sync -- [--due|--source <id|slug>|--all|--worker] [--limit N]`.
 * Env is loaded before the DB/engine imports so Prisma sees DATABASE_URL.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function loadRootEnv(): void {
  if (typeof process.loadEnvFile !== "function") return;
  const moduleRoot = fileURLToPath(new URL("../../../.env", import.meta.url));
  const candidates = [
    moduleRoot,
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../../.env"),
  ];
  for (const candidate of new Set(candidates)) {
    if (!existsSync(candidate)) continue;
    try {
      process.loadEnvFile(candidate);
      return;
    } catch {
      // Keep trying the other locations.
    }
  }
}

loadRootEnv();

type Mode = "due" | "all" | "worker" | "source";

interface Args {
  mode: Mode;
  source?: string;
  limit: number;
}

function parseArgs(argv: string[]): Args {
  let mode: Mode = "due";
  let source: string | undefined;
  let limit = 5;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--due") {
      mode = "due";
    } else if (arg === "--all") {
      mode = "all";
    } else if (arg === "--worker") {
      mode = "worker";
    } else if (arg === "--source") {
      const value = argv[index + 1];
      if (!value) throw new Error("--source requires an id or slug");
      source = value;
      mode = "source";
      index += 1;
    } else if (arg === "--limit") {
      const value = Number(argv[index + 1]);
      if (!Number.isFinite(value) || value <= 0) throw new Error("--limit requires a positive number");
      limit = Math.floor(value);
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      console.log("Usage: sync [--due] [--source <id|slug>] [--all] [--worker] [--limit N]");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return { mode, source, limit };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const engine = await import("../lib/sync/engine");

  if (args.mode === "source") {
    const { db } = await import("../lib/db");
    const source = await db.source.findFirst({
      where: { OR: [{ id: args.source }, { slug: args.source }] },
      select: { id: true, slug: true, name: true },
    });
    if (!source) throw new Error(`Source not found: ${args.source}`);
    const summary = await engine.syncSource(source.id, { trigger: "cli" });
    console.log(JSON.stringify({ source, ...summary }, null, 2));
    return;
  }

  if (args.mode === "worker") {
    console.log(JSON.stringify(await engine.processJobs(args.limit), null, 2));
    return;
  }

  if (args.mode === "all") {
    console.log(JSON.stringify(await engine.syncAllEnabled({ maxSources: args.limit }), null, 2));
    return;
  }

  console.log(JSON.stringify(await engine.runDueSources({ limit: args.limit }), null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ error: message }, null, 2));
  process.exitCode = 1;
});
