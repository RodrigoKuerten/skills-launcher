import { parseDocument } from "yaml";
import type { ParseResult, ParsedSkill } from "./types";

const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export type FrontmatterReadResult =
  | { ok: true; frontmatter: Record<string, unknown>; body: string }
  | { ok: false; errors: string[] };

/**
 * Read the YAML frontmatter block without enforcing the Agent Skills fields.
 * Kept separate so hosts that treat name/description as optional can reuse it.
 */
export function readSkillFrontmatter(raw: string): FrontmatterReadResult {
  try {
    const normalized = raw.replace(/^\uFEFF/, "");
    const opening = /^---[ \t]*\r?\n/.exec(normalized);
    if (!opening) {
      return {
        ok: false,
        errors: ["SKILL.md must start with YAML frontmatter delimited by '---'."],
      };
    }

    const rest = normalized.slice(opening[0].length);
    const closing = /^---[ \t]*(?:\r?\n|$)/m.exec(rest);
    if (!closing) {
      return {
        ok: false,
        errors: ["YAML frontmatter is missing its closing '---' delimiter."],
      };
    }

    const yamlSource = rest.slice(0, closing.index);
    const body = rest.slice(closing.index + closing[0].length);
    const document = parseDocument(yamlSource, { uniqueKeys: true });

    if (document.errors.length > 0) {
      const detail = document.errors.map((error) => error.message).join("; ");
      return { ok: false, errors: [`YAML frontmatter is invalid: ${detail}`] };
    }

    const value: unknown = document.toJS();
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return {
        ok: false,
        errors: ["YAML frontmatter must be a mapping of fields."],
      };
    }

    return {
      ok: true,
      frontmatter: value as Record<string, unknown>,
      body,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, errors: [`Could not read YAML frontmatter: ${message}`] };
  }
}

export function parseSkillMarkdown(raw: string): ParseResult {
  try {
    const read = readSkillFrontmatter(raw);
    const warnings: string[] = [];

    if (!read.ok) {
      return { ok: false, errors: read.errors, warnings };
    }

    const { frontmatter, body } = read;
    const errors: string[] = [];

    const name = frontmatter.name;
    if (name === undefined || name === null) {
      errors.push("Missing required field: name.");
    } else if (typeof name !== "string") {
      errors.push("Field 'name' must be a string.");
    } else if (name.length < 1 || name.length > 64) {
      errors.push(`Field 'name' must be 1-64 characters long (got ${name.length}).`);
    } else if (!NAME_PATTERN.test(name)) {
      errors.push(
        "Field 'name' must use lowercase letters, digits and single hyphens only (for example 'pdf-helper').",
      );
    }

    const description = frontmatter.description;
    if (description === undefined || description === null) {
      errors.push("Missing required field: description.");
    } else if (typeof description !== "string") {
      errors.push("Field 'description' must be a string.");
    } else if (description.trim().length === 0) {
      errors.push("Field 'description' must not be empty.");
    } else if (description.length > 1024) {
      errors.push(
        `Field 'description' must be at most 1024 characters long (got ${description.length}).`,
      );
    }

    if (
      frontmatter.license === undefined ||
      frontmatter.license === null ||
      frontmatter.license === ""
    ) {
      warnings.push("Missing optional 'license' field.");
    }

    if (
      typeof description === "string" &&
      description.trim().length > 0 &&
      description.trim().length < 20
    ) {
      warnings.push(
        "Description is shorter than 20 characters; consider making it more specific.",
      );
    }

    if (body.trim().length < 20) {
      warnings.push(
        "Skill body is shorter than 20 characters; add usage instructions.",
      );
    }

    if (errors.length > 0) {
      return { ok: false, errors, warnings };
    }

    const skill: ParsedSkill = {
      name: name as string,
      description: description as string,
      frontmatter,
      body,
    };

    return { ok: true, skill, warnings };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      errors: [`Could not parse SKILL.md: ${message}`],
      warnings: [],
    };
  }
}
