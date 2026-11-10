import { Activity } from "lucide-react";
import { db } from "@/lib/db";
import { formatDate, formatRelative } from "@/lib/utils";
import { AdminActionButton } from "@/components/admin-controls";
import { Card, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminRunsPage() {
  const runs = await db.syncRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 50,
    include: { source: { select: { name: true, trustTier: true } } },
  });

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">Admin / Sync</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Sync runs</h1>
          <p className="mt-1 text-sm text-muted-foreground">Every import attempt, including failures and no-op runs.</p>
        </div>
        <AdminActionButton endpoint="/api/cron/sync" label="Sync due sources" icon={<Activity className="size-3.5" />} variant="primary" size="md" />
      </div>

      <div className="mt-6">
        {runs.length ? (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-xs">
              <thead className="border-b border-border bg-muted/40 text-[9px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Source</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Started</th>
                  <th className="px-4 py-2.5 font-medium">Found</th>
                  <th className="px-4 py-2.5 font-medium">Created</th>
                  <th className="px-4 py-2.5 font-medium">Updated</th>
                  <th className="px-4 py-2.5 font-medium">Unchanged</th>
                  <th className="px-4 py-2.5 font-medium">Quarantined</th>
                  <th className="px-4 py-2.5 font-medium">Trigger</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {runs.map((run) => (
                  <tr key={run.id} className="hover:bg-muted/30">
                    <td className="px-4 py-2.5">
                      <p className="font-medium">{run.source.name}</p>
                      <p className="font-mono text-[9px] text-muted-foreground">{run.source.trustTier}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${run.status === "OK" ? "bg-success/10 text-success" : run.status === "ERROR" ? "bg-danger/10 text-danger" : "bg-warning/10 text-warning"}`}>
                        {run.status}
                      </span>
                      {run.error ? <p className="mt-1 max-w-[220px] truncate text-[9px] text-danger" title={run.error}>{run.error}</p> : null}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[10px] text-muted-foreground">{formatRelative(run.startedAt)}</td>
                    <td className="px-4 py-2.5 font-mono">{run.found}</td>
                    <td className="px-4 py-2.5 font-mono text-success">{run.created}</td>
                    <td className="px-4 py-2.5 font-mono">{run.updated}</td>
                    <td className="px-4 py-2.5 font-mono text-muted-foreground">{run.unchanged}</td>
                    <td className="px-4 py-2.5 font-mono text-warning">{run.quarantined}</td>
                    <td className="px-4 py-2.5 font-mono text-[9px] text-muted-foreground">{run.trigger}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : (
          <EmptyState icon={<Activity className="size-6" />} title="No sync runs" description="Seed the database or trigger a source sync." />
        )}
      </div>
      <p className="mt-3 text-[10px] text-muted-foreground">
        Run timestamps are UTC in the database; rendered in local time. {runs.length ? `Oldest shown: ${formatDate(runs[runs.length - 1]?.startedAt)}.` : ""}
      </p>
    </div>
  );
}
