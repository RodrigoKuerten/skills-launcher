import { ExternalLink, Link2 } from "lucide-react";
import { db } from "@/lib/db";
import { formatRelative } from "@/lib/utils";
import { AddSourceForm, SourceRowActions } from "@/components/admin-controls";
import { Card, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

const typeLabel: Record<string, string> = {
  GITHUB_REPO: "GitHub",
  RSS: "RSS",
  HTTP_JSON: "JSON",
};

export default async function AdminSourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ repo?: string }>;
}) {
  const { repo } = await searchParams;
  const sources = await db.source.findMany({
    include: {
      _count: { select: { skills: true, runs: true } },
      runs: { orderBy: { startedAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">Admin / Sources</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Sources</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Register GitHub repositories or feeds. Only admins can create outbound URLs; https only, no private hosts.
        </p>
      </div>

      <div className="mt-6">
        <AddSourceForm defaultRepo={repo ?? ""} />
      </div>

      <div className="mt-6">
        {sources.length ? (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-xs">
              <thead className="border-b border-border bg-muted/40 text-[9px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Source</th>
                  <th className="px-4 py-2.5 font-medium">Trust</th>
                  <th className="px-4 py-2.5 font-medium">Every</th>
                  <th className="px-4 py-2.5 font-medium">Last check</th>
                  <th className="px-4 py-2.5 font-medium">Skills</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sources.map((source) => (
                  <tr key={source.id} className={source.enabled ? "" : "opacity-60"}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`size-1.5 rounded-full ${source.lastStatus === "OK" ? "bg-success" : source.lastStatus === "ERROR" ? "bg-danger" : "bg-border"}`} />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{source.name}</p>
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="inline-flex max-w-[280px] items-center gap-1 truncate font-mono text-[9px] text-muted-foreground hover:text-accent"
                          >
                            {typeLabel[source.type] ?? source.type} · {source.repo ?? source.url}
                            <ExternalLink className="size-2.5 shrink-0" />
                          </a>
                          {source.lastStatus === "ERROR" ? (
                            <p className="mt-1 line-clamp-1 text-[9px] text-danger">{source.lastError}</p>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full border border-border bg-muted px-1.5 py-0.5 text-[9px]">{source.trustTier}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-[10px] text-muted-foreground">
                      {source.frequencyMinutes >= 1440 ? `${Math.round(source.frequencyMinutes / 1440)}d` : `${Math.round(source.frequencyMinutes / 60)}h`}
                    </td>
                    <td className="px-4 py-3 font-mono text-[10px] text-muted-foreground">{formatRelative(source.lastCheckedAt)}</td>
                    <td className="px-4 py-3 font-mono text-[10px]">
                      {source._count.skills}
                      <span className="text-muted-foreground"> · {source._count.runs} runs</span>
                    </td>
                    <td className="px-4 py-3">
                      <SourceRowActions id={source.id} enabled={source.enabled} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : (
          <EmptyState
            icon={<Link2 className="size-7" />}
            title="No sources yet"
            description="Add anthropics/skills, openai/skills or another Agent Skills repository above."
          />
        )}
      </div>

      <div className="mt-5 rounded-xl border border-border bg-card p-4 text-[11px] leading-relaxed text-muted-foreground">
        <p className="font-medium text-foreground">Rate limits & scheduling</p>
        <p className="mt-1">
          GitHub allows 60 requests/hour unauthenticated or 5,000 with a token. Tree fetches are skipped when the tree SHA is
          unchanged. Manual sync processes at most 40 skills per run; use the CLI for larger backfills. Failed sources record
          their error and are retried at their next scheduled interval; individual jobs use exponential backoff.
        </p>
      </div>
    </div>
  );
}
