import { describe, expect, it } from "vitest";
import { parseSkillMarkdown } from "../src/parser.js";

const validSkill = `---
name: pdf-helper
description: Extract text and tables from PDF files safely and accurately.
license: MIT
unknown-field: kept
---

# PDF Helper

Use this skill to extract text and tables from PDF files.
`;

describe("parseSkillMarkdown", () => {
  it("parses valid frontmatter and keeps unknown fields", () => {
    const result = parseSkillMarkdown(validSkill);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skill.name).toBe("pdf-helper");
    expect(result.skill.description).toContain("PDF");
    expect(result.skill.frontmatter.license).toBe("MIT");
    expect(result.skill.frontmatter["unknown-field"]).toBe("kept");
    expect(result.skill.body).toContain("# PDF Helper");
    expect(result.warnings).toEqual([]);
  });

  it("rejects a name that is not lowercase kebab-case", () => {
    const result = parseSkillMarkdown(
      validSkill.replace("name: pdf-helper", "name: PDF_Helper"),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(" ")).toMatch(/name/i);
  });

  it("rejects a name longer than 64 characters", () => {
    const longName = "a".repeat(65);
    const result = parseSkillMarkdown(
      validSkill.replace("name: pdf-helper", `name: ${longName}`),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(" ")).toMatch(/64/);
  });

  it("rejects a description longer than 1024 characters", () => {
    const longDescription = "a".repeat(1025);
    const result = parseSkillMarkdown(
      validSkill.replace(
        "description: Extract text and tables from PDF files safely and accurately.",
        `description: ${longDescription}`,
      ),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(" ")).toMatch(/1024/);
  });

  it("reports a missing frontmatter block without throwing", () => {
    const result = parseSkillMarkdown("# Just markdown\n\nNo frontmatter here.");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatch(/frontmatter/i);
  });

  it("reports missing required fields", () => {
    const result = parseSkillMarkdown(`---
license: MIT
---

Body that is long enough to avoid the short-body warning.
`);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain("Missing required field: name.");
    expect(result.errors).toContain("Missing required field: description.");
  });

  it("returns human-readable errors for invalid YAML", () => {
    const result = parseSkillMarkdown(`---
name: [unclosed
description: broken yaml
---

Body text.
`);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(" ")).toMatch(/YAML/i);
  });

  it("warns about missing license and short body or description", () => {
    const result = parseSkillMarkdown(`---
name: short-skill
description: Tiny.
---

Tiny body.
`);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.join(" ")).toMatch(/license/i);
    expect(result.warnings.join(" ")).toMatch(/description/i);
    expect(result.warnings.join(" ")).toMatch(/body/i);
  });
});
