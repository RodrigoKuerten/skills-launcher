import { Pencil, RefreshCw, Trash2 } from "lucide-react";
import { SOURCE_KIND_LABEL } from "../lib/constants";
import { cx } from "../lib/cx";
import { formatRelative, pluralize, sourceHealth, sourceHealthLabel, truncateMiddle } from "../lib/format";
import { sourceKindIcon } from "../lib/icons";
import type { Source } from "../lib/types";
import { TrustBadge } from "./TrustBadge";
import { IconButton } from "./ui/IconButton";
import { Switch } from "./ui/Switch";

const HEALTH_CLASS = {
  ok: "bg-ok shadow-[0_0_8px_rgba(52,211,153,0.45)]",
  error: "bg-danger shadow-[0_0_8px_rgba(251,113,133,0.4)]",
  never: "bg-warn/80",
  disabled: "bg-muted/50",
};

export interface SourceRowProps {
  source: Source;
  syncing?: boolean;
  toggling?: boolean;
  compact?: boolean;
  onSync?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onToggle?: (enabled: boolean) => void;
}

export function SourceRow({
  source,
  syncing = false,
  toggling = false,
  compact = false,
  onSync,
  onEdit,
  onDelete,
  onToggle,
}: SourceRowProps) {
  const KindIcon = sourceKindIcon(source.kind);
  const health = sourceHealth(source);

  return (
    <div
      className={cx(
        "flex items-start gap-3 border-b border-line/60 px-4 last:border-b-0",
        compact ? "py-2.5" : "py-3.5",
        !source.enabled && "opacity-65",
      )}
    >
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-elevated/50 text-brand-soft/85">
        <KindIcon className="size-3.5" aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-xs font-medium text-text">{source.name}</span>
          <TrustBadge trust={source.trust} />
          {!compact ? (
            <span className="text-[11px] uppercase tracking-[0.08em] text-muted-soft">
              {SOURCE_KIND_LABEL[source.kind] ?? source.kind}
            </span>
          ) : null}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className={cx("size-1.5 rounded-full", HEALTH_CLASS[health])} aria-hidden="true" />
            {sourceHealthLabel(source)}
          </span>
          <span>{source.lastSyncAt ? formatRelative(source.lastSyncAt) : "Awaiting first sync"}</span>
          <span>{pluralize(source.skillCount, "skill")}</span>
          {compact && source.autoSync ? <span className="text-muted-soft">Auto</span> : null}
        </div>

        {!compact && source.url ? (
          <p className="mt-1 truncate font-mono text-[11px] text-muted-soft" title={source.url}>
            {truncateMiddle(source.url, 96)}
          </p>
        ) : null}

        {source.lastError ? (
          <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-danger/85" title={source.lastError}>
            {source.lastError}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {onToggle ? (
          <span className="mr-1 hidden sm:inline-flex" title={source.enabled ? "Disable source" : "Enable source"}>
            <Switch
              checked={source.enabled}
              onCheckedChange={onToggle}
              disabled={toggling}
              label={`${source.enabled ? "Disable" : "Enable"} ${source.name}`}
            />
          </span>
        ) : null}
        {onSync ? (
          <IconButton
            label={`Sync ${source.name}`}
            icon={<RefreshCw className="size-3.5" aria-hidden="true" />}
            onClick={onSync}
            loading={syncing}
            disabled={!source.enabled}
            size={compact ? "sm" : "md"}
          />
        ) : null}
        {!compact && onEdit ? (
          <IconButton
            label={`Edit ${source.name}`}
            icon={<Pencil className="size-3.5" aria-hidden="true" />}
            onClick={onEdit}
          />
        ) : null}
        {!compact && onDelete ? (
          <IconButton
            label={`Remove ${source.name}`}
            icon={<Trash2 className="size-3.5" aria-hidden="true" />}
            onClick={onDelete}
            variant="danger"
          />
        ) : null}
      </div>
    </div>
  );
}
