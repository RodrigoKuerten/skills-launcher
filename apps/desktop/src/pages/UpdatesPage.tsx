import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Download,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { useAppData } from "../app/app-context";
import { PageHeader } from "../components/layout/PageHeader";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { Progress } from "../components/ui/Progress";
import { Skeleton } from "../components/ui/Skeleton";
import { useToast } from "../components/ui/Toast";
import { hostName } from "../lib/constants";
import { errorMessage, formatNumber, formatRelative } from "../lib/format";
import { ipc } from "../lib/ipc";
import { navigate } from "../lib/router";
import type { InstallResponse, UpdateItem } from "../lib/types";

function failureMessage(response: InstallResponse): string | null {
  const failed = response.outcomes.filter((outcome) => !outcome.ok);
  if (failed.length === 0) return null;
  return failed.map((outcome) => `${hostName(outcome.host)}: ${outcome.message}`).join(" · ");
}

export default function UpdatesPage() {
  const { bootstrap, revision, refresh } = useAppData();
  const toast = useToast();
  const [updates, setUpdates] = useState<UpdateItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await ipc.listUpdates();
      setUpdates(result);
      setSelected((current) => {
        const valid = new Set(result.map((item) => item.installation.id));
        return new Set([...current].filter((id) => valid.has(id)));
      });
    } catch (reason) {
      setUpdates(null);
      setError(errorMessage(reason, "Could not check for updates."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, revision]);

  const toggle = (id: string, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const updateOne = async (item: UpdateItem) => {
    if (updatingId || bulk) return;
    setUpdatingId(item.installation.id);
    try {
      const response = await ipc.updateInstallation(item.installation.id);
      const failure = failureMessage(response);
      if (failure) {
        toast.error("Update did not complete", failure);
      } else {
        toast.success(
          "Skill updated",
          `${item.installation.skillName} was updated on ${hostName(item.installation.host)}.`,
        );
      }
      await load();
      await refresh();
    } catch (reason) {
      toast.error("Update failed", errorMessage(reason));
    } finally {
      setUpdatingId(null);
    }
  };

  const updateSelected = async () => {
    if (!updates || selected.size === 0 || updatingId || bulk) return;
    const ids = updates
      .filter((item) => selected.has(item.installation.id))
      .map((item) => item.installation.id);
    setBulk({ done: 0, total: ids.length });
    const failures: string[] = [];
    let succeeded = 0;
    for (const id of ids) {
      try {
        const response = await ipc.updateInstallation(id);
        const failure = failureMessage(response);
        if (failure) failures.push(failure);
        else succeeded += 1;
      } catch (reason) {
        failures.push(errorMessage(reason));
      }
      setBulk((current) => (current ? { ...current, done: current.done + 1 } : current));
    }
    if (failures.length > 0) {
      toast.error(
        `Updated ${succeeded} of ${ids.length}`,
        failures.slice(0, 2).join(" · "),
      );
    } else {
      toast.success(
        "Updates applied",
        `${succeeded} ${succeeded === 1 ? "installation was" : "installations were"} updated.`,
      );
      setSelected(new Set());
    }
    setBulk(null);
    await load();
    await refresh();
  };

  if (!bootstrap) return null;

  const all = updates ?? [];
  const allSelected = all.length > 0 && selected.size === all.length;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Manage"
        title="Updates"
        description="Upstream changes detected against your installed versions. Review the change summary before applying."
        meta={
          <span>
            {formatNumber(all.length)} pending · {formatNumber(bootstrap.stats.installed)} installed
          </span>
        }
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void load()}
              loading={loading}
              disabled={Boolean(bulk) || Boolean(updatingId)}
            >
              {!(loading && !updates) ? <RefreshCw className="size-3.5" aria-hidden="true" /> : null}
              Check again
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void updateSelected()}
              loading={Boolean(bulk)}
              disabled={selected.size === 0 || Boolean(updatingId)}
            >
              {!bulk ? <Download className="size-3.5" aria-hidden="true" /> : null}
              Update selected{selected.size > 0 ? ` (${selected.size})` : ""}
            </Button>
          </>
        }
      />

      {bulk ? (
        <div className="rounded-xl border border-brand/25 bg-brand/[0.055] px-4 py-3">
          <Progress
            value={bulk.done}
            max={bulk.total}
            label={`Applying updates · ${bulk.done} of ${bulk.total}`}
            showValue
          />
        </div>
      ) : null}

      {error ? (
        <EmptyState
          icon={TriangleAlert}
          title="Could not check for updates"
          description={error}
          action={
            <Button variant="secondary" onClick={() => void load()}>
              Retry
            </Button>
          }
        />
      ) : loading && !updates ? (
        <div className="overflow-hidden rounded-[14px] border border-line bg-surface/45">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="flex items-start gap-3 border-b border-line/60 px-4 py-4 last:border-b-0">
              <Skeleton className="size-4 rounded" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-1/4" />
                <Skeleton className="h-2.5 w-2/3" />
                <Skeleton className="h-2 w-1/3" />
              </div>
              <Skeleton className="h-7 w-20" />
            </div>
          ))}
        </div>
      ) : all.length === 0 ? (
        bootstrap.stats.installed > 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="Everything is current"
            description="Every installed skill matches the latest version available from its source."
            action={
              <Button variant="secondary" onClick={() => navigate("library")}>
                Open Library
              </Button>
            }
            hint="Run a source sync to check for new upstream versions."
          />
        ) : (
          <EmptyState
            icon={CheckCircle2}
            title="No installations to update"
            description="Install a skill first. Updates compare each installation with the newest version in its source."
            action={
              <Button variant="primary" onClick={() => navigate("explore")}>
                Explore skills
              </Button>
            }
          />
        )
      ) : (
        <div className="overflow-hidden rounded-[14px] border border-line bg-surface/45">
          <div className="flex items-center gap-3 border-b border-line/70 bg-surface/40 px-4 py-2.5">
            <input
              type="checkbox"
              className="size-3.5 accent-[#2f6bff]"
              checked={allSelected}
              onChange={(event) => {
                setSelected(
                  event.target.checked
                    ? new Set(all.map((item) => item.installation.id))
                    : new Set(),
                );
              }}
              aria-label={allSelected ? "Deselect all updates" : "Select all updates"}
            />
            <span className="text-[10px] font-medium text-muted">
              {selected.size > 0 ? `${selected.size} selected` : "Select all"}
            </span>
            <span className="ml-auto text-[10px] text-muted/60">
              {formatNumber(all.length)} {all.length === 1 ? "update" : "updates"}
            </span>
          </div>
          {all.map((item) => {
            const installation = item.installation;
            const checked = selected.has(installation.id);
            const busyHere = updatingId === installation.id;
            return (
              <div
                key={installation.id}
                className="flex flex-col gap-3 border-b border-line/60 px-4 py-3.5 last:border-b-0 sm:flex-row sm:items-start"
              >
                <input
                  type="checkbox"
                  className="mt-1 size-3.5 shrink-0 accent-[#2f6bff]"
                  checked={checked}
                  onChange={(event) => toggle(installation.id, event.target.checked)}
                  aria-label={`Select update for ${installation.skillName}`}
                  disabled={Boolean(bulk)}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[12.5px] font-medium text-text">
                      {installation.skillName}
                    </span>
                    <Badge tone="neutral">{hostName(installation.host)}</Badge>
                    <span className="font-mono text-[10px] text-muted">
                      {installation.versionLabel ?? "unknown"}
                      <span className="text-muted/40"> → </span>
                      <span className="text-brand-soft">
                        {installation.latestVersionLabel ?? "latest"}
                      </span>
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[10.5px] leading-relaxed text-muted">
                    {item.changeSummary || "No change summary was provided for this update."}
                  </p>
                  <p className="mt-1 text-[9px] text-muted/55">
                    Installed {formatRelative(installation.installedAt)} · last written{" "}
                    {formatRelative(installation.updatedAt)}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void updateOne(item)}
                  loading={busyHere}
                  disabled={Boolean(bulk) || Boolean(updatingId && !busyHere)}
                  className="shrink-0"
                >
                  {!busyHere ? <Download className="size-3.5" aria-hidden="true" /> : null}
                  Update
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {all.length > 0 ? (
        <p className="text-[10px] leading-relaxed text-muted/60">
          A failed update reports the host error and keeps the installation record available for
          inspection. Review the error before retrying.
        </p>
      ) : null}
    </div>
  );
}
