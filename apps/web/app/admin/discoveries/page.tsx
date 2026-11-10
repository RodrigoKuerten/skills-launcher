import { ExternalLink, Rss } from "lucide-react";
import { db } from "@/lib/db";
import { formatRelative } from "@/lib/utils";
import { AdminActionButton } from "@/components/admin-controls";
import { Card, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

function repoFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "github.com" && parsed.hostname !== "www.github.com") return null;
    const [owner, repo] = parsed.pathname.split("/").filter(Boolean);
    return owner && repo ? `${owner}/${repo}` : null;
  } catch {
    return null;
  }
}

export default async function AdminDiscoveriesPage() {
  const discoveries = await db.discovery.findMany({
    include: { source: { select: { name: true, trustTier: true } } },
    orderBy: [{ status: "asc" }, { detectedAt: "desc" }],
    take: 100,
  });

  return (
    <div>
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">Admin / Discoveries</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Discovered items</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Feed items are recorded as discoveries only. They never become skills automatically: an admin approves the item and
          registers a repository source, which is then imported through the normal scan and quarantine pipeline.
        </p>
      </div>

      <div className="mt-6">
        {discoveries.length ? (
          <div className="space-y-2">
            {discoveries.map((discovery) => {
              const repo = repoFromUrl(discovery.url);
              return (
                <Card key={discovery.id} className={`p-4 ${discovery.status !== "NEW" ? "opacity-65" : ""}`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-border bg-muted px-1.5 py-0.5 text-[9px]">{discovery.source.name}</span>
                        <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${discovery.status === "NEW" ? "bg-warning/10 text-warning" : "bg-muted text-muted-foreground"}`}>
                          {discovery.status.toLowerCase()}
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs font-medium">{discovery.title}</p>
                      {discovery.summary ? <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{discovery.summary}</p> : null}
                      <a
                        href={discovery.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="mt-1.5 inline-flex max-w-full items-center gap-1 break-all font-mono text-[9px] text-muted-foreground hover:text-accent"
                      >
                        {discovery.url} <ExternalLink className="size-2.5 shrink-0" />
                      </a>
                      <p className="mt-1 font-mono text-[9px] text-muted-foreground">detected {formatRelative(discovery.detectedAt)}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1">
                      {repo ? (
                        <a
                          href={`/admin/sources?repo=${encodeURIComponent(repo)}`}
                          className="inline-flex h-8 items-center rounded-lg border border-accent/30 bg-accent-soft px-3 text-xs font-medium text-accent hover:brightness-110"
                        >
                          Register repo
                        </a>
                      ) : null}
                      {discovery.status === "NEW" ? (
                        <>
                          <AdminActionButton
                            endpoint={`/api/admin/discoveries/${discovery.id}`}
                            method="PATCH"
                            body={{ status: "APPROVED" }}
                            label="Approve"
                          />
                          <AdminActionButton
                            endpoint={`/api/admin/discoveries/${discovery.id}`}
                            method="PATCH"
                            body={{ status: "REJECTED" }}
                            label="Reject"
                            variant="ghost"
                          />
                        </>
                      ) : null}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={<Rss className="size-6" />}
            title="No discoveries"
            description="RSS/Atom feed items will appear here. Add a feed source from the Sources page."
          />
        )}
      </div>
    </div>
  );
}
