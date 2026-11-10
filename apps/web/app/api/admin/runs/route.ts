import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin";
import { errorResponse, json } from "@/lib/http";

export async function GET() {
  try {
    await requireAdminApi();
    const runs = await db.syncRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 50,
      include: { source: { select: { name: true, slug: true, trustTier: true } } },
    });
    return json({ data: runs });
  } catch (error) {
    return errorResponse(error);
  }
}
