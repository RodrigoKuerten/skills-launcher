/**
 * Runs the Tauri CLI with the MSVC environment imported on Windows, so the app
 * builds from a normal terminal instead of requiring a Developer Prompt.
 */
import { execFileSync, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, "..");
const repoRoot = path.resolve(appDir, "../..");
const env = { ...process.env };

if (process.platform === "win32") {
  const candidates = [
    "C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\VC\\Auxiliary\\Build\\vcvars64.bat",
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\VC\\Auxiliary\\Build\\vcvars64.bat",
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\Professional\\VC\\Auxiliary\\Build\\vcvars64.bat",
  ].filter((file) => existsSync(file));

  if (candidates.length) {
    const output = execSync(`call "${candidates[0]}" >nul && set`, {
      encoding: "utf8",
      shell: "cmd.exe",
    });
    for (const line of output.split(/\r?\n/)) {
      const index = line.indexOf("=");
      if (index > 0) env[line.slice(0, index)] = line.slice(index + 1);
    }
  } else {
    console.warn("[desktop] MSVC vcvars64.bat not found; Tauri build may fail without it.");
  }

  const home = env.USERPROFILE || "";
  env.PATH = `${path.join(home, ".cargo", "bin")};${path.dirname(process.execPath)};${env.PATH ?? ""}`;
}

const tauri = path.join(repoRoot, "node_modules/@tauri-apps/cli/tauri.js");
const args = process.argv.slice(2);
const result = execFileSync(process.execPath, [tauri, ...args], {
  cwd: appDir,
  env,
  stdio: "inherit",
});
process.exit(typeof result === "number" ? result : 0);
