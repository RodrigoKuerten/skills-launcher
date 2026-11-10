import { createHash } from "node:crypto";
import { readSkillFrontmatter } from "./parser";
import type { SkillFile } from "./types";

const TEXT_ENCODER = new TextEncoder();

/** Official semver 2.0.0 pattern (major.minor.patch with optional pre-release/build). */
const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

const BINARY_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "avif",
  "ico",
  "bmp",
  "tif",
  "tiff",
  "psd",
  "pdf",
  "zip",
  "gz",
  "tgz",
  "bz2",
  "xz",
  "7z",
  "rar",
  "tar",
  "exe",
  "dll",
  "so",
  "dylib",
  "bin",
  "o",
  "obj",
  "a",
  "lib",
  "class",
  "jar",
  "war",
  "wasm",
  "woff",
  "woff2",
  "ttf",
  "otf",
  "eot",
  "mp3",
  "wav",
  "ogg",
  "flac",
  "aac",
  "m4a",
  "mp4",
  "m4v",
  "avi",
  "mov",
  "mkv",
  "webm",
  "wmv",
  "sqlite",
  "sqlite3",
  "db",
  "pyc",
  "pyd",
  "node",
  "iso",
  "dmg",
  "deb",
  "rpm",
  "apk",
  "ipa",
]);

function comparePaths(a: SkillFile, b: SkillFile): number {
  if (a.path < b.path) return -1;
  if (a.path > b.path) return 1;
  return 0;
}

function decodeFileBytes(file: SkillFile): Uint8Array {
  if (file.encoding === "base64") {
    return new Uint8Array(Buffer.from(file.content, "base64"));
  }
  return TEXT_ENCODER.encode(file.content);
}

export function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Return a copy of the files with sha256 of the decoded bytes. Input is untouched. */
export function withFileHashes(files: SkillFile[]): SkillFile[] {
  return files.map((file) => ({
    ...file,
    sha256: sha256Hex(decodeFileBytes(file)),
  }));
}

/**
 * Canonical file-set hash: sort by path, digest each path+NUL+bytes, then hash
 * the concatenated digests. Independent of input order.
 */
export function hashSkillFiles(files: SkillFile[]): string {
  const sorted = [...files].sort(comparePaths);
  const setHash = createHash("sha256");

  for (const file of sorted) {
    const fileHash = createHash("sha256")
      .update(file.path, "utf8")
      .update("\0", "utf8")
      .update(decodeFileBytes(file))
      .digest();
    setHash.update(fileHash);
  }

  return setHash.digest("hex");
}

export function versionLabel(files: SkillFile[], fetchedAt?: Date): string {
  try {
    const skillFile = files.find(
      (file) => file.path === "SKILL.md" || file.path.endsWith("/SKILL.md"),
    );

    if (skillFile && skillFile.encoding !== "base64") {
      const read = readSkillFrontmatter(skillFile.content);
      if (read.ok) {
        const version = read.frontmatter.version;
        if (typeof version === "string") {
          const trimmed = version.trim();
          if (SEMVER_PATTERN.test(trimmed)) return trimmed;
        }
      }
    }

    const date =
      fetchedAt && !Number.isNaN(fetchedAt.getTime()) ? fetchedAt : new Date();
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");

    return `${year}.${month}.${day}-${hashSkillFiles(files).slice(0, 7)}`;
  } catch {
    return `1970.01.01-${sha256Hex("").slice(0, 7)}`;
  }
}

export function isTextFile(path: string): boolean {
  const base = path.replace(/\\/g, "/").split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot < 0) return true;
  return !BINARY_EXTENSIONS.has(base.slice(dot + 1).toLowerCase());
}

export function isSafeRelativePath(path: string): boolean {
  if (typeof path !== "string" || path.length === 0) return false;
  if (path.includes("\\") || path.includes("\0")) return false;
  if (path.startsWith("/") || path.startsWith("~")) return false;
  if (/^[A-Za-z]:/.test(path)) return false;

  const segments = path.split("/");
  return segments.every(
    (segment) => segment.length > 0 && segment !== "..",
  );
}
