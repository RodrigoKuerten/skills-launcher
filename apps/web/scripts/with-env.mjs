/**
 * Loads the repo-root .env (Next does not look above its app directory) and
 * launches Next without passing --env-file through NODE_OPTIONS, which Node
 * rejects when Next re-execs its child process.
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(appDir, "../..");

for (const file of [path.join(repoRoot, ".env"), path.join(repoRoot, ".env.local")]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

const nextBin = path.join(repoRoot, "node_modules/next/dist/bin/next");
const result = spawnSync(process.execPath, [nextBin, ...process.argv.slice(2)], {
  cwd: appDir,
  env: process.env,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
