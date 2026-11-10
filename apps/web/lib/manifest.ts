import { withFileHashes, hashSkillFiles, isDownloadAllowed, type InstallFile, type SkillFile } from "@skills-hub/core";
import { db } from "@/lib/db";

export async function getPublishedSkill(slug: string) {
  const skill = await db.skill.findUnique({
    where: { slug },
    include: { currentVersion: true, hosts: true, source: true, category: true },
  });
  if (!skill) return null;
  if (!skill.currentVersion || skill.currentVersion.status !== "PUBLISHED") return null;
  if (skill.status !== "ACTIVE" && skill.status !== "ARCHIVED") return null;
  // Archived sources remain installable at their last published snapshot;
  // the UI surfaces the archived trust level separately.
  return skill;
}

export function readFiles(raw: string): SkillFile[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return (parsed as SkillFile[]).filter(
      (file) => file && typeof file.path === "string" && typeof file.content === "string",
    );
  } catch {
    return [];
  }
}

export function canonicalFiles(raw: string): InstallFile[] {
  const files = withFileHashes(readFiles(raw));
  return files.map((file) => ({
    path: file.path,
    content: file.content,
    encoding: file.encoding ?? "utf8",
    sha256: file.sha256 ?? "",
  }));
}

export function verifyStoredHash(raw: string, expected: string): boolean {
  try {
    return hashSkillFiles(readFiles(raw)) === expected;
  } catch {
    return false;
  }
}

export function canMirror(license: string | null): boolean {
  return isDownloadAllowed(license);
}

export const installInstructions = `1. Install and start the local companion: npm run agent
2. Pair this browser tab with the token printed by the companion.
3. Open this skill page and choose the detected agent(s).
4. The companion downloads this manifest, verifies every file hash and the set hash, creates a backup, then writes the files.
5. Nothing from the skill is executed during install. Review the instructions before use.`;

export function compatibilityMap(hosts: Array<{ host: string; status: string }>) {
  return Object.fromEntries(hosts.map((host) => [host.host, host.status]));
}
