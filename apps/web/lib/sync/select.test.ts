import { describe, expect, it } from "vitest";
import {
  buildSkillSlug,
  extractSkillRoots,
  selectSkillFiles,
  shouldAutoPublish,
} from "./select";

describe("extractSkillRoots", () => {
  const tree = [
    "SKILL.md",
    "skills/alpha/SKILL.md",
    "skills/beta/SKILL.md",
    "skills/lower/skill.md",
    "skills/.hidden/SKILL.md",
    "skills/beta/template/nested/SKILL.md",
    ".claude/skills/dot/SKILL.md",
    ".claude-plugin/SKILL.md",
    ".github/plugin-marketplace/SKILL.md",
    "node_modules/pkg/SKILL.md",
    "template/tpl/SKILL.md",
    "docs/guide.md",
  ];

  it("finds case-sensitive SKILL.md directories and skips vendor/hidden trees", () => {
    expect(extractSkillRoots(tree)).toEqual([".", "skills/alpha", "skills/beta"]);
  });

  it("scopes to a prefix without escaping it", () => {
    expect(extractSkillRoots(tree, "skills/")).toEqual(["skills/alpha", "skills/beta"]);
    expect(extractSkillRoots(tree, "skills/beta")).toEqual(["skills/beta"]);
    expect(extractSkillRoots(tree, "docs")).toEqual([]);
  });

  it("skips unsafe paths", () => {
    expect(extractSkillRoots(["../escape/SKILL.md", "/abs/SKILL.md", "C:/win/SKILL.md"])).toEqual([]);
  });

  it("honors an explicit path inside a dot directory", () => {
    const curated = [...tree, "skills/.curated/pdf/SKILL.md"];
    expect(extractSkillRoots(curated, "skills/.curated")).toEqual(["skills/.curated/pdf"]);
    expect(extractSkillRoots(curated)).not.toContain("skills/.curated/pdf");
  });
});

describe("selectSkillFiles", () => {
  const entries = [
    { path: "skills/alpha/SKILL.md", type: "blob", size: 500 },
    { path: "skills/alpha/scripts/run.py", type: "blob", size: 300 },
    { path: "skills/alpha/README.md", type: "blob", size: 100 },
    { path: "skills/alpha/icon.png", type: "blob", size: 100 },
    { path: "skills/alpha/package-lock.json", type: "blob", size: 100 },
    { path: "skills/alpha/huge.md", type: "blob", size: 600 * 1024 },
    { path: "skills/alpha/../escape.ts", type: "blob", size: 10 },
    { path: "skills/beta/SKILL.md", type: "blob", size: 10 },
    { path: "skills/alpha/node_modules/dep/index.js", type: "blob", size: 10 },
    { path: "skills/alpha/.env", type: "blob", size: 10 },
    { path: "skills/alpha/nested", type: "tree" },
  ];

  it("keeps portable text files and explains exclusions", () => {
    const result = selectSkillFiles("skills/alpha", entries);
    expect(result.files).toEqual([
      "SKILL.md",
      "README.md",
      "scripts/run.py",
    ]);
    expect(result.totalBytes).toBe(900);
    expect(result.notes.join(" ")).toContain("binary");
    expect(result.notes.join(" ")).toContain("lockfile");
    expect(result.notes.join(" ")).toContain("over 512KB");
    expect(result.notes.join(" ")).toContain("unsafe");
    expect(result.notes.join(" ")).toContain("hidden/vendor");
  });

  it("selects files under an explicitly scoped dot root", () => {
    const result = selectSkillFiles("skills/.curated/pdf", [
      { path: "skills/.curated/pdf/SKILL.md", type: "blob", size: 10 },
      { path: "skills/.curated/pdf/run.py", type: "blob", size: 10 },
      { path: "skills/.curated/pdf/.git/config", type: "blob", size: 10 },
    ]);
    expect(result.files).toEqual(["SKILL.md", "run.py"]);
  });

  it("enforces file and total-size caps", () => {
    const cappedFiles = selectSkillFiles("skills/alpha", entries, { maxFiles: 2 });
    expect(cappedFiles.files).toEqual(["SKILL.md", "README.md"]);
    expect(cappedFiles.notes.join(" ")).toContain("file cap reached (2)");

    const cappedBytes = selectSkillFiles("skills/alpha", entries, { maxTotalBytes: 600 });
    expect(cappedBytes.files).toEqual(["SKILL.md", "README.md"]);
    expect(cappedBytes.notes.join(" ")).toContain("total size cap");
  });
});

describe("shouldAutoPublish", () => {
  const base = {
    parsedOk: true,
    scan: { publishable: true, riskLevel: "LOW" as const, counts: { LOW: 1 } },
    quality: { total: 80 },
  };

  it("allows official sources above 60", () => {
    expect(shouldAutoPublish({ ...base, trustTier: "OFFICIAL" }).publish).toBe(true);
    expect(
      shouldAutoPublish({ ...base, trustTier: "OFFICIAL", quality: { total: 59 } }).publish,
    ).toBe(false);
  });

  it("requires verified sources to reach 75 with no MEDIUM+ findings", () => {
    expect(shouldAutoPublish({ ...base, trustTier: "VERIFIED" }).publish).toBe(true);
    expect(
      shouldAutoPublish({ ...base, trustTier: "VERIFIED", quality: { total: 74 } }).publish,
    ).toBe(false);
    expect(
      shouldAutoPublish({
        ...base,
        trustTier: "VERIFIED",
        scan: { publishable: true, riskLevel: "MEDIUM", counts: { MEDIUM: 1 } },
      }).publish,
    ).toBe(false);
  });

  it("never auto-publishes community sources", () => {
    const decision = shouldAutoPublish({ ...base, trustTier: "COMMUNITY" });
    expect(decision.publish).toBe(false);
    expect(decision.reason).toMatch(/community/i);
  });

  it("denies unparsed or scanner-blocked skills", () => {
    expect(shouldAutoPublish({ ...base, trustTier: "OFFICIAL", parsedOk: false }).publish).toBe(false);
    expect(
      shouldAutoPublish({
        ...base,
        trustTier: "OFFICIAL",
        scan: { publishable: false, riskLevel: "HIGH", counts: { HIGH: 1 } },
      }).publish,
    ).toBe(false);
  });
});

describe("buildSkillSlug", () => {
  it("builds a stable lowercase slug", () => {
    expect(buildSkillSlug("My Skill!", "anthropics-skills")).toBe("my-skill");
    expect(buildSkillSlug("  Café  ", "src")).toBe("cafe");
  });

  it("qualifies the slug with the source on collision", () => {
    expect(buildSkillSlug("My Skill!", "anthropics-skills", "my-skill")).toBe(
      "my-skill-anthropics-skills",
    );
    expect(buildSkillSlug("Other", "src", "my-skill")).toBe("other");
  });
});
