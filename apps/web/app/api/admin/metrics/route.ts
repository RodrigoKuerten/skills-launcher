import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin";
import { errorResponse, json } from "@/lib/http";

export async function GET() {
  try {
    await requireAdminApi();
    const [
      skills,
      quarantined,
      sources,
      failedSources,
      versions,
      installs,
      reviews,
      openReports,
      newDiscoveries,
      recentRuns,
      categories,
    ] = await Promise.all([
      db.skill.count(),
      db.skill.count({ where: { status: "QUARANTINED" } }),
      db.source.count(),
      db.source.count({ where: { lastStatus: "ERROR" } }),
      db.skillVersion.count(),
      db.installation.count(),
      db.review.count(),
      db.report.count({ where: { status: "OPEN" } }),
      db.discovery.count({ where: { status: "NEW" } }),
      db.syncRun.findMany({ orderBy: { startedAt: "desc" }, take: 8, include: { source: { select: { name: true } } } }),
      db.category.findMany({ include: { _count: { select: { skills: true } } }, orderBy: { sortOrder: "asc" } }),
    ]);
    return json({
      metrics: {
        skills,
        quarantined,
        sources,
        failedSources,
        versions,
        installs,
        reviews,
        openReports,
        newDiscoveries,
      },
      recentRuns,
      categories,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
