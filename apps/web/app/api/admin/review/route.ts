import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin";
import { errorResponse, json } from "@/lib/http";

export async function GET() {
  try {
    await requireAdminApi();
    const [quarantinedSkills, pendingVersions, discoveries, openReports] = await Promise.all([
      db.skill.findMany({
        where: { status: "QUARANTINED" },
        include: {
          source: { select: { name: true, trustTier: true } },
          category: { select: { name: true } },
          versions: { orderBy: { createdAt: "desc" }, take: 1 },
        },
        orderBy: { createdAt: "asc" },
      }),
      db.skillVersion.findMany({
        where: { status: "QUARANTINED", skill: { status: { not: "QUARANTINED" } } },
        include: { skill: { select: { id: true, slug: true, name: true, status: true } } },
        orderBy: { createdAt: "asc" },
      }),
      db.discovery.findMany({
        where: { status: "NEW" },
        include: { source: { select: { name: true, trustTier: true } } },
        orderBy: { detectedAt: "desc" },
        take: 50,
      }),
      db.report.count({ where: { status: "OPEN" } }),
    ]);
    return json({ quarantinedSkills, pendingVersions, discoveries, openReports });
  } catch (error) {
    return errorResponse(error);
  }
}
