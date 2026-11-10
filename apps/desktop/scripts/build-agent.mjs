/**
 * Builds a single-file companion executable with Node SEA and places it where
 * Tauri expects an external sidecar binary. Windows is the verified target;
 * the same script can produce a sidecar on macOS/Linux with the local Node.
 */
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, "..");
const repoRoot = path.resolve(appDir, "../..");
const dist = path.join(appDir, "dist");
const agentEntry = path.join(appDir, "../agent/src/desktop-entry.ts");
const binaries = path.join(appDir, "src-tauri/binaries");

function targetTriple() {
  const platform = process.platform;
  const arch = process.arch;
  if (platform === "win32" && arch === "x64") return "x86_64-pc-windows-msvc";
  if (platform === "win32" && arch === "arm64") return "aarch64-pc-windows-msvc";
  if (platform === "darwin" && arch === "arm64") return "aarch64-apple-darwin";
  if (platform === "darwin") return "x86_64-apple-darwin";
  if (platform === "linux" && arch === "arm64") return "aarch64-unknown-linux-gnu";
  return "x86_64-unknown-linux-gnu";
}

const triple = targetTriple();
const extension = process.platform === "win32" ? ".exe" : "";
const sidecar = path.join(binaries, `skills-hub-agent-${triple}${extension}`);
const bundle = path.join(dist, "agent.cjs");
const seaBlob = path.join(dist, "sea-prep.blob");
const seaConfig = path.join(dist, "sea-config.json");

await mkdir(dist, { recursive: true });
await mkdir(binaries, { recursive: true });

const esbuild = path.join(repoRoot, "node_modules/esbuild/bin/esbuild");
execFileSync(
  process.execPath,
  [esbuild, agentEntry, "--bundle", "--platform=node", "--format=cjs", "--target=node22", `--outfile=${bundle}`],
  { stdio: "inherit", cwd: appDir },
);

await writeFile(
  seaConfig,
  JSON.stringify(
    {
      main: bundle,
      output: seaBlob,
      disableExperimentalSEAWarning: true,
      useSnapshot: false,
      useCodeCache: false,
    },
    null,
    2,
  ),
);

execFileSync(process.execPath, ["--experimental-sea-config", seaConfig], {
  stdio: "inherit",
  cwd: appDir,
});

await rm(sidecar, { force: true });
await copyFile(process.execPath, sidecar);

const postject = path.join(repoRoot, "node_modules/postject/dist/cli.js");
if (existsSync(postject)) {
  execFileSync(
    process.execPath,
    [
      postject,
      sidecar,
      "NODE_SEA_BLOB",
      seaBlob,
      "--sentinel-fuse",
      "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
    ],
    { stdio: "inherit", cwd: appDir },
  );
} else {
  throw new Error("postject CLI not found; run npm install");
}

console.log(`Sidecar ready: ${sidecar}`);
