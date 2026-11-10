import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  CheckCircle2,
  Clock3,
  RefreshCw,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { useAppData } from "../app/app-context";
import { PageHeader } from "../components/layout/PageHeader";
import { Badge, type BadgeTone } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { Select } from "../components/ui/Select";
import { Skeleton } from "../components/ui/Skeleton";
import { Tabs } from "../components/ui/Tabs";
import { hostName } from "../lib/constants";
import { cx } from "../lib/cx";
import {
  errorMessage,
  formatDate,
  formatNumber,
  formatRelative,
  humanizeStatus,
  operationLabel,
  pluralize,
} from "../lib/format";
import { operationIcon } from "../lib/icons";
import { ipc } from "../lib/ipc";
import type { SourceRun } from "../lib/types";

type Tab = "operations" | "runs";

function operationTone(status: string): BadgeTone {
  if (status === "success" || status === "ok") return "ok";
  if (status === "error" || status === "failed") return "danger";
  return "neutral";
}

function runTone(status: string): BadgeTone {
  if (status === "ok" || status === "success") return "ok";
  if (status === "error") return "danger";
  if (status === "running") return "brand";
  return "neutral";
}

function runStatusLabel(status: string): string {
  if (status === "ok") return "Success";
  if (status === "error") return "Error";
  if (status === "running") return "Running";
  return humanizeStatus(status);
}

function runDuration(run: SourceRun): string {
  if (!run.finishedAt) return run.status === "running" ? "Running" : "No finish time";
  const started = new Date(run.startedAt).getTime();
  const finished = new Date(run.finishedAt).getTime();
  if (Number.isNaN(started) || Number.isNaN(finished)) return "Unknown";
  const seconds = Math.max(0, Math.round((finished - started) / 1000));
  if (seconds < 1) return "<1s";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

export default function ActivityPage() {
  const { bootstrap, revision, refresh } = useAppData();
  const [tab, setTab] = useState<Tab>("operations");
  const [runs, setRuns] = useState<SourceRun[] | null>(null);
  const [runsLoading, setRunsLoading] = useState(true);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const loadRuns = useCallback(async () => {
    setRunsLoading(true);
    setRunsError(null);
    try {
      const result = await ipc.listSourceRuns(sourceFilter || undefined, 50);
      setRuns(result);
    } catch (reason) {
      setRuns(null);
      setRunsError(errorMessage(reason, "Could not read source runs."));
    } finally {
      setRunsLoading(false);
    }
  }, [sourceFilter]);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns, revision]);

  const refreshAll = async () => {
    setRefreshing(true);
    try {
      await Promise.all([refresh(), loadRuns()]);
    } finally {
      setRefreshing(false);
    }
  };

  if (!bootstrap) return null;
  const operations = bootstrap.recentOperations;
  const sourceNames = new Map(bootstrap.sources.map((source) => [source.id, source.name]));
  const allRuns = runs ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="System"
        title="Downloads"
        description="Installs, updates, rollbacks and source sync history from the local SQLite catalog."
        meta={
          <span>
            {pluralize(operations.length, "recent operation")} ·{" "}
            {pluralize(bootstrap.sources.length, "source")}
          </span>
        }
        actions={
          <Button variant="secondary" size="sm" onClick={() => void refreshAll()} loading={refreshing}>
            {!refreshing ? <RefreshCw className="size-3.5" aria-hidden="true" /> : null}
            Refresh
          </Button>
        }
      />

      <Tabs
        tabs={[
          { id: "operations", label: "Installs & operations", count: operations.length },
          { id: "runs", label: "Source runs", count: allRuns.length },
        ]}
        value={tab}
        onChange={(value) => setTab(value as Tab)}
        trailing={
          tab === "runs" && bootstrap.sources.length > 0 ? (
            <Select
              value={sourceFilter}
              onChange={(event) => setSourceFilter(event.target.value)}
              options={bootstrap.sources.map((source) => ({ value: source.id, label: source.name }))}
              placeholder="All sources"
              aria-label="Filter source runs by source"
              className="h-8 w-44 text-xs"
            />
          ) : undefined
        }
      />

      {tab === "operations" ? (
        operations.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No operations recorded"
            description="Source syncs, installs, updates and settings changes are written to the local operation journal as they happen."
            hint="If you just installed the app, this list will fill after your first sync."
          />
        ) : (
          <div className="overflow-hidden rounded-[14px] border border-line bg-surface/45">
            {operations.map((operation) => {
              const Icon = operationIcon(operation.kind);
              const good = operation.status === "success" || operation.status === "ok";
              const bad = operation.status === "error" || operation.status === "failed";
              return (
                <div
                  key={operation.id}
                  className="flex items-start gap-3 border-b border-line/60 px-4 py-3 last:border-b-0"
                >
                  <span
                    className={cx(
                      "mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border",
                      bad
                        ? "border-danger/25 bg-danger/[0.06] text-danger"
                        : good
                          ? "border-ok/20 bg-ok/[0.05] text-ok"
                          : "border-line bg-elevated/45 text-brand-soft/80",
                    )}
                  >
                    <Icon className="size-3.5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[12px] font-medium text-text">
                        {operationLabel(operation.kind)}
                      </span>
                      <Badge tone={operationTone(operation.status)} dot>
                        {humanizeStatus(operation.status)}
                      </Badge>
                      {operation.host ? (
                        <Badge tone="outline">{hostName(operation.host)}</Badge>
                      ) : null}
                    </div>
                    {operation.detail ? (
                      <p className="mt-1 text-[11px] leading-relaxed text-muted">{operation.detail}</p>
                    ) : null}
                  </div>
                  <time
                    dateTime={operation.createdAt}
                    title={formatDate(operation.createdAt)}
                    className="shrink-0 pt-0.5 text-[11px] text-muted-soft"
                  >
                    {formatRelative(operation.createdAt)}
                  </time>
                </div>
              );
            })}
          </div>
        )
      ) : runsError ? (
        <EmptyState
          icon={TriangleAlert}
          title="Could not read source runs"
          description={runsError}
          action={
            <Button variant="secondary" onClick={() => void loadRuns()}>
              Retry
            </Button>
          }
        />
      ) : runsLoading && !runs ? (
        <div className="overflow-hidden rounded-[14px] border border-line bg-surface/45">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="flex items-start gap-3 border-b border-line/60 px-4 py-4 last:border-b-0">
              <Skeleton className="size-8 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-1/4" />
                <Skeleton className="h-2.5 w-1/2" />
              </div>
              <Skeleton className="h-5 w-12" />
            </div>
          ))}
        </div>
      ) : allRuns.length === 0 ? (
        <EmptyState
          icon={Clock3}
          title={sourceFilter ? "No runs for this source" : "No source runs yet"}
          description={
            sourceFilter
              ? "This source has not completed a sync. Run it from the Sources page."
              : "Each sync writes a run with counts for found, created, updated, unchanged and blocked skills."
          }
          action={
            <Button variant="secondary" onClick={() => void loadRuns()}>
              Refresh
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-[14px] border border-line bg-surface/45">
          {allRuns.map((run) => (
            <div key={run.id} className="border-b border-line/60 px-4 py-3 last:border-b-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12px] font-medium text-text">
                  {sourceNames.get(run.sourceId) ?? "Removed source"}
                </span>
                <Badge tone={runTone(run.status)} dot>
                  {runStatusLabel(run.status)}
                </Badge>
                <span className="font-mono text-[11px] text-muted-soft">{runDuration(run)}</span>
                <time
                  dateTime={run.startedAt}
                  title={formatDate(run.startedAt)}
                  className="ml-auto text-[11px] text-muted-soft"
                >
                  {formatRelative(run.startedAt)}
                </time>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted">
                <Count label="found" value={run.found} />
                <Count label="new" value={run.created} tone="brand" />
                <Count label="updated" value={run.updated} tone="cyan" />
                <Count label="unchanged" value={run.unchanged} />
                <Count label="blocked" value={run.blocked} tone={run.blocked > 0 ? "danger" : undefined} />
                {run.finishedAt ? (
                  <span className="inline-flex items-center gap-1 text-muted-soft">
                    <CheckCircle2 className="size-3" aria-hidden="true" />
                    Finished {formatRelative(run.finishedAt)}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-brand-soft/80">
                    <Clock3 className="size-3" aria-hidden="true" />
                    {run.status === "running" ? "In progress" : "No finish time"}
                  </span>
                )}
              </div>
              {run.error ? (
                <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-danger/85">
                  <XCircle className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                  {run.error}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Count({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "brand" | "cyan" | "danger";
}) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span
        className={cx(
          "font-mono text-[11px] tabular-nums",
          tone === "brand" ? "text-brand-soft" : tone === "cyan" ? "text-cyan" : tone === "danger" ? "text-danger" : "text-text/80",
        )}
      >
        {formatNumber(value)}
      </span>
      <span className="text-muted-soft">{label}</span>
    </span>
  );
}
