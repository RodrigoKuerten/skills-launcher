import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin";
import { errorResponse, json } from "@/lib/http";

export async function GET() {
  try {
    await requireAdminApi();
    const reports = await db.report.findMany({
      include: { skill: { select: { slug: true, name: true } }, user: { select: { email: true } } },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 100,
    });
    return json({ data: reports });
  } catch (error) {
    return errorResponse(error);
  }
}
