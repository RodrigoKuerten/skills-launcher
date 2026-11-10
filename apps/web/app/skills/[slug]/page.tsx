import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  CalendarClock,
  Check,
  Download,
  ExternalLink,
  FileCode2,
  GitBranch,
  GitFork,
  Layers,
  Package,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Star,
  Users,
} from "lucide-react";
import { HOSTS, isDownloadAllowed } from "@skills-hub/core";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { formatDate, formatNumber, formatRelative, hostLabel } from "@/lib/utils";
import { getSkillBySlug } from "@/lib/catalog";
import { Markdown } from "@/components/markdown";
import { CompatBadge, HostBadge, ScanBadge, TrustBadge } from "@/components/badges";
import { SkillGlyph } from "@/components/skill-glyph";
import { InstallPanel } from "@/components/install-panel";
import { SaveButton } from "@/components/save-button";
import { ReviewForm } from "@/components/review-form";
import { CopyButton, ReportButton } from "@/components/actions";
import { AdminActionButton } from "@/components/admin-controls";
import { ButtonLink, Card, EmptyState } from "@/components/ui";
import { RatingStars } from "@/components/rating-stars";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const skill = await db.skill.findUnique({ where: { slug }, select: { name: true, summary: true } });
  if (!skill) return { title: "Skill not found" };
  return { title: skill.name, description: skill.summary };
}

function parseFindings(value: string): Array<{ severity: string; category: string; message: string; file: string }> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as Array<{ severity: string; category: string; message: string; file: string }>) : [];
  } catch {
    return [];
  }
}

export default async function SkillDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [skill, user] = await Promise.all([getSkillBySlug(slug), getSessionUser()]);

  if (!skill) notFound();
  const isAdmin = user?.role === "ADMIN";
  if (skill.status === "QUARANTINED" && !isAdmin) notFound();
  if (skill.status === "REJECTED" && !isAdmin) notFound();
  if (skill.status === "ARCHIVED" && !skill.currentVersion && !isAdmin) notFound();

  const version = skill.currentVersion;
  const effectiveLicense = version?.license ?? skill.license;
  const findings = version ? parseFindings(version.scanFindings) : [];
  const highFindings = findings.filter((finding) => finding.severity === "HIGH" || finding.severity === "CRITICAL");
  const saved = user
    ? Boolean(await db.libraryItem.findUnique({ where: { userId_skillId: { userId: user.id, skillId: skill.id } } }))
    : false;
  const canDownload = Boolean(version && isDownloadAllowed(effectiveLicense));
  const hostInfo = Object.fromEntries(
    HOSTS.map((host) => [
      host.id,
      {
        name: host.name,
        docsUrl: host.docsUrl,
        userPath: host.skillsPaths.win32[0]?.replace(/\\/g, "/") ?? `~/.${host.id}/skills`,
        projectPath: host.projectSkillsPath,
      },
    ]),
  );

  const verifiedHosts = skill.hosts.filter((host) => host.status === "VERIFIED");

  return (
    <div className="container-page py-8">
      <Link href="/explore" className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3" /> Back to catalog
      </Link>

      {skill.status !== "ACTIVE" ? (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-danger/25 bg-danger/5 p-3 text-xs text-danger">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">Admin preview · status {skill.status.toLowerCase()}</p>
            <p className="mt-0.5 text-danger/80">
              This skill is not publicly installable. Quarantined versions cannot be downloaded.
            </p>
          </div>
        </div>
      ) : null}

      <div className="mt-5 grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <header className="border-b border-border pb-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <SkillGlyph slug={skill.slug} category={skill.category?.slug} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{skill.name}</h1>
                  <TrustBadge level={skill.trustLevel} />
                  {version ? <ScanBadge score={version.securityScore} riskLevel={version.riskLevel} findings={findings.length} scannerVersion={version.scannerVersion} /> : null}
                </div>
                <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">{skill.summary}</p>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <GitFork className="size-3.5" /> {skill.author}
                  </span>
                  {skill.category ? (
                    <Link href={`/explore?category=${skill.category.slug}`} className="inline-flex items-center gap-1.5 hover:text-foreground">
                      <Layers className="size-3.5" /> {skill.category.name}
                    </Link>
                  ) : null}
                  <a href={skill.repositoryUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 hover:text-foreground">
                    <GitBranch className="size-3.5" /> Source repository <ExternalLink className="size-2.5" />
                  </a>
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarClock className="size-3.5" /> Updated {formatRelative(version?.publishedAt)}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Metric icon={<Star className="size-3.5" />} label="Source stars" value={formatNumber(skill.stars)} />
              <Metric icon={<Download className="size-3.5" />} label="Reported installs" value={formatNumber(skill.installCount)} hint="self-reported" />
              <Metric icon={<BadgeCheck className="size-3.5" />} label="Quality" value={`${skill.qualityScore}/100`} />
              <Metric icon={<Package className="size-3.5" />} label="Version" value={version?.versionLabel ?? "—"} />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <ButtonLink href="#install" size="sm" className="lg:hidden">
                <Download className="size-3.5" /> Install
              </ButtonLink>
              <SaveButton skillId={skill.id} initialSaved={saved} isAuthed={Boolean(user)} />
              <ReportButton skillId={skill.id} isAuthed={Boolean(user)} />
              <a
                href={skill.repositoryUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <GitFork className="size-3.5" /> View on GitHub <ArrowUpRight className="size-3" />
              </a>
            </div>
          </header>

          <section className="mt-8">
            <h2 className="text-sm font-semibold">About this skill</h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {skill.description || skill.summary}
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <Fact label="License" value={effectiveLicense ?? "Not specified"} mono />
              <Fact label="Source" value={skill.source.name} />
              <Fact label="Path" value={skill.sourcePath} mono />
            </div>
          </section>

          <section className="mt-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Instructions</h2>
              <span className="font-mono text-[10px] text-muted-foreground">SKILL.md · untrusted content, rendered safely</span>
            </div>
            <Card className="p-5">
              {version?.readme ? (
                <Markdown>{version.readme}</Markdown>
              ) : (
                <p className="text-sm text-muted-foreground">No README body was imported for this version.</p>
              )}
            </Card>
          </section>

          <section className="mt-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Compatibility</h2>
              <span className="text-[10px] text-muted-foreground">Format validation only; local detection decides auto-install.</span>
            </div>
            <Card className="divide-y divide-border">
              {skill.hosts.length ? (
                skill.hosts.map((host) => (
                  <div key={host.id} className="flex items-start gap-3 p-3.5">
                    <HostBadge host={host.host} className="mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium">{hostLabel(host.host)}</span>
                        <CompatBadge status={host.status} />
                      </div>
                      {host.notes ? <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{host.notes}</p> : null}
                    </div>
                    <a
                      href={HOSTS.find((item) => item.id === host.host)?.docsUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-0.5 text-muted-foreground hover:text-foreground"
                      aria-label={`${hostLabel(host.host)} documentation`}
                    >
                      <ExternalLink className="size-3.5" />
                    </a>
                  </div>
                ))
              ) : (
                <p className="p-4 text-xs text-muted-foreground">No host validation has been recorded for this skill.</p>
              )}
            </Card>
            {verifiedHosts.length ? (
              <p className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Check className="size-3 text-success" /> {verifiedHosts.length} host format{verifiedHosts.length > 1 ? "s" : ""} validated.
                Auto-install requires the companion to detect the host on your machine.
              </p>
            ) : null}
          </section>

          <section className="mt-8">
            <h2 className="text-sm font-semibold">Security scan</h2>
            <Card className={`mt-3 p-4 ${highFindings.length ? "border-danger/25" : ""}`}>
              <div className="flex items-start gap-3">
                <div className={`grid size-9 place-items-center rounded-lg ${highFindings.length ? "bg-danger/10 text-danger" : "bg-success/10 text-success"}`}>
                  {highFindings.length ? <AlertTriangle className="size-4" /> : <ShieldCheck className="size-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-medium">
                      {version ? `Static scan ${version.securityScore}/100` : "Not scanned"}
                    </p>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      scanner v{version?.scannerVersion ?? "—"} · {formatDate(version?.fetchedAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    Automated heuristics over the imported file set: shell patterns, prompt-injection phrases, credential
                    material, obfuscation and unsafe paths. This is not a security guarantee and does not execute the skill.
                  </p>
                  {findings.length ? (
                    <ul className="mt-3 space-y-1.5">
                      {findings.slice(0, 6).map((finding, index) => (
                        <li key={`${finding.file}-${index}`} className="flex items-start gap-2 text-[11px]">
                          <span className={`mt-1 size-1.5 shrink-0 rounded-full ${finding.severity === "HIGH" || finding.severity === "CRITICAL" ? "bg-danger" : "bg-warning"}`} />
                          <span className="text-muted-foreground">
                            <span className="font-mono text-[9px] uppercase text-foreground/70">{finding.severity}</span>{" "}
                            {finding.message} <span className="font-mono text-[9px]">({finding.file})</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-[11px] text-success">No findings from the current scanner rules.</p>
                  )}
                  {findings.length > 6 ? (
                    <p className="mt-2 text-[10px] text-muted-foreground">+{findings.length - 6} more findings recorded in the admin view.</p>
                  ) : null}
                </div>
              </div>
            </Card>
          </section>

          <section className="mt-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Version history</h2>
              <span className="font-mono text-[10px] text-muted-foreground">{skill.versions.length} published</span>
            </div>
            <Card className="divide-y divide-border">
              {skill.versions.length ? (
                skill.versions.map((item) => (
                  <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 p-3.5">
                    <div className="flex items-center gap-2.5">
                      <span className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">{item.versionLabel}</span>
                      <span className="text-[11px] text-muted-foreground">{formatDate(item.publishedAt)}</span>
                      {item.id === version?.id ? (
                        <span className="rounded-full bg-success/10 px-1.5 py-0.5 text-[9px] text-success">current</span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-3 font-mono text-[9px] text-muted-foreground">
                      {item.commitSha ? <span>{item.commitSha.slice(0, 7)}</span> : null}
                      <span>{item.fileCount} files</span>
                      <span>{item.contentHash.slice(0, 8)}</span>
                      {isAdmin && item.id !== version?.id ? (
                        <AdminActionButton
                          endpoint={`/api/admin/versions/${item.id}`}
                          label="Restore"
                          icon={<RotateCcw className="size-3" />}
                          confirmText={`Restore ${item.versionLabel} as the current version? The current version stays in history.`}
                        />
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <p className="p-4 text-xs text-muted-foreground">No published versions.</p>
              )}
            </Card>
            <p className="mt-2 text-[10px] text-muted-foreground">
              Versions are immutable. The current pointer can be rolled back without deleting history.
            </p>
          </section>

          <section className="mt-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Reviews</h2>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <RatingStars value={skill.ratingAvg} />
                <span>
                  {skill.ratingAvg.toFixed(1)} · {skill.ratingCount} review{skill.ratingCount === 1 ? "" : "s"}
                </span>
              </div>
            </div>
            <div className="space-y-3">
              <ReviewForm skillId={skill.id} isAuthed={Boolean(user)} />
              {skill.reviews.length ? (
                skill.reviews.map((review) => (
                  <Card key={review.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">{review.user.name}</span>
                      <RatingStars value={review.rating} />
                    </div>
                    {review.body ? <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{review.body}</p> : null}
                    <p className="mt-2 font-mono text-[9px] text-muted-foreground">{formatRelative(review.createdAt)}</p>
                  </Card>
                ))
              ) : (
                <p className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
                  No reviews yet. Ratings are community input, not a security signal.
                </p>
              )}
            </div>
          </section>

          <section className="mt-8">
            <h2 className="text-sm font-semibold">Provenance</h2>
            <Card className="mt-3 grid gap-3 p-4 sm:grid-cols-2">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Imported from</p>
                <a href={skill.sourceUrl} target="_blank" rel="noreferrer noopener" className="mt-1 inline-flex break-all text-[11px] text-accent hover:underline">
                  {skill.sourceUrl} <ExternalLink className="ml-1 size-3 shrink-0" />
                </a>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Content hash</p>
                <div className="mt-1 flex items-center gap-1.5">
                  <code className="break-all font-mono text-[10px] text-muted-foreground">{version?.contentHash ?? "—"}</code>
                  {version ? <CopyButton value={version.contentHash} label="Copy" /> : null}
                </div>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Commit</p>
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">{version?.commitSha ?? "—"}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Last checked</p>
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">{formatDate(skill.lastSyncedAt)}</p>
              </div>
            </Card>
          </section>
        </div>

        <aside id="install" className="min-w-0 scroll-mt-20">
          <div className="space-y-3 lg:sticky lg:top-20">
            <InstallPanel
              slug={skill.slug}
              name={skill.name}
              license={effectiveLicense}
              canDownload={canDownload}
              sourceUrl={skill.sourceUrl}
              repositoryUrl={skill.repositoryUrl}
              compatibility={skill.hosts.map((host) => ({ host: host.host, status: host.status, notes: host.notes }))}
              currentVersion={
                version
                  ? {
                      versionLabel: version.versionLabel,
                      fileCount: version.fileCount,
                      totalBytes: version.totalBytes,
                      publishedAt: version.publishedAt,
                    }
                  : null
              }
              hosts={hostInfo}
              isAuthed={Boolean(user)}
            />
            <Card className="hidden p-4 lg:block">
              <div className="flex items-center gap-2 text-[11px] font-medium">
                <Users className="size-3.5 text-accent" /> Keep it current
              </div>
              <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
                Save this skill to follow new versions. The companion can update installed copies and keeps a rollback
                backup.
              </p>
              <Link href="/updates" className="mt-2 inline-flex items-center gap-1 text-[10px] text-accent hover:underline">
                View the update feed <ArrowUpRight className="size-3" />
              </Link>
            </Card>
          </div>
        </aside>
      </div>

      {!skill.reviews.length && !skill.versions.length ? (
        <div className="mt-8">
          <EmptyState
            title="This skill is still being prepared"
            description="A published version is required before installs and downloads are enabled."
          />
        </div>
      ) : null}
    </div>
  );
}

function Metric({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card/60 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-sm font-semibold tabular-nums">{value}</span>
        {hint ? <span className="text-[8px] text-muted-foreground">{hint}</span> : null}
      </div>
    </div>
  );
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card/50 p-3">
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 break-all text-[11px] ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}
