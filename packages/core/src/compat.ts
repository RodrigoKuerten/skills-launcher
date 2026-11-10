import { HOSTS, HOST_MAP } from "./hosts";
import { parseSkillMarkdown, readSkillFrontmatter } from "./parser";
import type {
  CompatibilityResult,
  HostDefinition,
  HostId,
  SkillFile,
} from "./types";
import { isSafeRelativePath } from "./version";

const FORMAT_NOTE =
  "Format validation only: this checks the file set against documented Agent Skills requirements, not runtime behavior.";
const DETECTION_NOTE =
  "Auto-install also depends on local detection of the host executable and its skills directory.";

function hostNotes(host: HostDefinition): string[] {
  switch (host.id) {
    case "claude-code":
      return [
        "Claude Code treats name and description as optional frontmatter fields.",
      ];
    case "codex":
      return ["Codex requires name and description in SKILL.md."];
    case "cursor":
      return ["Cursor requires name and description in SKILL.md."];
    case "copilot":
      return ["GitHub Copilot requires name and description in SKILL.md."];
    case "gemini-cli":
      return [
        "Gemini CLI requires name and description and reads only those two frontmatter fields.",
      ];
    case "windsurf":
      return [
        "Windsurf loads skills from the Devin skills directory (~/.config/devin/skills or ~/.agents/skills).",
      ];
    case "opencode":
      return ["OpenCode requires the Agent Skills name and description fields."];
    default:
      return [];
  }
}

export function validateCompatibility(
  hostId: HostId,
  files: SkillFile[],
  dirName?: string,
): CompatibilityResult {
  const host = HOST_MAP[hostId] as HostDefinition | undefined;

  if (!host) {
    return {
      host: hostId,
      status: "UNSUPPORTED",
      notes: [
        `Unknown host '${String(hostId)}'.`,
        FORMAT_NOTE,
        DETECTION_NOTE,
      ],
    };
  }

  const notes = [...hostNotes(host), FORMAT_NOTE, DETECTION_NOTE];

  if (!host.supportsAgentSkills || host.exportOnly) {
    notes.push(
      `${host.name} does not support Agent Skills directly; export the files instead.`,
    );
    return { host: host.id, status: "EXPORT_ONLY", notes };
  }

  const problems: string[] = [];
  const skillFile = files.find((file) => file.path === "SKILL.md");

  if (!skillFile) {
    problems.push("Missing SKILL.md at the skill root.");
  }

  const unsafePaths = files.filter((file) => !isSafeRelativePath(file.path));
  if (unsafePaths.length > 0) {
    problems.push(
      `Unsafe file path(s): ${unsafePaths.map((file) => file.path).join(", ")}. Paths must be relative, use forward slashes, and must not contain '..'.`,
    );
  }

  if (skillFile) {
    if (skillFile.encoding === "base64") {
      problems.push("SKILL.md must be UTF-8 text, not base64.");
    } else {
      const parsed = parseSkillMarkdown(skillFile.content);
      const fieldsOptional = host.id === "claude-code";

      if (!parsed.ok) {
        const onlyMissingFields = parsed.errors.every((error) =>
          error.startsWith("Missing required field:"),
        );
        if (!(fieldsOptional && onlyMissingFields)) {
          problems.push(...parsed.errors);
        }
      }

      const read = readSkillFrontmatter(skillFile.content);
      const frontmatter = read.ok ? read.frontmatter : {};
      const name =
        typeof frontmatter.name === "string"
          ? frontmatter.name.trim()
          : "";

      if (
        dirName !== undefined &&
        dirName.trim().length > 0 &&
        name.length > 0 &&
        dirName.trim() !== name
      ) {
        problems.push(
          `Skill directory '${dirName.trim()}' does not match the name field '${name}'.`,
        );
      }
    }
  }

  if (problems.length > 0) {
    return { host: host.id, status: "UNSUPPORTED", notes: [...notes, ...problems] };
  }

  notes.push(
    "SKILL.md and metadata satisfy this host's documented Agent Skills format.",
  );
  return { host: host.id, status: "VERIFIED", notes };
}

export function validateAllHosts(
  files: SkillFile[],
  dirName?: string,
): CompatibilityResult[] {
  return HOSTS.map((host) => validateCompatibility(host.id, files, dirName));
}
