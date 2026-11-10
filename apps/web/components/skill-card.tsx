import Link from "next/link";
import { ArrowUpRight, Download, GitFork, Package, Star } from "lucide-react";
import type { HostId } from "@skills-hub/core";
import { cn, formatNumber, formatRelative } from "@/lib/utils";
import { HostBadge, ScanBadge, TrustBadge } from "@/components/badges";
import { SkillGlyph } from "@/components/skill-glyph";

export type SkillCardData = {
  slug: string;
  name: string;
  summary: string;
  author: string;
  stars: number;
  installCount: number;
  qualityScore: number;
  securityScore: number;
  riskLevel: string;
  trustLevel: string;
  license: string | null;
  priceCents: number;
  featured?: boolean;
  repositoryUrl: string;
  category?: { name: string; slug: string; icon?: string } | null;
  source?: { name: string; trustTier: string } | null;
  hosts?: Array<{ host: string; status: string }>;
  currentVersion?: { versionLabel: string; publishedAt: Date | null; scannerVersion?: string | null } | null;
};

export function SkillCard({ skill, className }: { skill: SkillCardData; className?: string }) {
  const verifiedHosts = (skill.hosts ?? []).filter((host) => host.status === "VERIFIED").slice(0, 4);
  return (
    <Link
      href={`/skills/${skill.slug}`}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card p-4 transition-all duration-200",
        "hover:-translate-y-0.5 hover:border-muted-foreground/25 hover:shadow-[0_12px_40px_-20px_rgba(0,0,0,0.6)]",
        className,
      )}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent opacity-0 transition-opacity group-hover:opacity-100"
        aria-hidden
      />
      <div className="flex items-start gap-3">
        <SkillGlyph slug={skill.slug} category={skill.category?.slug} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-sm font-semibold tracking-tight group-hover:text-accent">{skill.name}</h3>
            <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-accent" />
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="truncate">{skill.author}</span>
            {skill.category ? (
              <>
                <span className="text-border">/</span>
                <span className="truncate">{skill.category.name}</span>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <p className="mt-3 line-clamp-2 min-h-9 text-xs leading-relaxed text-muted-foreground">{skill.summary}</p>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <TrustBadge level={skill.trustLevel} />
        <ScanBadge score={skill.securityScore} riskLevel={skill.riskLevel} scannerVersion={skill.currentVersion?.scannerVersion} />
        {skill.license ? (
          <span className="rounded-full border border-border bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
            {skill.license}
          </span>
        ) : (
          <span
            title="No permissive license detected. Files stay at the original source."
            className="rounded-full border border-warning/20 bg-warning/5 px-2 py-0.5 font-mono text-[10px] text-warning"
          >
            source only
          </span>
        )}
        {skill.priceCents > 0 ? (
          <span className="rounded-full border border-accent/30 bg-accent-soft px-2 py-0.5 text-[10px] text-accent">
            Paid · soon
          </span>
        ) : null}
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 pt-4">
        <div className="flex min-w-0 items-center gap-3 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1" title="GitHub stars from the source repository">
            <Star className="size-3" /> {formatNumber(skill.stars)}
          </span>
          <span className="inline-flex items-center gap-1" title="Self-reported installs by the companion">
            <Download className="size-3" /> {formatNumber(skill.installCount)}
          </span>
          {skill.currentVersion ? (
            <span className="inline-flex items-center gap-1 font-mono" title="Published version">
              <Package className="size-3" /> {skill.currentVersion.versionLabel}
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 -space-x-1">
          {verifiedHosts.map((host) => (
            <HostBadge key={host.host} host={host.host as HostId} className="hidden px-1 py-0 text-[9px] sm:inline-flex" />
          ))}
        </div>
      </div>

      <div className="mt-2.5 flex items-center justify-between border-t border-border/60 pt-2.5 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1 truncate">
          <GitFork className="size-3" /> {skill.source?.name ?? skill.author}
        </span>
        <span>Updated {formatRelative(skill.currentVersion?.publishedAt)}</span>
      </div>
    </Link>
  );
}

export function SkillCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex gap-3">
        <div className="skeleton size-10 rounded-lg" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-3.5 w-2/3 rounded" />
          <div className="skeleton h-2.5 w-1/3 rounded" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <div className="skeleton h-2.5 w-full rounded" />
        <div className="skeleton h-2.5 w-4/5 rounded" />
      </div>
      <div className="mt-4 flex gap-2">
        <div className="skeleton h-4 w-20 rounded-full" />
        <div className="skeleton h-4 w-14 rounded-full" />
      </div>
      <div className="mt-4 flex justify-between">
        <div className="skeleton h-2.5 w-24 rounded" />
        <div className="skeleton h-2.5 w-16 rounded" />
      </div>
    </div>
  );
}
