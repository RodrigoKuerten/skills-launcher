import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin";
import { errorResponse, json } from "@/lib/http";

export async function GET() {
  try {
    await requireAdminApi();
    const discoveries = await db.discovery.findMany({
      orderBy: { detectedAt: "desc" },
      take: 100,
      include: { source: { select: { name: true, slug: true, trustTier: true } } },
    });
    return json({ data: discoveries });
  } catch (error) {
    return errorResponse(error);
  }
}
