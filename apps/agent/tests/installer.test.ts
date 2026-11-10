import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashSkillFiles, withFileHashes, type InstallFile, type SkillManifest } from "@skills-hub/core";
import {
  installManifest,
  removeSkill,
  rollback,
  verifyManifest,
} from "../src/installer.js";

let tempRoot: string;
let home: string;
let skillsRoot: string;

beforeEach(async () => {
  tempRoot = await mkdtemp(join(tmpdir(), "skills-hub-agent-test-"));
  home = join(tempRoot, "home");
  skillsRoot = join(tempRoot, "skills");
  process.env.SKILLS_HUB_HOME = home;
  await mkdir(home, { recursive: true });
});

afterEach(async () => {
  delete process.env.SKILLS_HUB_HOME;
  await rm(tempRoot, { recursive: true, force: true });
});

function skillMarkdown(versionLabel: string): string {
  return [
    "---",
    "name: test-skill",
    "description: A deterministic fixture skill used by installer tests.",
    "---",
    "",
    `Body for version ${versionLabel}.`,
    "",
  ].join("\n");
}

function buildManifest(
  entries: Array<{ path: string; content: string; encoding?: "utf8" | "base64" }>,
  overrides: Partial<SkillManifest> = {},
): SkillManifest {
  const files: InstallFile[] = entries.map((entry) => {
    const encoding = entry.encoding ?? "utf8";
    const [hashed] = withFileHashes([{ path: entry.path, content: entry.content, encoding }]);
    return {
      path: entry.path,
      content: entry.content,
      encoding,
      sha256: hashed?.sha256 ?? "",
    };
  });

  return {
    slug: "test-skill",
    name: "Test Skill",
    versionLabel: "1.0.0",
    contentHash: hashSkillFiles(files),
    integrity: "sha256-manifest",
    distribution: "FULL",
    files,
    compatibility: {},
    instructions: "Fixture only.",
    sourceUrl: "http://localhost:3000/api/v1/skills/test-skill",
    ...overrides,
  };
}

function manifest(versionLabel = "1.0.0"): SkillManifest {
  return buildManifest([
    { path: "SKILL.md", content: skillMarkdown(versionLabel) },
    { path: "scripts/helper.md", content: `helper ${versionLabel}\n` },
  ], { versionLabel });
}

describe("verifyManifest", () => {
  it("accepts a manifest whose files and set hash are intact", () => {
    expect(() => verifyManifest(manifest())).not.toThrow();
  });

  it("rejects a tampered file", () => {
    const tampered = structuredClone(manifest());
    tampered.files[1]!.content = "tampered helper\n";
    expect(() => verifyManifest(tampered)).toThrow(/checksum mismatch/i);
  });

  it("rejects unsafe relative paths", () => {
    const unsafe = buildManifest([{ path: "../escape.md", content: "nope\n" }]);
    expect(() => verifyManifest(unsafe)).toThrow(/unsafe file path/i);
  });

  it.skipIf(process.platform !== "win32")("rejects Windows alternate data streams", () => {
    const ads = buildManifest([{ path: "SKILL.md:payload", content: "nope\n" }]);
    expect(() => verifyManifest(ads)).toThrow(/not portable to Windows/i);
  });

  it("rejects source-only distributions", () => {
    const sourceOnly = buildManifest([{ path: "SKILL.md", content: skillMarkdown("1.0.0") }], {
      distribution: "SOURCE_ONLY",
    });
    expect(() => verifyManifest(sourceOnly)).toThrow(/source-only/i);
  });
});

describe("installer lifecycle", () => {
  it("writes files, records the installation, and logs the operation", async () => {
    const result = await installManifest(manifest(), { host: "opencode", rootOverride: skillsRoot });

    const installedFile = join(skillsRoot, "test-skill", "SKILL.md");
    expect(await readFile(installedFile, "utf8")).toBe(skillMarkdown("1.0.0"));
    expect(await readFile(join(skillsRoot, "test-skill", "scripts", "helper.md"), "utf8")).toBe(
      "helper 1.0.0\n",
    );
    expect(result.installed.installPath).toBe(join(skillsRoot, "test-skill"));
    expect(result.backup).toBeNull();

    const state = JSON.parse(await readFile(join(home, "state.json"), "utf8"));
    expect(state.installations).toHaveLength(1);
    expect(state.installations[0]).toMatchObject({
      skillSlug: "test-skill",
      host: "opencode",
      versionLabel: "1.0.0",
      contentHash: hashSkillFiles(manifest().files),
    });

    const journal = await readFile(join(home, "operations.jsonl"), "utf8");
    expect(journal).toContain('"op":"INSTALL"');
    expect(journal).not.toContain("agent.token");
  });

  it("backs up on reinstall, drops stale managed files, and preserves an extra user file", async () => {
    const first = buildManifest(
      [
        { path: "SKILL.md", content: skillMarkdown("1.0.0") },
        { path: "scripts/helper.md", content: "helper 1.0.0\n" },
        { path: "old/managed.md", content: "managed by v1\n" },
      ],
      { versionLabel: "1.0.0" },
    );
    await installManifest(first, { host: "opencode", rootOverride: skillsRoot });
    const extra = join(skillsRoot, "test-skill", "user-notes.txt");
    await writeFile(extra, "keep me\n", "utf8");

    await installManifest(manifest("2.0.0"), { host: "opencode", rootOverride: skillsRoot });

    expect(await readFile(extra, "utf8")).toBe("keep me\n");
    expect(await readFile(join(skillsRoot, "test-skill", "SKILL.md"), "utf8")).toBe(
      skillMarkdown("2.0.0"),
    );
    await expect(readFile(join(skillsRoot, "test-skill", "old", "managed.md"), "utf8")).rejects.toThrow();

    const state = JSON.parse(await readFile(join(home, "state.json"), "utf8"));
    expect(state.backups).toHaveLength(1);
    expect(state.installations[0].versionLabel).toBe("2.0.0");
    expect(state.managedFiles["opencode:test-skill"]).toEqual(["SKILL.md", "scripts/helper.md"]);

    const backup = state.backups[0];
    expect(await readFile(join(backup.path, "SKILL.md"), "utf8")).toBe(skillMarkdown("1.0.0"));
    expect(backup.managedFiles).toEqual(["SKILL.md", "scripts/helper.md", "old/managed.md"]);
  });

  it("rolls back to the previous content", async () => {
    await installManifest(manifest("1.0.0"), { host: "opencode", rootOverride: skillsRoot });
    await installManifest(manifest("2.0.0"), { host: "opencode", rootOverride: skillsRoot });

    const result = await rollback("test-skill", "opencode");

    expect(await readFile(join(skillsRoot, "test-skill", "SKILL.md"), "utf8")).toBe(
      skillMarkdown("1.0.0"),
    );
    expect(result.installed.versionLabel).toBe("1.0.0");

    const state = JSON.parse(await readFile(join(home, "state.json"), "utf8"));
    expect(state.installations[0].versionLabel).toBe("1.0.0");
    expect(state.backups).toHaveLength(1);
    expect(state.managedFiles["opencode:test-skill"]).toEqual(["SKILL.md", "scripts/helper.md"]);
  });

  it("backs up before removal and clears the install record", async () => {
    await installManifest(manifest(), { host: "opencode", rootOverride: skillsRoot });

    const result = await removeSkill("test-skill", "opencode");

    expect(result.removed).toBe(true);
    await expect(readFile(join(skillsRoot, "test-skill", "SKILL.md"), "utf8")).rejects.toThrow();
    expect(result.backup).not.toBeNull();
    expect(await readFile(join(result.backup!.path, "SKILL.md"), "utf8")).toBe(
      skillMarkdown("1.0.0"),
    );

    const state = JSON.parse(await readFile(join(home, "state.json"), "utf8"));
    expect(state.installations).toHaveLength(0);
    expect(state.backups).toHaveLength(1);
    expect(state.managedFiles["opencode:test-skill"]).toBeUndefined();
  });

  it("verifies base64 payloads and rejects corrupted binary content", async () => {
    const bytes = Buffer.from([0, 1, 2, 3, 250, 255]);
    const base64 = bytes.toString("base64");
    const binaryManifest = buildManifest([
      { path: "SKILL.md", content: skillMarkdown("1.0.0") },
      { path: "assets/blob.bin", content: base64, encoding: "base64" },
    ]);

    await installManifest(binaryManifest, { host: "opencode", rootOverride: skillsRoot });
    expect(await readFile(join(skillsRoot, "test-skill", "assets", "blob.bin"))).toEqual(bytes);

    const broken = buildManifest([
      { path: "SKILL.md", content: skillMarkdown("1.0.0") },
      { path: "assets/blob.bin", content: base64, encoding: "base64" },
    ]);
    broken.files[1]!.content = Buffer.from("different").toString("base64");
    expect(() => verifyManifest(broken)).toThrow(/checksum mismatch/i);
  });
});
