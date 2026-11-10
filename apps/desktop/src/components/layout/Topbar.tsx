import { Search } from "lucide-react";
import { formatDate, formatRelative } from "../../lib/format";
import { ROUTE_META, type Route } from "../../lib/router";
import { useAppData } from "../../app/app-context";
import { SyncAllButton } from "../SyncAllButton";

export interface TopbarProps {
  route: Route;
  onFocusSearch: () => void;
}

export function Topbar({ route, onFocusSearch }: TopbarProps) {
  const { bootstrap, refreshing } = useAppData();
  const meta = ROUTE_META[route];
  const lastSync = bootstrap?.stats.lastSyncAt;
  const shortcut = /Mac|iPhone|iPad/i.test(navigator.platform) ? "⌘ K" : "Ctrl K";

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-line/70 bg-canvas/55 px-4 backdrop-blur-md sm:px-6 xl:px-7">
      <div className="flex min-w-0 items-center gap-2 text-[11px]">
        <span className="hidden text-muted-soft sm:inline">{meta.eyebrow}</span>
        <span className="hidden text-muted/30 sm:inline" aria-hidden="true">
          /
        </span>
        <span className="truncate font-medium text-text/90">{meta.title}</span>
        {refreshing ? (
          <span className="ml-1 flex items-center gap-1.5 text-[11px] text-muted">
            <span className="size-1.5 animate-soft-pulse rounded-full bg-brand" aria-hidden="true" />
            Refreshing
          </span>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {lastSync ? (
          <span
            className="hidden items-center gap-1.5 text-[11px] text-muted xl:flex"
            title={formatDate(lastSync)}
          >
            <span className="size-1.5 rounded-full bg-ok/80" aria-hidden="true" />
            Catalog synced {formatRelative(lastSync)}
          </span>
        ) : (
          <span className="hidden items-center gap-1.5 text-[11px] text-muted xl:flex">
            <span className="size-1.5 rounded-full bg-warn/80" aria-hidden="true" />
            Catalog not synced
          </span>
        )}
        {route !== "home" ? (
          <button
            type="button"
            onClick={onFocusSearch}
            className="hidden h-8 items-center gap-2 rounded-lg border border-line bg-surface/60 px-2.5 text-[11px] text-muted transition-colors hover:border-brand/30 hover:text-text md:flex"
            title="Focus Explore search"
          >
            <Search className="size-3" aria-hidden="true" />
            <span>Search</span>
            <kbd className="flex items-center gap-0.5 rounded border border-line bg-elevated/60 px-1 py-0.5 font-mono text-[11px] text-muted-soft">
              {shortcut}
            </kbd>
          </button>
        ) : null}
        <SyncAllButton />
      </div>
    </header>
  );
}
