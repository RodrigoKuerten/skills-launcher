import { db } from "@/lib/db";
import { errorResponse, jsonCached } from "@/lib/http";
import { publicUrl } from "@/lib/utils";

export async function GET() {
  try {
    const sources = await db.source.findMany({
      orderBy: [{ enabled: "desc" }, { name: "asc" }],
      select: {
        slug: true,
        name: true,
        type: true,
        url: true,
        repo: true,
        trustTier: true,
        license: true,
        enabled: true,
        frequencyMinutes: true,
        lastCheckedAt: true,
        lastStatus: true,
        _count: { select: { skills: true } },
      },
    });
    return jsonCached({
      data: sources.map((source) => ({
        ...source,
        url: publicUrl(source.url),
        skillCount: source._count.skills,
        _count: undefined,
      })),
    }, 30);
  } catch (error) {
    return errorResponse(error);
  }
}
