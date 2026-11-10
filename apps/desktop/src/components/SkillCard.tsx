import { ArrowUpRight, ShieldCheck, Star } from "lucide-react";
import { hostName } from "../lib/constants";
import { cx } from "../lib/cx";
import { formatCompact } from "../lib/format";
import { sourceKindIcon } from "../lib/icons";
import type { SkillSummary } from "../lib/types";
import { RiskBadge } from "./RiskBadge";
import { TrustBadge } from "./TrustBadge";
import { Badge } from "./ui/Badge";

export interface SkillCardProps {
  skill: SkillSummary;
  categoryLabel?: string;
  onOpen: (id: string) => void;
}

function securityTone(score: number): string {
  if (score >= 80) return "text-ok";
  if (score >= 55) return "text-warn";
  return "text-danger";
}

function hostDotClass(status: string): string {
  if (status === "SUPPORTED") return "bg-brand-soft";
  if (status === "LIKELY") return "bg-cyan";
  if (status === "UNSUPPORTED") return "bg-line";
  return "bg-muted/50";
}

export function SkillCard({ skill, categoryLabel, onOpen }: SkillCardProps) {
  const KindIcon = sourceKindIcon(skill.sourceKind);
  const quarantined =
    skill.status === "QUARANTINED" || skill.latestVersion?.status === "QUARANTINED";
  const supported = skill.hosts.filter((host) => host.status === "SUPPORTED").length;

  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={`Open ${skill.name}`}
      onClick={() => onOpen(skill.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(skill.id);
        }
      }}
      className={cx(
        "group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-[13px] border bg-surface/55 p-4 transition-[border-color,background,box-shadow] duration-200 hover:bg-surface/85 focus-visible:bg-surface/85",
        quarantined
          ? "border-danger/30 hover:border-danger/50"
          : "border-line hover:border-brand/40 hover:shadow-[0_18px_50px_-32px_rgba(47,107,255,0.8)]",
      )}
    >
      <div className="flex items-center gap-2 text-[10px] text-muted">
        <KindIcon className="size-3 shrink-0 text-muted/70" aria-hidden="true" />
        <span className="truncate">{skill.sourceName}</span>
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {skill.archived ? <Badge tone="warn">Archived</Badge> : null}
          {quarantined ? <Badge tone="danger">Quarantined</Badge> : null}
          <RiskBadge risk={skill.riskLevel} />
        </span>
      </div>

      <div className="mt-3 flex items-start justify-between gap-3">
        <h3 className="line-clamp-2 text-[14px] font-semibold leading-snug tracking-[-0.015em] text-text">
          {skill.name}
        </h3>
        {skill.stars > 0 ? (
          <span
            className="flex shrink-0 items-center gap-1 pt-0.5 text-[10px] tabular-nums text-muted"
            title={`${skill.stars.toLocaleString()} stars on the source repository`}
          >
            <Star className="size-3 text-warn" fill="currentColor" aria-hidden="true" />
            {formatCompact(skill.stars)}
          </span>
        ) : null}
      </div>

      <p className="mt-2 line-clamp-3 text-[11.5px] leading-relaxed text-muted">
        {skill.summary || "No summary was provided for this skill."}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {categoryLabel ? <Badge tone="outline">{categoryLabel}</Badge> : null}
        <TrustBadge trust={skill.trust} />
        {skill.license ? <Badge tone="neutral">{skill.license}</Badge> : null}
        {!skill.latestVersion ? <Badge tone="warn">No version</Badge> : null}
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-line/70 pt-3.5">
        <div className="flex min-w-0 items-center gap-2">
          {skill.hosts.length > 0 ? (
            <span
              className="flex items-center gap-[3px]"
              aria-label={`Agent Skills format compatible with ${supported} of ${skill.hosts.length} host definitions`}
            >
              {skill.hosts.map((host) => (
                <span
                  key={host.host}
                  title={`${hostName(host.host)}: ${host.status.toLowerCase()}`}
                  className={cx("size-1.5 rounded-full", hostDotClass(host.status))}
                  aria-hidden="true"
                />
              ))}
            </span>
          ) : (
            <span className="text-[10px] text-muted/60">Hosts not scanned</span>
          )}
          <span className="truncate text-[10px] text-muted/70">
            {skill.hosts.length > 0 ? `${supported}/${skill.hosts.length} hosts` : ""}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {skill.installCount > 0 ? (
            <span className="text-[10px] tabular-nums text-muted">
              {skill.installCount} {skill.installCount === 1 ? "install" : "installs"}
            </span>
          ) : null}
          <span
            className={cx("flex items-center gap-1 text-[10px] tabular-nums", securityTone(skill.securityScore))}
            title={`Security score ${skill.securityScore}/100`}
          >
            <ShieldCheck className="size-3" aria-hidden="true" />
            {skill.securityScore}
          </span>
          <ArrowUpRight
            className="size-3.5 text-muted/50 transition-colors group-hover:text-brand-soft"
            aria-hidden="true"
          />
        </div>
      </div>
    </article>
  );
}
