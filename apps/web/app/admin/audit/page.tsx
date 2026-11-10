import { ScrollText } from "lucide-react";
import { db } from "@/lib/db";
import { formatDate, formatRelative } from "@/lib/utils";
import { Card, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminAuditPage() {
  const logs = await db.auditLog.findMany({
    include: { user: { select: { email: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">Admin / Audit</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Audit log</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Admin actions, publishing decisions, source changes and account events. Read-only; the newest 100 entries.
        </p>
      </div>

      <div className="mt-6">
        {logs.length ? (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="border-b border-border bg-muted/40 text-[9px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">When</th>
                  <th className="px-4 py-2.5 font-medium">Actor</th>
                  <th className="px-4 py-2.5 font-medium">Action</th>
                  <th className="px-4 py-2.5 font-medium">Entity</th>
                  <th className="px-4 py-2.5 font-medium">Metadata</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-muted/30">
                    <td className="px-4 py-2.5 font-mono text-[10px] text-muted-foreground" title={formatDate(log.createdAt)}>
                      {formatRelative(log.createdAt)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[10px]">{log.user?.email ?? "system"}</td>
                    <td className="px-4 py-2.5 font-mono text-[10px] text-accent">{log.action}</td>
                    <td className="px-4 py-2.5 font-mono text-[10px] text-muted-foreground">
                      {log.entity}
                      {log.entityId ? <span className="text-foreground/60"> · {log.entityId.slice(0, 10)}…</span> : null}
                    </td>
                    <td className="max-w-[320px] truncate px-4 py-2.5 font-mono text-[9px] text-muted-foreground" title={log.metadata}>
                      {log.metadata}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : (
          <EmptyState icon={<ScrollText className="size-6" />} title="No audit entries" description="Admin actions will appear here." />
        )}
      </div>
    </div>
  );
}
