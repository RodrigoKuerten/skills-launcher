import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Boxes,
  Check,
  Download,
  GitBranch,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Terminal,
  Zap,
} from "lucide-react";
import { db } from "@/lib/db";
import { getCategoriesWithCounts, getPlatformStats, skillCardInclude, toSkillCard } from "@/lib/catalog";
import { formatNumber, formatRelative } from "@/lib/utils";
import { SkillCard } from "@/components/skill-card";
import { ButtonLink, EmptyState, SectionHeading } from "@/components/ui";
import { SkillGlyph } from "@/components/skill-glyph";
import { TrustBadge } from "@/components/badges";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [stats, categories, featured, trending, updated, recentVersions, featuredFallback] = await Promise.all([
    getPlatformStats(),
    getCategoriesWithCounts(),
    db.skill.findMany({
      where: { status: "ACTIVE", featured: true },
      include: skillCardInclude,
      orderBy: [{ qualityScore: "desc" }],
      take: 3,
    }),
    db.skill.findMany({
      where: { status: "ACTIVE" },
      include: skillCardInclude,
      orderBy: [{ stars: "desc" }, { qualityScore: "desc" }],
      take: 6,
    }),
    db.skill.findMany({
      where: { status: "ACTIVE" },
      include: skillCardInclude,
      orderBy: { updatedAt: "desc" },
      take: 3,
    }),
    db.skillVersion.findMany({
      where: { status: "PUBLISHED", skill: { status: "ACTIVE" } },
      include: { skill: { select: { slug: true, name: true, trustLevel: true, category: true } } },
      orderBy: { publishedAt: "desc" },
      take: 4,
    }),
    db.skill.findMany({
      where: { status: "ACTIVE" },
      include: skillCardInclude,
      orderBy: [{ qualityScore: "desc" }, { stars: "desc" }],
      take: 3,
    }),
  ]);

  const featuredSkills = featured.length ? featured : featuredFallback;
  const hasCatalog = stats.skills > 0;

  return (
    <div>
      <section className="relative overflow-hidden border-b border-border/60">
        <div className="pointer-events-none absolute inset-0 surface-grid opacity-[0.35] [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" aria-hidden />
        <div
          className="pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-accent/10 blur-[110px]"
          aria-hidden
        />
        <div className="container-page relative grid gap-14 pb-16 pt-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:pb-24 lg:pt-24">
          <div>
            <Link
              href="/my-agents"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-[11px] text-muted-foreground transition-colors hover:border-accent/40 hover:text-foreground"
            >
              <span className="size-1.5 rounded-full bg-accent shadow-[0_0_8px_var(--accent)]" />
              One companion. Seven agent hosts.
              <ArrowRight className="size-3" />
            </Link>

            <h1 className="mt-6 max-w-xl text-4xl font-semibold leading-[1.06] tracking-[-0.045em] sm:text-5xl lg:text-[3.5rem]">
              Give your agents
              <span className="block text-muted-foreground">
                better <span className="accent-text">skills.</span>
              </span>
            </h1>
            <p className="mt-5 max-w-lg text-sm leading-relaxed text-muted-foreground sm:text-base">
              Discover, verify and install skills for Claude Code, Codex, OpenCode and more. Every skill is versioned,
              statically scanned, and tracked back to a verifiable source.
            </p>

            <form action="/explore" className="mt-7 flex max-w-lg items-center gap-2" role="search">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  name="q"
                  type="search"
                  placeholder="Search skills, categories, authors…"
                  aria-label="Search the skill catalog"
                  className="h-11 w-full rounded-lg border border-border bg-card pl-10 pr-4 text-sm shadow-sm placeholder:text-muted-foreground focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/15"
                />
              </div>
              <button
                type="submit"
                className="inline-flex h-11 items-center gap-2 rounded-lg bg-accent px-5 text-sm font-medium text-accent-foreground transition hover:brightness-110"
              >
                Search
              </button>
            </form>

            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground">
              <span className="text-muted-foreground">Popular:</span>
              {["tdd", "security", "frontend", "research"].map((term) => (
                <Link key={term} href={`/explore?q=${term}`} className="transition-colors hover:text-foreground">
                  {term}
                </Link>
              ))}
              <span className="text-border">·</span>
              <Link href="/sources" className="inline-flex items-center gap-1 transition-colors hover:text-foreground">
                <GitBranch className="size-3" /> verified sources
              </Link>
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/explore" size="lg">
                Explore the catalog <ArrowRight className="size-4" />
              </ButtonLink>
              <ButtonLink href="/my-agents" size="lg" variant="outline">
                <Terminal className="size-4" /> Connect your agents
              </ButtonLink>
            </div>
          </div>

          <div className="relative lg:pl-4">
            <div className="absolute -inset-4 rounded-2xl bg-gradient-to-b from-accent/10 to-transparent blur-2xl" aria-hidden />
            <div className="relative overflow-hidden rounded-xl border border-border bg-card shadow-[0_30px_80px_-40px_rgba(0,0,0,0.8)]">
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-danger/60" />
                  <span className="size-2 rounded-full bg-warning/60" />
                  <span className="size-2 rounded-full bg-success/60" />
                </div>
                <span className="font-mono text-[10px] text-muted-foreground">skills-hub · sync</span>
                <span className="inline-flex items-center gap-1 rounded-full border border-success/25 bg-success/10 px-1.5 py-0.5 text-[9px] text-success">
                  <span className="size-1 rounded-full bg-success" /> live
                </span>
              </div>
              <div className="p-4">
                {featuredSkills[0] ? (
                  <div className="flex items-center gap-3">
                    <SkillGlyph slug={featuredSkills[0].slug} category={featuredSkills[0].category?.slug} size="lg" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold">{featuredSkills[0].name}</p>
                        <TrustBadge level={featuredSkills[0].trustLevel} />
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {featuredSkills[0].source?.name} · {featuredSkills[0].license ?? "source only"}
                      </p>
                      <div className="mt-1.5 flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
                        <span className="rounded border border-border px-1 py-0.5">
                          v{featuredSkills[0].currentVersion?.versionLabel ?? "—"}
                        </span>
                        <span>{featuredSkills[0].currentVersion?.scannerVersion ? "scanned" : "pending"}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="grid size-14 place-items-center rounded-xl border border-border bg-muted">
                      <Boxes className="size-6 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Catalog is waiting for its first sync</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">Run the seed to import verifiable sources.</p>
                    </div>
                  </div>
                )}

                <div className="mt-4 rounded-lg border border-border bg-background p-3 font-mono text-[10px] leading-relaxed">
                  <p className="text-muted-foreground">
                    <span className="text-success">$</span> skills-hub detect
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    ✓ claude-code <span className="text-muted-foreground">v2.x</span>
                  </p>
                  <p className="text-muted-foreground">
                    ✓ codex <span className="text-muted-foreground">detected</span>
                  </p>
                  <p className="text-muted-foreground">
                    ✓ opencode <span className="text-muted-foreground">detected</span>
                  </p>
                  <p className="mt-1.5 text-success">
                    $ skills-hub install {featuredSkills[0]?.slug ?? "tdd-workflow"} --all
                  </p>
                  <p className="text-muted-foreground">→ checksum verified · backup created</p>
                  <p className="text-success">✓ installed in 2 compatible agents</p>
                </div>

                <div className="mt-3 flex items-center justify-between rounded-lg border border-accent/20 bg-accent-soft/40 px-3 py-2">
                  <div className="flex items-center gap-2 text-[11px]">
                    <RefreshCw className="size-3.5 text-accent" />
                    <span>
                      New version detected{" "}
                      <span className="font-mono text-muted-foreground">
                        {recentVersions[0]?.versionLabel ?? "—"}
                      </span>
                    </span>
                  </div>
                  <Link href="/updates" className="text-[10px] font-medium text-accent hover:underline">
                    Review
                  </Link>
                </div>
              </div>
            </div>
            <div className="relative mt-3 grid grid-cols-3 gap-2">
              {[
                { icon: ShieldCheck, label: "Static scan" },
                { icon: BadgeCheck, label: "Source pinned" },
                { icon: Download, label: "Checksum" },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-card/60 px-2 py-2 text-[10px] text-muted-foreground">
                  <item.icon className="size-3 text-accent" /> {item.label}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="container-page relative grid grid-cols-2 gap-px overflow-hidden rounded-t-xl border border-b-0 border-border bg-border sm:grid-cols-4">
          {[
            { label: "Published skills", value: stats.skills },
            { label: "Monitored sources", value: stats.sources },
            { label: "Version snapshots", value: stats.versions },
            { label: "Host compatibility rows", value: stats.hostCompatibility },
          ].map((item) => (
            <div key={item.label} className="bg-background/80 px-5 py-4">
              <div className="text-2xl font-semibold tracking-tight tabular-nums">{formatNumber(item.value)}</div>
              <div className="mt-0.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{item.label}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="container-page py-14">
        {!hasCatalog ? (
          <EmptyState
            icon={<Sparkles className="size-8" />}
            title="The catalog is empty"
            description="Sources are registered but no skills have been imported yet. Seed the database or run a sync from the admin panel to import verifiable skills."
            action={
              <div className="flex gap-2">
                <ButtonLink href="/admin">Open admin</ButtonLink>
                <ButtonLink href="/sources" variant="outline">
                  View sources
                </ButtonLink>
              </div>
            }
          />
        ) : (
          <>
            <SectionHeading
              eyebrow="Featured"
              title="Skills worth installing"
              description="Curated by quality signals, not by install counters."
              action={
                <ButtonLink href="/explore" variant="ghost" size="sm">
                  View all <ArrowRight className="size-3.5" />
                </ButtonLink>
              }
            />
            <div className="grid gap-3 md:grid-cols-3">
              {featuredSkills.map((skill) => (
                <SkillCard key={skill.id} skill={toSkillCard(skill)} />
              ))}
            </div>

            <div className="mt-14 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div>
                <SectionHeading
                  eyebrow="Trending"
                  title="Most starred in the ecosystem"
                  description="Popularity is a source signal. Scan results and trust are shown separately."
                  action={
                    <ButtonLink href="/explore?sort=popular" variant="ghost" size="sm">
                      Explore <ArrowRight className="size-3.5" />
                    </ButtonLink>
                  }
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  {trending.map((skill) => (
                    <SkillCard key={skill.id} skill={toSkillCard(skill)} />
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Latest updates</h2>
                  <Link href="/updates" className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                    All updates <ArrowUpRight className="size-3" />
                  </Link>
                </div>
                <div className="mt-4 space-y-1">
                  {recentVersions.length ? (
                    recentVersions.map((version) => (
                      <Link
                        key={version.id}
                        href={`/skills/${version.skill.slug}`}
                        className="group flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted"
                      >
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent/70" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium group-hover:text-accent">{version.skill.name}</p>
                          <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                            {version.versionLabel} · {formatRelative(version.publishedAt)}
                          </p>
                        </div>
                        <span className="shrink-0 rounded border border-border px-1 py-0.5 text-[9px] text-muted-foreground">
                          {version.fileCount} files
                        </span>
                      </Link>
                    ))
                  ) : (
                    <p className="py-6 text-center text-xs text-muted-foreground">No published versions yet.</p>
                  )}
                </div>

                <div className="mt-5 border-t border-border pt-4">
                  <div className="flex items-center gap-2 text-[11px] font-medium">
                    <Zap className="size-3.5 text-accent" /> Never hunt for versions again
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                    The sync worker compares tree SHAs and file hashes, creates immutable versions, and notifies you when
                    a saved skill changes.
                  </p>
                  <Link href="/updates" className="mt-2 inline-flex items-center gap-1 text-[11px] text-accent hover:underline">
                    See the update feed <ArrowRight className="size-3" />
                  </Link>
                </div>
              </div>
            </div>

            <div className="mt-14">
              <SectionHeading
                eyebrow="Browse"
                title="By category"
                action={
                  <ButtonLink href="/categories" variant="ghost" size="sm">
                    All categories <ArrowRight className="size-3.5" />
                  </ButtonLink>
                }
              />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {categories.map((category) => (
                  <Link
                    key={category.id}
                    href={`/explore?category=${category.slug}`}
                    className="group rounded-lg border border-border bg-card p-3 transition-all hover:-translate-y-0.5 hover:border-accent/30"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium group-hover:text-accent">{category.name}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">{category._count.skills}</span>
                    </div>
                    <p className="mt-1 line-clamp-1 text-[10px] text-muted-foreground">{category.description}</p>
                  </Link>
                ))}
              </div>
            </div>

            <div className="mt-14">
              <SectionHeading
                eyebrow="Fresh"
                title="Recently updated"
                description="New snapshots imported from their original repositories."
              />
              <div className="grid gap-3 md:grid-cols-3">
                {updated.map((skill) => (
                  <SkillCard key={skill.id} skill={toSkillCard(skill)} />
                ))}
              </div>
            </div>

            <section className="mt-16 overflow-hidden rounded-2xl border border-border bg-card">
              <div className="grid gap-8 p-8 lg:grid-cols-2 lg:p-10">
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">How it works</div>
                  <h2 className="mt-3 text-2xl font-semibold tracking-tight">Knowledge that stays current.</h2>
                  <p className="mt-2 max-w-md text-sm text-muted-foreground">
                    Skills are not snapshots copied once. Each source is monitored, each change becomes a version, and
                    your installed skills can be updated with a rollback point.
                  </p>
                  <div className="mt-6 space-y-4">
                    {[
                      { step: "01", title: "Monitor", text: "GitHub trees, commits and RSS feeds on a schedule." },
                      { step: "02", title: "Verify", text: "Static scans, path checks, license and host-format validation." },
                      { step: "03", title: "Install", text: "Local companion writes only to allowlisted skill directories." },
                    ].map((item) => (
                      <div key={item.step} className="flex gap-3">
                        <span className="font-mono text-[10px] text-accent">{item.step}</span>
                        <div>
                          <p className="text-xs font-medium">{item.title}</p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">{item.text}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-background p-5 font-mono text-[11px] leading-relaxed">
                  <p className="text-muted-foreground"># a skill changed upstream</p>
                  <p className="mt-2">
                    <span className="text-accent">sync</span> anthropics/skills
                  </p>
                  <p className="text-muted-foreground">→ tree sha unchanged? no</p>
                  <p className="text-muted-foreground">→ 2 file(s) changed</p>
                  <p className="text-muted-foreground">→ scan: 0 high · integrity ok</p>
                  <p className="text-success">→ version 2026.11.09-a31f9c2 published</p>
                  <p className="mt-3 text-muted-foreground"># your companion</p>
                  <p className="mt-2">
                    <span className="text-accent">skills-hub</span> updates
                  </p>
                  <p className="text-muted-foreground">claude-code · tdd-workflow · 1.2.0 → 1.3.0</p>
                  <p className="mt-1 flex items-center gap-1 text-success">
                    <Check className="size-3" /> backup before replace
                  </p>
                  <p className="flex items-center gap-1 text-success">
                    <Check className="size-3" /> rollback available
                  </p>
                </div>
              </div>
            </section>

            <section className="mt-14 flex flex-col items-center justify-between gap-4 rounded-xl border border-accent/20 bg-accent-soft/30 p-6 sm:flex-row">
              <div>
                <h2 className="text-sm font-semibold">Ready to give your agents a memory of good practice?</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Browse the catalog, connect the companion, and keep every skill current.
                </p>
              </div>
              <div className="flex gap-2">
                <ButtonLink href="/explore" size="sm">
                  Explore skills
                </ButtonLink>
                <ButtonLink href="/my-agents" size="sm" variant="outline">
                  My agents
                </ButtonLink>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
