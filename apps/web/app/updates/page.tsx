import Link from "next/link";
import { ArrowRight, Bell, GitCommitHorizontal, Package, RefreshCw } from "lucide-react";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { formatDate, formatRelative, hostLabel } from "@/lib/utils";
import { skillCardInclude, toSkillCard } from "@/lib/catalog";
import { SkillCard } from "@/components/skill-card";
import { ButtonLink, Card, EmptyState, SectionHeading } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Updates" };

export default async function UpdatesPage() {
  const [versions, user] = await Promise.all([
    db.skillVersion.findMany({
      where: { status: "PUBLISHED", skill: { status: "ACTIVE" } },
      include: { skill: { select: { slug: true, name: true, summary: true, trustLevel: true, category: { select: { name: true, slug: true } } } } },
      orderBy: { publishedAt: "desc" },
      take: 40,
    }),
    getSessionUser(),
  ]);

  const saved = user
    ? await db.libraryItem.findMany({
        where: { userId: user.id },
        include: { skill: { include: skillCardInclude } },
        orderBy: { createdAt: "desc" },
        take: 8,
      })
    : [];

  const installations = user
    ? await db.installation.findMany({
        where: { userId: user.id, status: { not: "REMOVED" } },
        include: {
          skill: {
            select: {
              slug: true,
              name: true,
              currentVersion: { select: { versionLabel: true, contentHash: true } },
            },
          },
        },
        orderBy: { updatedAt: "desc" },
      })
    : [];

  const updatesAvailable = installations.filter(
    (installation) =>
      installation.status === "INSTALLED" &&
      installation.skill.currentVersion &&
      installation.contentHash !== installation.skill.currentVersion.contentHash,
  );

  return (
    <div className="container-page py-10">
      <div className="max-w-2xl">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">Updates</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Knowledge that keeps moving</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Every published version, with its source commit and content hash. Save skills or report installs to see what
          changed on your machine.
        </p>
      </div>

      {user ? (
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <RefreshCw className="size-4 text-accent" /> Your installations
              </div>
              <ButtonLink href="/my-agents" variant="ghost" size="sm">
                Manage <ArrowRight className="size-3" />
              </ButtonLink>
            </div>
            {updatesAvailable.length ? (
              <div className="mt-4 space-y-2">
                {updatesAvailable.map((installation) => (
                  <Link
                    key={installation.id}
                    href={`/skills/${installation.skill.slug}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-accent/20 bg-accent-soft/40 p-2.5 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{installation.skill.name}</p>
                      <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                        {hostLabel(installation.agentHost)} · {installation.versionLabel} →{" "}
                        {installation.skill.currentVersion?.versionLabel}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[9px] font-medium text-accent-foreground">
                      update
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-4 rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                No updates found for your reported installations. The companion reports versions only after you pair an
                API token.
              </p>
            )}
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Bell className="size-4 text-accent" /> Saved skills
              </div>
              <ButtonLink href="/library" variant="ghost" size="sm">
                Library <ArrowRight className="size-3" />
              </ButtonLink>
            </div>
            {saved.length ? (
              <div className="mt-4 divide-y divide-border">
                {saved.map((item) => (
                  <Link key={item.id} href={`/skills/${item.skill.slug}`} className="flex items-center justify-between gap-2 py-2 text-xs hover:text-accent">
                    <span className="truncate">{item.skill.name}</span>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      {item.skill.currentVersion?.versionLabel ?? "pending"}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-4 rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                Save skills from the catalog to follow their versions here.
              </p>
            )}
          </Card>
        </div>
      ) : (
        <div className="mt-8 flex flex-col items-start justify-between gap-3 rounded-xl border border-border bg-card p-5 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-medium">See updates for your own skills</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Sign in, save skills, and pair the companion to track installed versions.</p>
          </div>
          <ButtonLink href="/login?next=/updates" size="sm">
            Sign in
          </ButtonLink>
        </div>
      )}

      <div className="mt-10">
        <SectionHeading
          eyebrow="Changelog"
          title="Latest published versions"
          description="Immutable snapshots imported from their sources. Quarantined versions never appear here."
        />
        {versions.length ? (
          <div className="relative border-l border-border pl-5">
            {versions.map((version) => (
              <div key={version.id} className="relative pb-6">
                <span className="absolute -left-[27px] top-1.5 size-2 rounded-full border border-accent bg-background" />
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/skills/${version.skill.slug}`} className="text-xs font-medium hover:text-accent">
                    {version.skill.name}
                  </Link>
                  <span className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[9px]">
                    {version.versionLabel}
                  </span>
                  {version.skill.category ? (
                    <span className="text-[10px] text-muted-foreground">{version.skill.category.name}</span>
                  ) : null}
                </div>
                <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">{version.skill.summary}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-3 font-mono text-[9px] text-muted-foreground/80">
                  <span>{formatRelative(version.publishedAt)}</span>
                  {version.commitSha ? (
                    <span className="inline-flex items-center gap-1">
                      <GitCommitHorizontal className="size-2.5" /> {version.commitSha.slice(0, 7)}
                    </span>
                  ) : null}
                  <span className="inline-flex items-center gap-1">
                    <Package className="size-2.5" /> {version.fileCount} files
                  </span>
                  <span>scan {version.securityScore}</span>
                  <span>{formatDate(version.publishedAt)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No published updates yet"
            description="Run a sync from the admin panel or seed the catalog to start importing versions."
            action={<ButtonLink href="/admin" size="sm">Open admin</ButtonLink>}
          />
        )}
      </div>

      {saved.length ? (
        <div className="mt-12">
          <SectionHeading eyebrow="Saved" title="Skills in your library" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {saved.map((item) => (
              <SkillCard key={item.id} skill={toSkillCard(item.skill)} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
