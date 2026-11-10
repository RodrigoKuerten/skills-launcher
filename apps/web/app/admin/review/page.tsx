import Link from "next/link";
import { ArrowUpRight, CircleAlert, FileWarning, ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { formatRelative } from "@/lib/utils";
import { AdminActionButton } from "@/components/admin-controls";
import { Card, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

function findingCount(raw: string): number {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

export default async function AdminReviewPage() {
  const [skills, versions] = await Promise.all([
    db.skill.findMany({
      where: { status: "QUARANTINED" },
      include: {
        source: { select: { name: true, trustTier: true } },
        versions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            versionLabel: true,
            securityScore: true,
            riskLevel: true,
            scanFindings: true,
            fileCount: true,
            createdAt: true,
            commitSha: true,
            incomplete: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.skillVersion.findMany({
      where: {
        status: "QUARANTINED",
        skill: { status: { notIn: ["QUARANTINED", "REJECTED"] } },
      },
      select: {
        id: true,
        versionLabel: true,
        securityScore: true,
        riskLevel: true,
        scanFindings: true,
        fileCount: true,
        createdAt: true,
        commitSha: true,
        incomplete: true,
        skill: { select: { id: true, slug: true, name: true, status: true, trustLevel: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return (
    <div>
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">Admin / Review</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Review queue</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          New community skills and any version with high-risk findings are quarantined. Approval publishes that exact
          version; it does not bypass later scans. Rejection is recorded and cannot be downloaded.
        </p>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-lg border border-warning/25 bg-warning/5 p-3 text-[11px] text-warning">
        <CircleAlert className="mt-0.5 size-4 shrink-0" />
        <p>
          A scan score is heuristic. Review the source repository and the SKILL.md before approving. Approval is an admin
          decision, not a safety certification.
        </p>
      </div>

      <section className="mt-8">
        <div className="mb-3 flex items-center gap-2">
          <FileWarning className="size-4 text-warning" />
          <h2 className="text-sm font-semibold">New skills awaiting publication</h2>
          <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">{skills.length}</span>
        </div>
        {skills.length ? (
          <div className="space-y-2">
            {skills.map((skill) => {
              const latest = skill.versions[0];
              return (
                <Card key={skill.id} className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/skills/${skill.slug}`} className="text-sm font-medium hover:text-accent">
                          {skill.name}
                        </Link>
                        <span className="rounded-full border border-border bg-muted px-1.5 py-0.5 text-[9px]">{skill.source.trustTier}</span>
                        {latest ? (
                          <span className="rounded-full border border-danger/25 bg-danger/10 px-1.5 py-0.5 text-[9px] text-danger">
                            scan {latest.securityScore} · {latest.riskLevel}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{skill.summary}</p>
                      <p className="mt-1 font-mono text-[9px] text-muted-foreground">
                        {skill.source.name} · {skill.sourcePath} ·{" "}
                        {latest ? `${latest.versionLabel} · ${latest.fileCount} files · ${findingCount(latest.scanFindings)} findings` : "no version"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1">
                      {latest?.incomplete ? (
                        <span className="rounded-lg border border-warning/25 bg-warning/5 px-2 py-1 text-[10px] text-warning">
                          Incomplete snapshot · re-sync before approval
                        </span>
                      ) : latest ? (
                        <AdminActionButton
                          endpoint={`/api/admin/skills/${skill.id}`}
                          label="Approve & publish"
                          icon={<ShieldCheck className="size-3" />}
                          variant="primary"
                          confirmText={`Publish ${skill.name} at ${latest.versionLabel}? It will become publicly downloadable.`}
                        />
                      ) : null}
                      <AdminActionButton
                        endpoint={`/api/admin/skills/${skill.id}`}
                        method="DELETE"
                        label="Reject"
                        variant="danger"
                        confirmText="Reject this skill? Its quarantined versions will be marked rejected."
                      />
                    </div>
                  </div>
                  <a
                    href={skill.sourceUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-3 inline-flex items-center gap-1 break-all font-mono text-[9px] text-muted-foreground hover:text-accent"
                  >
                    {skill.sourceUrl} <ArrowUpRight className="size-2.5 shrink-0" />
                  </a>
                </Card>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={<ShieldCheck className="size-6" />}
            title="No skills in quarantine"
            description="New community imports and high-risk versions will appear here."
          />
        )}
      </section>

      <section className="mt-10">
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck className="size-4 text-warning" />
          <h2 className="text-sm font-semibold">Blocked updates for published skills</h2>
          <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">{versions.length}</span>
        </div>
        {versions.length ? (
          <div className="space-y-2">
            {versions.map((version) => (
              <Card key={version.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/skills/${version.skill.slug}`} className="text-xs font-medium hover:text-accent">
                      {version.skill.name}
                    </Link>
                    <span className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[9px]">
                      {version.versionLabel}
                    </span>
                    <span className="text-[9px] text-danger">scan {version.securityScore} · {version.riskLevel}</span>
                  </div>
                  <p className="mt-1 font-mono text-[9px] text-muted-foreground">
                    {version.fileCount} files · {findingCount(version.scanFindings)} findings · imported {formatRelative(version.createdAt)}
                    {version.commitSha ? ` · ${version.commitSha.slice(0, 7)}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {version.incomplete ? (
                    <span className="text-[10px] text-warning">Incomplete snapshot · re-sync</span>
                  ) : (
                    <AdminActionButton
                      endpoint={`/api/admin/versions/${version.id}`}
                      label="Publish update"
                      variant="primary"
                      confirmText={`Publish ${version.versionLabel}? The previous version remains in history and can be restored.`}
                    />
                  )}
                  <AdminActionButton
                    endpoint={`/api/admin/versions/${version.id}`}
                    method="DELETE"
                    label="Reject"
                    variant="danger"
                    confirmText="Reject this version? The currently published version stays live."
                  />
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<ShieldCheck className="size-6" />}
            title="No blocked updates"
            description="Updates that pass the publish policy are applied automatically for eligible sources."
          />
        )}
      </section>
    </div>
  );
}
