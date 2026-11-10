import { describe, expect, it } from "vitest";
import {
  hashSkillFiles,
  isSafeRelativePath,
  isTextFile,
  sha256Hex,
  versionLabel,
  withFileHashes,
} from "../src/version.js";
import type { SkillFile } from "../src/types.js";

const skillWithVersion = `---
name: pdf-helper
description: Extract text and tables from PDF files safely and accurately.
license: MIT
version: "2.5.1"
---

# PDF Helper

Use this skill to extract text and tables from PDF files.
`;

const files: SkillFile[] = [
  { path: "SKILL.md", content: skillWithVersion },
  { path: "scripts/a.ts", content: "export const a = 1;\n" },
  {
    path: "assets/logo.dat",
    content: Buffer.from([0, 1, 2, 255]).toString("base64"),
    encoding: "base64",
  },
];

describe("version utilities", () => {
  it("hashes a file set independently of input order", () => {
    const forward = hashSkillFiles(files);
    const reversed = hashSkillFiles([...files].reverse());

    expect(forward).toMatch(/^[0-9a-f]{64}$/);
    expect(reversed).toBe(forward);
  });

  it("detects content changes in the set hash", () => {
    const changed = files.map((file) =>
      file.path === "scripts/a.ts"
        ? { ...file, content: "export const a = 2;\n" }
        : file,
    );

    expect(hashSkillFiles(changed)).not.toBe(hashSkillFiles(files));
  });

  it("adds sha256 hashes without mutating the input", () => {
    const input: SkillFile[] = [
      { path: "notes/a.txt", content: "hello" },
      {
        path: "assets/blob.dat",
        content: Buffer.from([0, 1, 2, 255]).toString("base64"),
        encoding: "base64",
      },
    ];

    const result = withFileHashes(input);
    expect(result[0]?.sha256).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
    expect(result[1]?.sha256).toBe(
      sha256Hex(new Uint8Array([0, 1, 2, 255])),
    );
    expect(input[0]?.sha256).toBeUndefined();
    expect(input[1]?.sha256).toBeUndefined();
  });

  it("uses a valid semver from SKILL.md frontmatter", () => {
    expect(versionLabel(files, new Date(Date.UTC(2026, 0, 2)))).toBe("2.5.1");
  });

  it("falls back to a date and set-hash label", () => {
    const unversioned: SkillFile[] = [
      {
        path: "SKILL.md",
        content: skillWithVersion.replace('version: "2.5.1"\n', ""),
      },
    ];

    const label = versionLabel(unversioned, new Date(Date.UTC(2026, 0, 2)));
    expect(label).toMatch(/^2026\.01\.02-[0-9a-f]{7}$/);
  });

  it("never throws on an invalid date or invalid semver", () => {
    const filesWithBadVersion: SkillFile[] = [
      {
        path: "SKILL.md",
        content: skillWithVersion.replace('version: "2.5.1"', 'version: "2.5"'),
      },
    ];

    expect(() =>
      versionLabel(filesWithBadVersion, new Date("not-a-date")),
    ).not.toThrow();
    expect(versionLabel(filesWithBadVersion, new Date("not-a-date"))).toMatch(
      /^\d{4}\.\d{2}\.\d{2}-[0-9a-f]{7}$/,
    );
  });

  it("validates safe relative paths", () => {
    expect(isSafeRelativePath("SKILL.md")).toBe(true);
    expect(isSafeRelativePath("scripts/run.py")).toBe(true);

    expect(isSafeRelativePath("/etc/passwd")).toBe(false);
    expect(isSafeRelativePath("C:\\temp\\file.txt")).toBe(false);
    expect(isSafeRelativePath("../escape.txt")).toBe(false);
    expect(isSafeRelativePath("./SKILL.md")).toBe(true);
    expect(isSafeRelativePath("a//b.txt")).toBe(false);
    expect(isSafeRelativePath("")).toBe(false);
    expect(isSafeRelativePath("~/file.txt")).toBe(false);
  });

  it("recognises text files and binary files", () => {
    expect(isTextFile("README.md")).toBe(true);
    expect(isTextFile("LICENSE")).toBe(true);
    expect(isTextFile("scripts/run.sh")).toBe(true);
    expect(isTextFile("logo.png")).toBe(false);
    expect(isTextFile("archive.zip")).toBe(false);
    expect(isTextFile("data.sqlite")).toBe(false);
  });
});
