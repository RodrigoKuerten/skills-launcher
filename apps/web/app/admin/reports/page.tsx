import Link from "next/link";
import { Flag } from "lucide-react";
import { db } from "@/lib/db";
import { formatRelative } from "@/lib/utils";
import { AdminActionButton } from "@/components/admin-controls";
import { Card, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminReportsPage() {
  const reports = await db.report.findMany({
    include: {
      skill: { select: { slug: true, name: true, status: true, trustLevel: true } },
      user: { select: { email: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
  });

  return (
    <div>
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">Admin / Reports</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Community reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Signed-in users can report unsafe instructions, malware, broken files, licensing issues or spam.
        </p>
      </div>

      <div className="mt-6">
        {reports.length ? (
          <div className="space-y-2">
            {reports.map((report) => (
              <Card key={report.id} className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-border bg-muted px-1.5 py-0.5 text-[9px] uppercase">{report.reason}</span>
                      <Link href={`/skills/${report.skill.slug}`} className="text-xs font-medium hover:text-accent">
                        {report.skill.name}
                      </Link>
                      <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${report.status === "OPEN" ? "bg-warning/10 text-warning" : "bg-muted text-muted-foreground"}`}>
                        {report.status.toLowerCase()}
                      </span>
                    </div>
                    {report.details ? <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{report.details}</p> : null}
                    <p className="mt-1 font-mono text-[9px] text-muted-foreground">
                      {report.user?.email ?? "deleted user"} · {formatRelative(report.createdAt)}
                    </p>
                  </div>
                  {report.status === "OPEN" ? (
                    <div className="flex shrink-0 gap-1">
                      <AdminActionButton
                        endpoint={`/api/admin/reports/${report.id}`}
                        method="PATCH"
                        body={{ status: "RESOLVED" }}
                        label="Resolve"
                      />
                      <AdminActionButton
                        endpoint={`/api/admin/reports/${report.id}`}
                        method="PATCH"
                        body={{ status: "DISMISSED" }}
                        label="Dismiss"
                        variant="ghost"
                      />
                    </div>
                  ) : null}
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState icon={<Flag className="size-6" />} title="No reports" description="Community reports appear here for triage." />
        )}
      </div>
    </div>
  );
}
