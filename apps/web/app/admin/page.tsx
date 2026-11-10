import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Boxes,
  Layers,
  Package,
  Rss,
  ShieldAlert,
  ShieldCheck,
  Users,
} from "lucide-react";
import { db } from "@/lib/db";
import { formatDate, formatRelative } from "@/lib/utils";
import { AdminActionButton } from "@/components/admin-controls";
import { ButtonLink, Card, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const [
    skills,
    active,
    quarantined,
    sources,
    failedSources,
    versions,
    installs,
    reviews,
    reports,
    discoveries,
    runs,
    recentSkills,
  ] = await Promise.all([
    db.skill.count(),
    db.skill.count({ where: { status: "ACTIVE" } }),
    db.skill.count({ where: { status: "QUARANTINED" } }),
    db.source.count(),
    db.source.count({ where: { lastStatus: "ERROR" } }),
    db.skillVersion.count(),
    db.installation.count(),
    db.review.count(),
    db.report.count({ where: { status: "OPEN" } }),
    db.discovery.count({ where: { status: "NEW" } }),
    db.syncRun.findMany({ orderBy: { startedAt: "desc" }, take: 6, include: { source: { select: { name: true } } } }),
    db.skill.findMany({
      where: { status: "QUARANTINED" },
      include: {
        source: { select: { name: true } },
        versions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { securityScore: true, riskLevel: true, incomplete: true },
        },
      },
      orderBy: { createdAt: "asc" },
      take: 4,
    }),
  ]);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">Control plane</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Ecosystem overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sources, imports, quarantine and sync health in one place.</p>
        </div>
        <AdminActionButton
          endpoint="/api/cron/sync"
          label="Sync due sources"
          icon={<Activity className="size-3.5" />}
          variant="primary"
          size="md"
        />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Active skills" value={active} hint={`${skills} total`} />
        <Stat label="Quarantined" value={quarantined} hint="awaiting approval" />
        <Stat label="Sources" value={sources} hint={`${failedSources} in error`} />
        <Stat label="Versions" value={versions} hint={`${installs} reported installs`} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Open reports" value={reports} />
        <Stat label="New discoveries" value={discoveries} />
        <Stat label="Reviews" value={reviews} />
        <Stat label="Host rows" value={await db.skillHost.count({ where: { status: "VERIFIED" } })} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Activity className="size-4 text-accent" /> Recent sync runs
            </div>
            <Link href="/admin/runs" className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground">
              All runs <ArrowRight className="size-3" />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {runs.length ? (
              runs.map((run) => (
                <div key={run.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span
                    className={`size-1.5 shrink-0 rounded-full ${run.status === "OK" ? "bg-success" : run.status === "ERROR" ? "bg-danger" : "bg-warning"}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{run.source.name}</p>
                    <p className="mt-0.5 font-mono text-[9px] text-muted-foreground">
                      {formatRelative(run.startedAt)} · +{run.created} · ~{run.updated} · !{run.quarantined} · {run.unchanged} unchanged
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-[9px] text-muted-foreground">{run.status}</span>
                </div>
              ))
            ) : (
              <p className="px-4 py-6 text-xs text-muted-foreground">No sync runs yet. Seed the catalog or run a sync.</p>
            )}
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ShieldAlert className="size-4 text-warning" /> Review queue
          </div>
          {recentSkills.length ? (
            <div className="mt-3 space-y-2">
              {recentSkills.map((skill) => (
                <Link
                  key={skill.id}
                  href={`/skills/${skill.slug}`}
                  className="block rounded-lg border border-border p-2.5 transition-colors hover:border-accent/30"
                >
                  <p className="truncate text-xs font-medium">{skill.name}</p>
                  <p className="mt-0.5 font-mono text-[9px] text-muted-foreground">
                    {skill.source.name} · {skill.versions[0]?.securityScore ?? "—"} scan · risk {skill.versions[0]?.riskLevel ?? "—"}
                  </p>
                </Link>
              ))}
              <ButtonLink href="/admin/review" size="sm" variant="outline" className="w-full">
                Open review queue
              </ButtonLink>
            </div>
          ) : (
            <p className="mt-3 rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
              Nothing quarantined.
            </p>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { href: "/admin/sources", icon: Boxes, title: "Sources", text: "Add repos/feeds, set frequency, pause." },
          { href: "/admin/review", icon: ShieldCheck, title: "Quarantine", text: "Approve or reject specific versions." },
          { href: "/admin/reports", icon: AlertTriangle, title: "Reports", text: "Triage community safety reports." },
          { href: "/admin/discoveries", icon: Rss, title: "Discoveries", text: "Review feed items before importing." },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group rounded-xl border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-accent/30"
          >
            <item.icon className="size-4 text-accent" />
            <p className="mt-2.5 text-xs font-medium group-hover:text-accent">{item.title}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">{item.text}</p>
          </Link>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-4 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><Users className="size-3" /> {await db.user.count()} users</span>
        <span className="inline-flex items-center gap-1.5"><Layers className="size-3" /> {await db.category.count()} categories</span>
        <span className="inline-flex items-center gap-1.5"><Package className="size-3" /> {await db.skillHost.count()} host validations</span>
        <span className="inline-flex items-center gap-1.5"><Activity className="size-3" /> {formatDate(new Date())}</span>
      </div>
    </div>
  );
}
