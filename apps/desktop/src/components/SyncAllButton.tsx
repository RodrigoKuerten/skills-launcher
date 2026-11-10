import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { errorMessage, formatNumber, formatRelative } from "../lib/format";
import { ipc } from "../lib/ipc";
import { navigate } from "../lib/router";
import type { SyncSummary } from "../lib/types";
import { useAppData } from "../app/app-context";
import { Button } from "./ui/Button";
import { useToast } from "./ui/Toast";
import { cx } from "../lib/cx";

export interface SyncAllButtonProps {
  label?: string;
  size?: "sm" | "md";
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
}

function summarize(summaries: SyncSummary[]): string {
  const found = summaries.reduce((total, item) => total + item.found, 0);
  const created = summaries.reduce((total, item) => total + item.created, 0);
  const updated = summaries.reduce((total, item) => total + item.updated, 0);
  return `${formatNumber(found)} found · ${formatNumber(created)} new · ${formatNumber(updated)} updated`;
}

export function SyncAllButton({
  label = "Sync all",
  size = "sm",
  variant = "secondary",
  className,
}: SyncAllButtonProps) {
  const { bootstrap, refresh } = useAppData();
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  const run = async () => {
    if (!bootstrap) return;
    if (bootstrap.sources.length === 0) {
      toast.info("No sources to sync", "Add a source first, then run a sync.");
      navigate("sources");
      return;
    }
    if (bootstrap.stats.enabledSources === 0) {
      toast.info("No enabled sources", "Enable a source before running a sync.");
      navigate("sources");
      return;
    }
    if (loading) return;
    setLoading(true);
    try {
      const summaries = await ipc.syncAllSources();
      const failures = summaries.filter((summary) => summary.status !== "ok" || summary.error);
      if (failures.length > 0) {
        const first = failures[0];
        toast.error(
          `Sync finished with ${failures.length} ${failures.length === 1 ? "error" : "errors"}`,
          first?.error ?? summarize(summaries),
        );
      } else {
        toast.success("Catalog updated", summarize(summaries));
      }
      await refresh();
    } catch (reason) {
      toast.error("Sync failed", errorMessage(reason));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={() => void run()}
      loading={loading}
      className={cx(className)}
      title={
        bootstrap?.stats.lastSyncAt
          ? `Last catalog sync ${formatRelative(bootstrap.stats.lastSyncAt)}`
          : "No catalog sync has completed yet"
      }
    >
      {!loading ? <RefreshCw className="size-3.5" aria-hidden="true" /> : null}
      {label}
    </Button>
  );
}
