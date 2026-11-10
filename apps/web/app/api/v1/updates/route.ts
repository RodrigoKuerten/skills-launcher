import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { errorResponse, jsonCached } from "@/lib/http";

export async function GET(request: NextRequest) {
  try {
    const limit = Math.min(50, Math.max(1, Number(new URL(request.url).searchParams.get("limit")) || 20));
    const versions = await db.skillVersion.findMany({
      where: { status: "PUBLISHED", skill: { status: "ACTIVE" } },
      orderBy: { publishedAt: "desc" },
      take: limit,
      select: {
        versionLabel: true,
        contentHash: true,
        commitSha: true,
        changelog: true,
        publishedAt: true,
        fileCount: true,
        securityScore: true,
        skill: { select: { slug: true, name: true, summary: true, trustLevel: true, category: { select: { name: true, slug: true } } } },
      },
    });
    return jsonCached({ data: versions }, 30);
  } catch (error) {
    return errorResponse(error);
  }
}
