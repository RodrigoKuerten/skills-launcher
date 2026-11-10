import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { errorResponse, json, rateLimit, clientIp } from "@/lib/http";
import { compatibilityMap, installInstructions } from "@/lib/manifest";

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    if (!rateLimit(`api:skill:${clientIp(request)}`, 120, 60_000)) {
      return json({ error: "Rate limit exceeded" }, { status: 429 });
    }
    const { slug } = await params;
    const skill = await db.skill.findUnique({
      where: { slug },
      include: {
        category: { select: { name: true, slug: true } },
        source: { select: { name: true, trustTier: true, type: true } },
        hosts: { select: { host: true, status: true, notes: true, validatedAt: true } },
        currentVersion: {
          select: {
            versionLabel: true,
            contentHash: true,
            commitSha: true,
            readme: true,
            fileCount: true,
            totalBytes: true,
            securityScore: true,
            riskLevel: true,
            scanFindings: true,
            scannerVersion: true,
            license: true,
            publishedAt: true,
          },
        },
        versions: {
          where: { status: "PUBLISHED" },
          orderBy: { publishedAt: "desc" },
          take: 20,
          select: {
            id: true,
            versionLabel: true,
            contentHash: true,
            commitSha: true,
            publishedAt: true,
            fileCount: true,
            totalBytes: true,
          },
        },
        reviews: {
          orderBy: { createdAt: "desc" },
          take: 20,
          select: { rating: true, body: true, createdAt: true, user: { select: { name: true } } },
        },
      },
    });

    if (!skill || skill.status === "QUARANTINED" || skill.status === "REJECTED") {
      return json({ error: "Skill not found" }, { status: 404 });
    }

    const findings = (() => {
      try {
        return JSON.parse(skill.currentVersion?.scanFindings ?? "[]");
      } catch {
        return [];
      }
    })();

    return json({
      data: {
        slug: skill.slug,
        name: skill.name,
        summary: skill.summary,
        description: skill.description,
        author: skill.author,
        repositoryUrl: skill.repositoryUrl,
        sourceUrl: skill.sourceUrl,
        license: skill.license,
        priceCents: skill.priceCents,
        currency: skill.currency,
        status: skill.status,
        trustLevel: skill.trustLevel,
        qualityScore: skill.qualityScore,
        securityScore: skill.securityScore,
        riskLevel: skill.riskLevel,
        stars: skill.stars,
        installCount: skill.installCount,
        rating: { average: skill.ratingAvg, count: skill.ratingCount },
        category: skill.category,
        source: skill.source,
        compatibility: skill.hosts.map((host) => ({
          host: host.host,
          status: host.status,
          notes: host.notes,
          validatedAt: host.validatedAt,
        })),
        version: skill.currentVersion
          ? {
              label: skill.currentVersion.versionLabel,
              contentHash: skill.currentVersion.contentHash,
              commitSha: skill.currentVersion.commitSha,
              publishedAt: skill.currentVersion.publishedAt,
              fileCount: skill.currentVersion.fileCount,
              totalBytes: skill.currentVersion.totalBytes,
              scannerVersion: skill.currentVersion.scannerVersion,
              readme: skill.currentVersion.readme,
              findings,
              compatibility: compatibilityMap(skill.hosts),
              installInstructions,
            }
          : null,
        versions: skill.versions,
        reviews: skill.reviews,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
