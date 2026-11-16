import type { CSSProperties } from "react";
import { ArrowUpRight, Check, Plus, ShieldCheck, Star } from "lucide-react";
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
  index?: number;
  queued?: boolean;
  onToggleQueue?: () => void;
  queueBlockedReason?: string | null;
}

function securityTone(score: number): string {
  if (score >= 80) return "text-ok";
  if (score >= 55) return "text-warn";
  return "text-danger";
}

export function SkillCard({
  skill,
  categoryLabel,
  onOpen,
  index = 0,
  queued = false,
  onToggleQueue,
  queueBlockedReason = null,
}: SkillCardProps) {
  const KindIcon = sourceKindIcon(skill.sourceKind);
  const quarantined =
    skill.status === "QUARANTINED" || skill.latestVersion?.status === "QUARANTINED";
  const risky = skill.riskLevel === "HIGH" || skill.riskLevel === "CRITICAL";

  return (
    <article
      className={cx(
        "interactive-lift animate-card-in group relative h-full overflow-hidden rounded-[13px] border bg-surface/55 hover:bg-surface/85 focus-within:bg-surface/85",
        quarantined
          ? "border-danger/30 hover:border-danger/50"
          : "border-line hover:border-brand/40",
      )}
      style={{ "--stagger": index } as CSSProperties}
    >
      <button
        type="button"
        onClick={() => onOpen(skill.id)}
        aria-label={`Open ${skill.name}`}
        className="absolute inset-0 z-0 cursor-pointer rounded-[13px]"
      />
      <div className="pointer-events-none relative z-[1] flex h-full flex-col p-4">
        <div className="flex items-center gap-2 text-[11px] text-muted">
          <KindIcon className="size-3 shrink-0 text-muted-soft" aria-hidden="true" />
          <span className="truncate">{skill.sourceName}</span>
          <span className="ml-auto flex shrink-0 items-center gap-1">
            {skill.archived ? <Badge tone="warn">Archived</Badge> : null}
            {quarantined ? <Badge tone="danger">Quarantined</Badge> : null}
            {risky && !quarantined ? <RiskBadge risk={skill.riskLevel} /> : null}
          </span>
        </div>

        <div className="mt-3 flex items-start justify-between gap-3">
          <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-[-0.015em] text-text">
            {skill.name}
          </h3>
          {skill.stars > 0 ? (
            <span
              className="flex shrink-0 items-center gap-1 pt-0.5 text-[11px] tabular-nums text-muted"
              title={`${skill.stars.toLocaleString()} stars on the source repository`}
            >
              <Star className="size-3 text-warn" fill="currentColor" aria-hidden="true" />
              {formatCompact(skill.stars)}
            </span>
          ) : null}
        </div>

        <p className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-muted">
          {skill.summary || "No summary was provided for this skill."}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {categoryLabel ? <Badge tone="outline">{categoryLabel}</Badge> : null}
          {skill.trust !== "COMMUNITY" ? <TrustBadge trust={skill.trust} /> : null}
          {skill.installCount > 0 ? <Badge tone="ok">Installed</Badge> : null}
          {!skill.latestVersion ? <Badge tone="warn">No version</Badge> : null}
          {queued ? <Badge tone="brand">In queue</Badge> : null}
        </div>

        <div className="mt-auto flex items-center justify-between gap-3 border-t border-line/70 pt-3.5">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="truncate text-[11px] text-muted-soft"
              title="Agent Skills format is supported by these host definitions"
            >
              {skill.hosts.length > 0
                ? `${skill.hosts.length} ${skill.hosts.length === 1 ? "agent" : "agents"}`
                : "Hosts not scanned"}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            {skill.securityScore < 100 ? (
              <span
                className={cx(
                  "flex items-center gap-1 text-[11px] tabular-nums",
                  securityTone(skill.securityScore),
                )}
                title={`Security score ${skill.securityScore}/100`}
              >
                <ShieldCheck className="size-3" aria-hidden="true" />
                {skill.securityScore}
              </span>
            ) : null}
            {onToggleQueue ? (
              <button
                type="button"
                onClick={onToggleQueue}
                disabled={Boolean(queueBlockedReason)}
                aria-pressed={queued}
                aria-label={
                  queued
                    ? `Remove ${skill.name} from the install queue`
                    : `Add ${skill.name} to the install queue`
                }
                title={
                  queueBlockedReason ??
                  (queued ? "Remove from the install queue" : "Add to the install queue")
                }
                className={cx(
                  "pointer-events-auto grid size-6 place-items-center rounded-md border transition-colors disabled:opacity-45",
                  queued
                    ? "border-brand/40 bg-brand/10 text-brand-soft"
                    : "border-line bg-elevated/60 text-muted hover:border-brand/35 hover:text-text",
                )}
              >
                {queued ? (
                  <Check className="size-3.5" aria-hidden="true" />
                ) : (
                  <Plus className="size-3.5" aria-hidden="true" />
                )}
              </button>
            ) : null}
            <ArrowUpRight
              className="size-3.5 text-muted-soft transition-colors group-hover:text-brand-soft"
              aria-hidden="true"
            />
          </div>
        </div>
      </div>
    </article>
  );
}
