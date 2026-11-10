import Link from "next/link";
import { Activity, AlertTriangle, ArrowUpRight, GitFork, Link2, Radio, RefreshCw, ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { cn, formatNumber, formatRelative, publicUrl, redactTextUrls } from "@/lib/utils";
import { ButtonLink, Card, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sources" };

const typeLabel: Record<string, string> = {
  GITHUB_REPO: "GitHub repository",
  RSS: "RSS / Atom feed",
  HTTP_JSON: "JSON feed",
};

const trustLabel: Record<string, string> = {
  OFFICIAL: "Official",
  VERIFIED: "Verified",
  COMMUNITY: "Community",
};

function frequency(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1440)}d`;
}

export default async function SourcesPage() {
  const [sources, user] = await Promise.all([
    db.source.findMany({
      include: {
        _count: { select: { skills: true, runs: true } },
        runs: { orderBy: { startedAt: "desc" }, take: 1 },
      },
      orderBy: [{ enabled: "desc" }, { trustTier: "asc" }, { name: "asc" }],
    }),
    getSessionUser(),
  ]);

  const enabled = sources.filter((source) => source.enabled).length;
  const errors = sources.filter((source) => source.lastStatus === "ERROR").length;
  const skillCount = sources.reduce((total, source) => total + source._count.skills, 0);

  return (
    <div className="container-page py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">Monitoring</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Verifiable sources</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Every imported fact has a source URL, a commit or feed item, and a fetch timestamp. Nothing is invented when a
            source fails — failures are recorded as failures.
          </p>
        </div>
        {user?.role === "ADMIN" ? (
          <ButtonLink href="/admin/sources" size="sm">
            Manage sources
          </ButtonLink>
        ) : null}
      </div>

      <div className="mt-7 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Sources registered", value: sources.length, icon: Link2 },
          { label: "Enabled", value: enabled, icon: Radio },
          { label: "Skills imported", value: skillCount, icon: GitFork },
          { label: "Sources in error", value: errors, icon: AlertTriangle },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border border-border bg-card p-3.5">
            <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
              <item.icon className="size-3" /> {item.label}
            </div>
            <div className="mt-1.5 text-xl font-semibold tabular-nums">{formatNumber(item.value)}</div>
          </div>
        ))}
      </div>

      {sources.length ? (
        <div className="mt-6 grid gap-3 lg:grid-cols-2">
          {sources.map((source) => {
            const lastRun = source.runs[0];
            return (
              <Card key={source.id} className={cn("p-4", !source.enabled && "opacity-60")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-sm font-semibold">{source.name}</h2>
                      <span
                        className={cn(
                          "rounded-full border px-1.5 py-0.5 text-[9px]",
                          source.trustTier === "OFFICIAL"
                            ? "border-accent/30 bg-accent-soft text-accent"
                            : source.trustTier === "VERIFIED"
                              ? "border-success/25 bg-success/10 text-success"
                              : "border-border bg-muted text-muted-foreground",
                        )}
                      >
                        {trustLabel[source.trustTier] ?? source.trustTier}
                      </span>
                      {!source.enabled ? (
                        <span className="rounded-full border border-border bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">
                          paused
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 font-mono text-[10px] text-muted-foreground">{typeLabel[source.type] ?? source.type}</p>
                  </div>
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      source.lastStatus === "OK"
                        ? "bg-success"
                        : source.lastStatus === "ERROR"
                          ? "bg-danger"
                          : "bg-border",
                    )}
                    title={source.lastStatus ?? "never checked"}
                  />
                </div>

                <a
                  href={publicUrl(source.url)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-3 flex items-center gap-1 break-all text-[11px] text-muted-foreground hover:text-accent"
                >
                  {publicUrl(source.url)} <ArrowUpRight className="size-3 shrink-0" />
                </a>

                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border/60 pt-3 text-[10px]">
                  <div>
                    <p className="text-muted-foreground">Skills</p>
                    <p className="mt-0.5 font-mono text-foreground">{source._count.skills}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Every</p>
                    <p className="mt-0.5 font-mono text-foreground">{frequency(source.frequencyMinutes)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Last check</p>
                    <p className="mt-0.5 font-mono text-foreground">{formatRelative(source.lastCheckedAt)}</p>
                  </div>
                </div>

                {source.lastStatus === "ERROR" ? (
                  <p className="mt-2 line-clamp-2 rounded border border-danger/20 bg-danger/5 p-2 text-[10px] text-danger">
                    {source.lastError ? redactTextUrls(source.lastError) : "Last sync failed."}
                  </p>
                ) : null}
                {lastRun ? (
                  <p className="mt-2 font-mono text-[9px] text-muted-foreground">
                    last run {formatRelative(lastRun.startedAt)} · found {lastRun.found} · new {lastRun.created} · updated{" "}
                    {lastRun.updated} · quarantined {lastRun.quarantined}
                  </p>
                ) : null}
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="mt-6">
          <EmptyState
            icon={<Link2 className="size-7" />}
            title="No sources configured"
            description="Add a GitHub repository or an RSS feed from the admin panel. Only admins can register outbound sources."
            action={<ButtonLink href="/admin/sources" size="sm">Add a source</ButtonLink>}
          />
        </div>
      )}

      <section className="mt-12 grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5">
          <RefreshCw className="size-5 text-accent" />
          <h2 className="mt-3 text-sm font-semibold">How a sync runs</h2>
          <ol className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-muted-foreground">
            <li>1. Claim a queued job (single worker, atomic claim).</li>
            <li>2. Read the repo tree; skip if the tree SHA is unchanged.</li>
            <li>3. Fetch only skill subtrees, cap size and file count.</li>
            <li>4. Hash the canonical file set and compare with history.</li>
            <li>5. Scan, validate hosts, publish or quarantine.</li>
          </ol>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <ShieldCheck className="size-5 text-accent" />
          <h2 className="mt-3 text-sm font-semibold">What we do not do</h2>
          <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-muted-foreground">
            <li>• No indiscriminate scraping or bypassing rate limits.</li>
            <li>• No executing imported scripts, hooks or installers.</li>
            <li>• No mirroring when the license is missing or restrictive.</li>
            <li>• No silent updates: every version is recorded and gate-checked.</li>
            <li>• No compatibility claim without format validation and local detection.</li>
          </ul>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <Activity className="size-5 text-accent" />
          <h2 className="mt-3 text-sm font-semibold">API etiquette</h2>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            GitHub uses the REST tree API plus raw content delivery. A personal token raises the limit from 60 to 5,000
            requests/hour. Feeds use ETag / Last-Modified conditional requests. skills.sh exposes an authenticated API
            (Vercel OIDC), so it is registered as a token-gated source rather than scraped.
          </p>
        </div>
      </section>
    </div>
  );
}
