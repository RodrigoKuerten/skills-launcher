import type { NextRequest } from "next/server";
import { errorResponse, json, rateLimit, clientIp } from "@/lib/http";
import { canonicalFiles, canMirror, compatibilityMap, getPublishedSkill, installInstructions, verifyStoredHash } from "@/lib/manifest";

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    if (!rateLimit(`api:manifest:${clientIp(request)}`, 60, 60_000)) {
      return json({ error: "Rate limit exceeded" }, { status: 429 });
    }
    const { slug } = await params;
    const skill = await getPublishedSkill(slug);
    if (!skill || !skill.currentVersion) return json({ error: "No published version" }, { status: 404 });
    const license = skill.currentVersion.license ?? skill.license;
    if (!canMirror(license)) {
      return json(
        {
          error: "Source-only distribution",
          reason: license ? `License ${license} does not allow mirroring` : "No permissive license detected",
          sourceUrl: skill.repositoryUrl,
        },
        { status: 409 },
      );
    }
    if (!verifyStoredHash(skill.currentVersion.files, skill.currentVersion.contentHash)) {
      return json({ error: "Stored snapshot failed integrity verification" }, { status: 409 });
    }

    return json({
      slug: skill.slug,
      name: skill.name,
      versionLabel: skill.currentVersion.versionLabel,
      contentHash: skill.currentVersion.contentHash,
      integrity: "sha256-manifest",
      distribution: "FULL",
      files: canonicalFiles(skill.currentVersion.files),
      compatibility: compatibilityMap(skill.hosts),
      instructions: installInstructions,
      sourceUrl: skill.sourceUrl,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
