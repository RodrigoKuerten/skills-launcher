import { useState } from "react";
import { FolderGit2, Info, SearchX } from "lucide-react";
import { useAppData } from "../app/app-context";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { PageHeader } from "../components/layout/PageHeader";
import { SourceRow } from "../components/SourceRow";
import { SourceFormDialog } from "../components/sources/SourceFormDialog";
import { SourceTransferDialog } from "../components/sources/SourceTransferDialog";
import { SyncAllButton } from "../components/SyncAllButton";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { SearchInput } from "../components/ui/Input";
import { Tabs } from "../components/ui/Tabs";
import { useToast } from "../components/ui/Toast";
import { errorMessage, formatNumber, pluralize, sourceHealth } from "../lib/format";
import { ipc } from "../lib/ipc";
import type { Source } from "../lib/types";

const HEALTH_ORDER = { error: 0, never: 1, ok: 2, disabled: 3 } as const;

type Filter = "all" | "healthy" | "failed" | "disabled";

export default function SourcesPage() {
  const { bootstrap, refresh } = useAppData();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [formSeed, setFormSeed] = useState<{ source: Source | null } | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Source | null>(null);

  if (!bootstrap) return null;
  const sources = bootstrap.sources;
  const healthy = sources.filter((source) => sourceHealth(source) === "ok").length;
  const failed = sources.filter((source) => sourceHealth(source) === "error").length;
  const disabled = sources.filter((source) => !source.enabled).length;

  const filtered = sources
    .filter((source) => {
      if (filter === "healthy" && sourceHealth(source) !== "ok") return false;
      if (filter === "failed" && sourceHealth(source) !== "error") return false;
      if (filter === "disabled" && source.enabled) return false;
      if (query) {
        const needle = query.toLowerCase();
        const haystack = `${source.name} ${source.url} ${source.author} ${source.description}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    })
    .sort((a, b) => HEALTH_ORDER[sourceHealth(a)] - HEALTH_ORDER[sourceHealth(b)]);

  const syncOne = async (source: Source) => {
    if (syncingId) return;
    setSyncingId(source.id);
    try {
      const summary = await ipc.syncSource(source.id);
      if (summary.error) {
        toast.error(`${source.name} finished with an error`, summary.error);
      } else {
        toast.success(
          `${source.name} synced`,
          `${formatNumber(summary.found)} found · ${formatNumber(summary.created)} new · ${formatNumber(summary.updated)} updated · ${formatNumber(summary.blocked)} blocked`,
        );
      }
      await refresh();
    } catch (reason) {
      toast.error(`Could not sync ${source.name}`, errorMessage(reason));
    } finally {
      setSyncingId(null);
    }
  };

  const toggle = async (source: Source, enabled: boolean) => {
    if (togglingId) return;
    setTogglingId(source.id);
    try {
      await ipc.setSourceEnabled(source.id, enabled);
      toast.success(
        enabled ? "Source enabled" : "Source disabled",
        `${source.name} will ${enabled ? "now be included in syncs" : "no longer sync"}.`,
      );
      await refresh();
    } catch (reason) {
      toast.error("Could not change source state", errorMessage(reason));
    } finally {
      setTogglingId(null);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    await ipc.deleteSource(deleteTarget.id);
    toast.success("Source removed", `${deleteTarget.name} was removed from the catalog. Installed files were untouched.`);
    await refresh();
  };

  const hasFilter = Boolean(query) || filter !== "all";

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="System"
        title="Sources"
        description="Repositories, folders and catalogs that feed the local skill index. Trust labels are set by you and shown in the catalog."
        meta={
          <span>
            {pluralize(sources.length, "source")} · {formatNumber(bootstrap.stats.enabledSources)} enabled
          </span>
        }
        actions={
          <>
            <SyncAllButton variant="secondary" size="sm" />
            <Button variant="secondary" size="sm" onClick={() => setTransferOpen(true)}>
              Import / export
            </Button>
            <Button variant="primary" size="sm" onClick={() => setFormSeed({ source: null })}>
              Add source
            </Button>
          </>
        }
      />

      <Tabs
        tabs={[
          { id: "all", label: "All", count: sources.length },
          { id: "healthy", label: "Healthy", count: healthy },
          { id: "failed", label: "Failed", count: failed },
          { id: "disabled", label: "Disabled", count: disabled },
        ]}
        value={filter}
        onChange={(value) => setFilter(value as Filter)}
        trailing={
          <SearchInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onClear={() => setQuery("")}
            placeholder="Find a source…"
            aria-label="Search sources"
            containerClassName="w-52"
            className="h-8 text-xs"
          />
        }
      />

      {sources.length === 0 ? (
        <EmptyState
          icon={FolderGit2}
          title="No sources configured"
          description="Add a GitHub repository, a local folder, a ZIP archive or an HTTP JSON catalog. Every skill keeps provenance from its source."
          action={
            <Button variant="primary" onClick={() => setFormSeed({ source: null })}>
              Add source
            </Button>
          }
          hint="Local and ZIP sources must be selected with the native picker."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title={hasFilter ? "No sources match this view" : "No sources in this health group"}
          description="Change the filter or clear the search to see the full source list."
          action={
            hasFilter ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
              >
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-[14px] border border-line bg-surface/45">
          {filtered.map((source) => (
            <SourceRow
              key={source.id}
              source={source}
              syncing={syncingId === source.id}
              toggling={togglingId === source.id}
              onSync={() => void syncOne(source)}
              onEdit={() => setFormSeed({ source })}
              onDelete={() => setDeleteTarget(source)}
              onToggle={(enabled) => void toggle(source, enabled)}
            />
          ))}
        </div>
      )}

      <div className="flex items-start gap-2 rounded-[13px] border border-line bg-surface/30 px-4 py-3 text-[10px] leading-relaxed text-muted/65">
        <Info className="mt-0.5 size-3.5 shrink-0 text-brand-soft/60" aria-hidden="true" />
        Source deletion is a soft delete: the record stops appearing in the catalog, while skills
        already installed into agents stay where they are. Remote sync errors are explicit and never
        replaced with sample data.
      </div>

      {formSeed ? (
        <SourceFormDialog
          source={formSeed.source}
          onClose={() => setFormSeed(null)}
          onSaved={() => void refresh()}
        />
      ) : null}

      {transferOpen ? (
        <SourceTransferDialog
          onClose={() => setTransferOpen(false)}
          onImported={() => void refresh()}
        />
      ) : null}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={`Remove ${deleteTarget?.name ?? "source"}?`}
        description="The source is soft-deleted from this catalog. Installed skills and their files are not touched."
        confirmLabel="Remove source"
        onConfirm={remove}
      >
        <div className="space-y-2 text-[11px] leading-relaxed text-muted">
          <p>
            Skills that came from this source remain in the local database with their provenance. The
            source stops syncing and disappears from the Sources list.
          </p>
          {deleteTarget ? (
            <p className="break-all rounded-lg border border-line bg-canvas/40 px-3 py-2 font-mono text-[9.5px] text-muted/70">
              {deleteTarget.url}
            </p>
          ) : null}
        </div>
      </ConfirmDialog>
    </div>
  );
}
