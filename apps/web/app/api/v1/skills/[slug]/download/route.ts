import type { NextRequest } from "next/server";
import { zipSync } from "fflate";
import { errorResponse, json, rateLimit, clientIp } from "@/lib/http";
import { canonicalFiles, canMirror, getPublishedSkill, verifyStoredHash } from "@/lib/manifest";

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    if (!rateLimit(`api:download:${clientIp(request)}`, 30, 60_000)) {
      return json({ error: "Rate limit exceeded" }, { status: 429 });
    }
    const { slug } = await params;
    const skill = await getPublishedSkill(slug);
    if (!skill || !skill.currentVersion) return json({ error: "No published version" }, { status: 404 });
    if (!canMirror(skill.currentVersion.license ?? skill.license)) {
      return json(
        { error: "Source-only distribution", reason: "License does not allow mirroring", sourceUrl: skill.repositoryUrl },
        { status: 409 },
      );
    }
    if (!verifyStoredHash(skill.currentVersion.files, skill.currentVersion.contentHash)) {
      return json({ error: "Stored snapshot failed integrity verification" }, { status: 409 });
    }

    const files = canonicalFiles(skill.currentVersion.files);
    const archive: Record<string, Uint8Array> = {};
    for (const file of files) {
      if (file.path.includes("..") || file.path.startsWith("/") || file.path.includes("\\")) continue;
      archive[`${slug}/${file.path}`] = new TextEncoder().encode(
        file.encoding === "base64" ? "" : file.content,
      );
      if (file.encoding === "base64") {
        archive[`${slug}/${file.path}`] = Uint8Array.from(atob(file.content), (char) => char.charCodeAt(0));
      }
    }

    archive[`${slug}/NOTICE.txt`] = new TextEncoder().encode(
      [
        `Skill: ${skill.name}`,
        `Version: ${skill.currentVersion.versionLabel}`,
        `Content hash (sha256): ${skill.currentVersion.contentHash}`,
        `Source: ${skill.repositoryUrl}`,
        `Source snapshot: ${skill.sourceUrl}`,
        `License: ${skill.currentVersion.license ?? skill.license ?? "not specified"}`,
        `Imported: ${skill.currentVersion.fetchedAt.toISOString()}`,
        "",
        "Imported from the original repository. All rights belong to the original authors.",
        "This archive is provided for installation convenience. Verify the source and license before use.",
        "Files are distributed as-is; no code was executed during import or packaging.",
      ].join("\n"),
    );

    const zipped = zipSync(archive, { level: 6 });
    return new Response(Buffer.from(zipped), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${slug}-${skill.currentVersion.versionLabel}.zip"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
