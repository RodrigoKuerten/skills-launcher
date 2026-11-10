import {
  Archive,
  BadgeCheck,
  CircleAlert,
  Clock3,
  ShieldCheck,
  ShieldQuestion,
  ShieldX,
} from "lucide-react";
import type { HostId, TrustLevel } from "@skills-hub/core";
import { cn, hostLabel } from "@/lib/utils";

const trustMeta: Record<
  TrustLevel,
  { label: string; title: string; icon: typeof BadgeCheck; className: string }
> = {
  OFFICIAL: {
    label: "Official source",
    title: "Published by the source owner. Not a security guarantee.",
    icon: BadgeCheck,
    className: "border-accent/30 bg-accent-soft text-accent",
  },
  VERIFIED_COMMUNITY: {
    label: "Community verified",
    title: "Source reputation and automated checks passed. Not a security guarantee.",
    icon: ShieldCheck,
    className: "border-success/25 bg-success/10 text-success",
  },
  IN_REVIEW: {
    label: "In review",
    title: "Automated checks passed, but the source is not verified by an admin yet.",
    icon: ShieldQuestion,
    className: "border-warning/25 bg-warning/10 text-warning",
  },
  STALE: {
    label: "Stale",
    title: "The source repository has not been updated in over a year.",
    icon: Clock3,
    className: "border-border bg-muted text-muted-foreground",
  },
  ARCHIVED: {
    label: "Archived",
    title: "The source repository is archived or the skill was removed upstream.",
    icon: Archive,
    className: "border-border bg-muted text-muted-foreground",
  },
  UNSAFE: {
    label: "Unsafe signals",
    title: "Automated scan found high-severity patterns. Quarantined pending review.",
    icon: ShieldX,
    className: "border-danger/30 bg-danger/10 text-danger",
  },
};

export function TrustBadge({ level, className }: { level: string; className?: string }) {
  const meta = trustMeta[(level as TrustLevel) in trustMeta ? (level as TrustLevel) : "IN_REVIEW"];
  const Icon = meta.icon;
  return (
    <span
      title={meta.title}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium whitespace-nowrap",
        meta.className,
        className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      {meta.label}
    </span>
  );
}

export function ScanBadge({
  score,
  riskLevel,
  findings,
  scannerVersion,
}: {
  score: number;
  riskLevel: string;
  findings?: number;
  scannerVersion?: string | null;
}) {
  const unsafe = riskLevel === "HIGH" || riskLevel === "CRITICAL";
  return (
    <span
      title={`Automated static scan${scannerVersion ? ` · scanner v${scannerVersion}` : ""}${findings != null ? ` · ${findings} finding(s)` : ""}. Separate from source trust; not a guarantee.`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] whitespace-nowrap",
        unsafe ? "border-danger/30 bg-danger/10 text-danger" : "border-border bg-muted text-muted-foreground",
      )}
    >
      <CircleAlert className="size-3" aria-hidden />
      Scan {score}
    </span>
  );
}

export function HostBadge({ host, className }: { host: HostId | string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground",
        className,
      )}
    >
      <span className="size-1 rounded-full bg-success" aria-hidden />
      {hostLabel(host)}
    </span>
  );
}

export function CompatBadge({ status }: { status: string }) {
  const label =
    status === "VERIFIED" ? "Format verified" : status === "EXPORT_ONLY" ? "Export only" : "Not compatible";
  return (
    <span
      title={
        status === "VERIFIED"
          ? "Skill format validates for this host. Auto-install still depends on local detection."
          : status === "EXPORT_ONLY"
            ? "This host does not consume SKILL.md directly. Download and adapt the files."
            : "The skill does not validate for this host."
      }
      className={cn(
        "rounded-full border px-2 py-0.5 text-[10px]",
        status === "VERIFIED"
          ? "border-success/25 bg-success/10 text-success"
          : "border-border bg-muted text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}
