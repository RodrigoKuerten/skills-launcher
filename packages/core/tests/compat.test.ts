import { describe, expect, it } from "vitest";
import { validateAllHosts, validateCompatibility } from "../src/compat.js";
import type { SkillFile } from "../src/types.js";

const validSkill: SkillFile = {
  path: "SKILL.md",
  content: `---
name: pdf-helper
description: Extract text and tables from PDF files safely and accurately.
license: MIT
---

# PDF Helper

Use this skill to extract text and tables from PDF files.
`,
};

const missingDescription: SkillFile = {
  path: "SKILL.md",
  content: `---
name: claude-only
---

# Claude Only

Claude Code accepts this body without a description field.
`,
};

describe("validateCompatibility", () => {
  it("marks a valid file set as VERIFIED and explains the format-only scope", () => {
    const result = validateCompatibility("codex", [validSkill]);

    expect(result.host).toBe("codex");
    expect(result.status).toBe("VERIFIED");
    expect(result.notes.some((note) => /format validation only/i.test(note))).toBe(
      true,
    );
    expect(result.notes.some((note) => /local detection/i.test(note))).toBe(
      true,
    );
  });

  it("marks a missing SKILL.md as UNSUPPORTED", () => {
    const result = validateCompatibility("cursor", [
      { path: "README.md", content: "No skill here." },
    ]);

    expect(result.status).toBe("UNSUPPORTED");
    expect(result.notes.join(" ")).toMatch(/Missing SKILL\.md/);
  });

  it("rejects unsafe file paths", () => {
    const result = validateCompatibility("copilot", [
      validSkill,
      { path: "../escape.sh", content: "echo hi\n" },
    ]);

    expect(result.status).toBe("UNSUPPORTED");
    expect(result.notes.join(" ")).toMatch(/Unsafe file path/);
  });

  it("treats Claude Code name and description as optional", () => {
    const claude = validateCompatibility("claude-code", [missingDescription]);
    const codex = validateCompatibility("codex", [missingDescription]);

    expect(claude.status).toBe("VERIFIED");
    expect(claude.notes.join(" ")).toMatch(/optional/i);
    expect(codex.status).toBe("UNSUPPORTED");
    expect(codex.notes.join(" ")).toMatch(/description/i);
  });

  it("rejects a directory name that does not match the skill name", () => {
    const result = validateCompatibility("codex", [validSkill], "other-name");

    expect(result.status).toBe("UNSUPPORTED");
    expect(result.notes.join(" ")).toMatch(/does not match/);
  });

  it("includes host-specific notes", () => {
    const gemini = validateCompatibility("gemini-cli", [validSkill]);
    const windsurf = validateCompatibility("windsurf", [validSkill]);

    expect(gemini.notes.join(" ")).toMatch(/reads only/i);
    expect(windsurf.notes.join(" ")).toMatch(/Devin/);
  });

  it("validates every registered host", () => {
    const results = validateAllHosts([validSkill]);

    expect(results).toHaveLength(7);
    expect(new Set(results.map((result) => result.host)).size).toBe(7);
    expect(results.every((result) => result.status === "VERIFIED")).toBe(true);
  });
});
