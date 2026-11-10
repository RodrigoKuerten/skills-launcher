import { useCallback, useEffect, useState } from "react";
import {
  Download,
  History,
  Library,
  Package,
  RefreshCw,
  SearchX,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useAppData } from "../app/app-context";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { PageHeader } from "../components/layout/PageHeader";
import { Badge, type BadgeTone } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Dialog } from "../components/ui/Dialog";
import { EmptyState } from "../components/ui/EmptyState";
import { IconButton } from "../components/ui/IconButton";
import { SearchInput } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Skeleton } from "../components/ui/Skeleton";
import { Switch } from "../components/ui/Switch";
import { useToast } from "../components/ui/Toast";
import { hostName, HOSTS } from "../lib/constants";
import { cx } from "../lib/cx";
import {
  errorMessage,
  formatDate,
  formatNumber,
  formatRelative,
  humanizeStatus,
  pluralize,
  truncateMiddle,
} from "../lib/format";
import { ipc } from "../lib/ipc";
import { navigate } from "../lib/router";
import type { Backup, InstallResponse, Installation } from "../lib/types";

type BusyAction = "update" | "rollback" | "uninstall";

function statusTone(status: string): BadgeTone {
  if (status === "INSTALLED") return "ok";
  if (status === "DRIFT") return "warn";
  if (status === "MISSING") return "danger";
  return "neutral";
}

function hasUpdate(installation: Installation): boolean {
  return Boolean(
    installation.latestVersionId &&
      installation.latestVersionId !== installation.versionId,
  );
}

function failureMessage(response: InstallResponse): string | null {
  const failed = response.outcomes.filter((outcome) => !outcome.ok);
  if (failed.length === 0) return null;
  return failed.map((outcome) => `${hostName(outcome.host)}: ${outcome.message}`).join(" · ");
}

export default function LibraryPage() {
  const { bootstrap, revision, refresh } = useAppData();
  const toast = useToast();
  const [installations, setInstallations] = useState<Installation[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [host, setHost] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState<{ id: string; action: BusyAction } | null>(null);

  const [uninstallTarget, setUninstallTarget] = useState<Installation | null>(null);
  const [removeFiles, setRemoveFiles] = useState(false);

  const [backupTarget, setBackupTarget] = useState<Installation | null>(null);
  const [backups, setBackups] = useState<Backup[] | null>(null);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [backupsError, setBackupsError] = useState<string | null>(null);
  const [selectedBackupId, setSelectedBackupId] = useState<string | null>(null);
  const [rollbackConfirm, setRollbackConfirm] = useState<{ installation: Installation; backup: Backup } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await ipc.listInstallations();
      setInstallations(result);
    } catch (reason) {
      setInstallations(null);
      setError(errorMessage(reason, "Could not read installations."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, revision]);

  const loadBackups = async (installation: Installation) => {
    setBackupTarget(installation);
    setBackups(null);
    setBackupsError(null);
    setSelectedBackupId(null);
    setBackupsLoading(true);
    try {
      const result = await ipc.listBackups(installation.id);
      setBackups(result);
    } catch (reason) {
      setBackupsError(errorMessage(reason, "Could not read backups."));
    } finally {
      setBackupsLoading(false);
    }
  };

  const updateOne = async (installation: Installation) => {
    if (busy) return;
    setBusy({ id: installation.id, action: "update" });
    try {
      const response = await ipc.updateInstallation(installation.id);
      const failure = failureMessage(response);
      if (failure) toast.error("Update did not complete", failure);
      else toast.success("Skill updated", `${installation.skillName} was updated on ${hostName(installation.host)}.`);
      await load();
      await refresh();
    } catch (reason) {
      toast.error("Update failed", errorMessage(reason));
    } finally {
      setBusy(null);
    }
  };

  const uninstall = async () => {
    if (!uninstallTarget) return;
    setBusy({ id: uninstallTarget.id, action: "uninstall" });
    try {
      await ipc.uninstallSkill(uninstallTarget.id, removeFiles);
      toast.success(
        "Skill uninstalled",
        removeFiles
          ? `${uninstallTarget.skillName} and its files were removed.`
          : `${uninstallTarget.skillName} was unlinked; files were left in place.`,
      );
      setUninstallTarget(null);
      await load();
      await refresh();
    } catch (reason) {
      toast.error("Uninstall failed", errorMessage(reason));
    } finally {
      setBusy(null);
    }
  };

  const rollback = async () => {
    if (!rollbackConfirm) return;
    const { installation, backup } = rollbackConfirm;
    setBusy({ id: installation.id, action: "rollback" });
    try {
      const response = await ipc.rollbackInstallation(installation.id, backup.id);
      const failure = failureMessage(response);
      if (failure) toast.error("Rollback did not complete", failure);
      else toast.success("Rollback restored", `${installation.skillName} was restored on ${hostName(installation.host)}.`);
      setRollbackConfirm(null);
      await load();
      await refresh();
    } catch (reason) {
      toast.error("Rollback failed", errorMessage(reason));
    } finally {
      setBusy(null);
    }
  };

  if (!bootstrap) return null;

  const all = (installations ?? []).filter((installation) => installation.status !== "REMOVED");
  const hosts = Array.from(new Set(all.map((installation) => installation.host))).sort();
  const statuses = Array.from(new Set(all.map((installation) => installation.status))).sort();
  const filtered = all.filter((installation) => {
    if (host && installation.host !== host) return false;
    if (status && installation.status !== status) return false;
    if (query) {
      const needle = query.toLowerCase();
      const haystack = `${installation.skillName} ${installation.skillSlug} ${installation.installPath}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
  const filteredOut = (query || host || status) && filtered.length === 0 && all.length > 0;
  const selectedBackup = backups?.find((backup) => backup.id === selectedBackupId) ?? null;
  const anyFilter = Boolean(query || host || status);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Manage"
        title="Library"
        description="Skills currently installed into detected agents. Drift means the files on disk no longer match the recorded version."
        meta={
          <span>
            {formatNumber(bootstrap.stats.installed)} installed ·{" "}
            {pluralize(bootstrap.stats.updates, "update")}
          </span>
        }
        actions={
          <Button variant="primary" size="sm" onClick={() => navigate("explore")}>
            Find skills
          </Button>
        }
      />

      <section className="flex flex-col gap-2 rounded-[14px] border border-line bg-surface/45 p-3 lg:flex-row lg:items-center">
        <SearchInput
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onClear={() => setQuery("")}
          placeholder="Filter by skill or path…"
          aria-label="Filter installations"
          containerClassName="flex-1"
          className="h-10"
        />
        <div className="flex flex-wrap gap-2">
          <Select
            value={host}
            onChange={(event) => setHost(event.target.value)}
            options={HOSTS.filter((item) => hosts.includes(item.id)).map((item) => ({
              value: item.id,
              label: item.name,
            }))}
            placeholder="All agents"
            aria-label="Filter by agent"
            className="w-40"
          />
          <Select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            options={statuses.map((value) => ({ value, label: humanizeStatus(value) }))}
            placeholder="Any status"
            aria-label="Filter by installation status"
            className="w-36"
          />
          {anyFilter ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setQuery("");
                setHost("");
                setStatus("");
              }}
            >
              Clear
            </Button>
          ) : null}
        </div>
      </section>

      {error ? (
        <EmptyState
          icon={TriangleAlert}
          title="Could not read the library"
          description={error}
          action={
            <Button variant="secondary" onClick={() => void load()}>
              Retry
            </Button>
          }
        />
      ) : loading && !installations ? (
        <div className="overflow-hidden rounded-[14px] border border-line bg-surface/45">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="flex items-start gap-3 border-b border-line/60 px-4 py-4 last:border-b-0">
              <Skeleton className="size-9 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-2.5 w-2/3" />
                <Skeleton className="h-2 w-1/2" />
              </div>
              <Skeleton className="h-7 w-20" />
            </div>
          ))}
        </div>
      ) : all.length === 0 ? (
        <EmptyState
          icon={Library}
          title="Nothing installed yet"
          description="Installed skills appear here with their host, version and backup state. Start in Explore and install into a detected agent."
          action={
            <>
              <Button variant="primary" onClick={() => navigate("explore")}>
                Explore skills
              </Button>
              <Button variant="secondary" onClick={() => navigate("agents")}>
                Check My Agents
              </Button>
            </>
          }
          hint="Skills Launcher never installs into an undetected agent."
        />
      ) : filteredOut ? (
        <EmptyState
          icon={SearchX}
          title="No installations match these filters"
          description="Clear the filters to see the full library."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setQuery("");
                setHost("");
                setStatus("");
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-[14px] border border-line bg-surface/45">
          {filtered.map((installation) => {
            const busyHere = busy?.id === installation.id;
            const updateAvailable = hasUpdate(installation);
            return (
              <div
                key={installation.id}
                className="flex flex-col gap-3 border-b border-line/60 px-4 py-3.5 last:border-b-0 sm:flex-row sm:items-start"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-[10px] border border-line bg-elevated/50 text-brand-soft/85">
                  <Package className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[12.5px] font-medium text-text">{installation.skillName}</span>
                    <Badge tone="neutral">{hostName(installation.host)}</Badge>
                    <Badge tone={statusTone(installation.status)} dot>
                      {humanizeStatus(installation.status)}
                    </Badge>
                    {updateAvailable ? <Badge tone="brand">Update available</Badge> : null}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted">
                    <span className="font-mono">
                      {installation.versionLabel ?? "unknown"}
                      {installation.latestVersionLabel && updateAvailable ? (
                        <span className="text-muted/55"> → {installation.latestVersionLabel}</span>
                      ) : null}
                    </span>
                    <span>Installed {formatRelative(installation.installedAt)}</span>
                    <span>Updated {formatRelative(installation.updatedAt)}</span>
                  </div>
                  <p
                    className="mt-1 truncate font-mono text-[9.5px] text-muted/50"
                    title={installation.installPath}
                  >
                    {truncateMiddle(installation.installPath, 100)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5 sm:pt-0.5">
                  {updateAvailable ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void updateOne(installation)}
                      loading={busyHere && busy?.action === "update"}
                      disabled={Boolean(busy) && !busyHere}
                    >
                      {!(busyHere && busy?.action === "update") ? (
                        <Download className="size-3.5" aria-hidden="true" />
                      ) : null}
                      Update
                    </Button>
                  ) : null}
                  <IconButton
                    label={`Rollback ${installation.skillName}`}
                    icon={<History className="size-3.5" aria-hidden="true" />}
                    onClick={() => void loadBackups(installation)}
                    disabled={Boolean(busy)}
                  />
                  <IconButton
                    label={`Uninstall ${installation.skillName}`}
                    icon={<Trash2 className="size-3.5" aria-hidden="true" />}
                    variant="danger"
                    onClick={() => {
                      setRemoveFiles(false);
                      setUninstallTarget(installation);
                    }}
                    disabled={Boolean(busy)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {all.length > 0 ? (
        <p className="flex items-center gap-2 text-[10px] text-muted/60">
          <RefreshCw className="size-3" aria-hidden="true" />
          Updates and rollbacks create local operations. Check Activity for the full journal.
        </p>
      ) : null}

      <ConfirmDialog
        open={uninstallTarget !== null}
        onOpenChange={(open) => {
          if (!open) setUninstallTarget(null);
        }}
        title={`Uninstall ${uninstallTarget?.skillName ?? "skill"}?`}
        description={`This removes the installation record from ${hostName(uninstallTarget?.host ?? "")}. Files can be kept or deleted in the same step.`}
        confirmLabel="Uninstall"
        onConfirm={uninstall}
      >
        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded-lg border border-line bg-surface/40 px-3 py-2.5">
            <Switch
              checked={removeFiles}
              onCheckedChange={setRemoveFiles}
              label="Remove installed files"
              className="mt-0.5"
            />
            <div>
              <p className="text-[11px] font-medium text-text">Also delete files from the agent folder</p>
              <p className="mt-0.5 text-[10px] leading-relaxed text-muted">
                Off by default. The skill is unlinked from the library but its folder is left on disk.
              </p>
            </div>
          </div>
          {uninstallTarget ? (
            <p className="break-all rounded-lg border border-line bg-canvas/40 px-3 py-2 font-mono text-[9.5px] leading-relaxed text-muted/70">
              {uninstallTarget.installPath}
            </p>
          ) : null}
          {removeFiles ? (
            <p className="text-[10px] leading-relaxed text-warn">
              Deleting files is destructive. A backup may allow a rollback if the installer created one.
            </p>
          ) : null}
        </div>
      </ConfirmDialog>

      <Dialog
        open={backupTarget !== null}
        onOpenChange={(open) => {
          if (!open) setBackupTarget(null);
        }}
        title={`Backups for ${backupTarget?.skillName ?? "skill"}`}
        description="Select a backup to restore. Restoring replaces the current installed files after confirmation."
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setBackupTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={!selectedBackup}
              onClick={() => {
                if (!backupTarget || !selectedBackup) return;
                setRollbackConfirm({ installation: backupTarget, backup: selectedBackup });
                setBackupTarget(null);
              }}
            >
              <History className="size-3.5" aria-hidden="true" />
              Restore backup
            </Button>
          </>
        }
      >
        {backupsLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-4/5" />
          </div>
        ) : backupsError ? (
          <div className="rounded-lg border border-danger/25 bg-danger/[0.06] px-3 py-2.5">
            <p className="flex items-start gap-2 text-[11px] leading-relaxed text-danger">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {backupsError}
            </p>
            {backupTarget ? (
              <Button variant="secondary" size="sm" className="mt-2" onClick={() => void loadBackups(backupTarget)}>
                Retry
              </Button>
            ) : null}
          </div>
        ) : !backups || backups.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-surface/35 px-4 py-7 text-center">
            <History className="mx-auto size-5 text-muted/50" aria-hidden="true" />
            <p className="mt-2 text-xs font-medium text-text">No backups for this installation</p>
            <p className="mt-1 text-[10px] leading-relaxed text-muted">
              Backups appear here when an install, update or rollback creates one. Until one exists,
              this installation cannot be rolled back.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {backups.map((backup) => {
              const selected = backup.id === selectedBackupId;
              return (
                <button
                  key={backup.id}
                  type="button"
                  onClick={() => setSelectedBackupId(backup.id)}
                  aria-pressed={selected}
                  className={cx(
                    "flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                    selected
                      ? "border-brand/40 bg-brand/[0.07]"
                      : "border-line bg-surface/35 hover:border-brand/25",
                  )}
                >
                  <span
                    className={cx(
                      "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border",
                      selected ? "border-brand bg-brand text-white" : "border-line text-transparent",
                    )}
                    aria-hidden="true"
                  >
                    <span className="size-1.5 rounded-full bg-current" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2 text-[11px] text-text">
                      {backup.versionLabel ?? "Unknown version"}
                      <span className="text-[9px] text-muted/60">{formatDate(backup.createdAt)}</span>
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[9px] text-muted/50" title={backup.path}>
                      {truncateMiddle(backup.path, 84)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={rollbackConfirm !== null}
        onOpenChange={(open) => {
          if (!open) setRollbackConfirm(null);
        }}
        title="Restore this backup?"
        description={
          rollbackConfirm
            ? `${rollbackConfirm.installation.skillName} on ${hostName(rollbackConfirm.installation.host)} will be replaced with ${rollbackConfirm.backup.versionLabel ?? "the selected backup"}.`
            : undefined
        }
        confirmLabel="Restore backup"
        onConfirm={rollback}
      >
        {rollbackConfirm ? (
          <div className="space-y-2 text-[11px] text-muted">
            <p>
              Backup created {formatDate(rollbackConfirm.backup.createdAt)}. The installation record will
              point at this version again after the files are restored.
            </p>
            <p className="break-all rounded-lg border border-line bg-canvas/40 px-3 py-2 font-mono text-[9.5px] text-muted/70">
              {rollbackConfirm.backup.path}
            </p>
            <p className="text-[10px] text-warn">
              Current files in the install folder are replaced. A new backup is created when the backend
              supports it.
            </p>
          </div>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
