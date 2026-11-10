import { useState, type FormEvent } from "react";
import {
  Activity,
  ArrowRight,
  ArrowUpCircle,
  Boxes,
  FolderGit2,
  PackageCheck,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { useAppData } from "../app/app-context";
import { SyncAllButton } from "../components/SyncAllButton";
import { SourceRow } from "../components/SourceRow";
import { Stat } from "../components/Stat";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { SearchInput } from "../components/ui/Input";
import { useToast } from "../components/ui/Toast";
import { SOURCE_KIND_LABEL, hostName } from "../lib/constants";
import { cx } from "../lib/cx";
import {
  errorMessage,
  formatDate,
  formatNumber,
  formatRelative,
  humanizeStatus,
  operationLabel,
  pluralize,
  sourceHealth,
} from "../lib/format";
import { operationIcon, sourceKindIcon } from "../lib/icons";
import { ipc } from "../lib/ipc";
import { navigate } from "../lib/router";
import type { Source } from "../lib/types";

const HEALTH_ORDER = { error: 0, never: 1, ok: 2, disabled: 3 } as const;

export default function HomePage() {
  const { bootstrap, refresh } = useAppData();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [syncingId, setSyncingId] = useState<string | null>(null);

  if (!bootstrap) return null;
  const { stats, sources, categories, recentOperations } = bootstrap;
  const official = sources.filter((source) => source.trust === "OFFICIAL");
  const sortedSources = [...sources].sort(
    (a, b) => HEALTH_ORDER[sourceHealth(a)] - HEALTH_ORDER[sourceHealth(b)],
  );
  const hasSkills = stats.skills > 0;

  const search = (event: FormEvent) => {
    event.preventDefault();
    navigate("explore", { q: query.trim() || undefined });
  };

  const syncOne = async (source: Source) => {
    if (syncingId) return;
    setSyncingId(source.id);
    try {
      const summary = await ipc.syncSource(source.id);
      if (summary.error) {
        toast.error("Source sync finished with an error", summary.error);
      } else {
        toast.success(
          `${source.name} synced`,
          `${formatNumber(summary.found)} found · ${formatNumber(summary.created)} new · ${formatNumber(summary.updated)} updated`,
        );
      }
      await refresh();
    } catch (reason) {
      toast.error(`Could not sync ${source.name}`, errorMessage(reason));
    } finally {
      setSyncingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[18px] border border-line bg-panel/70">
        <div className="hero-grid pointer-events-none absolute inset-0" aria-hidden="true" />
        <div
          className="pointer-events-none absolute -right-24 -top-32 size-[420px] rounded-full bg-brand/15 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-40 left-1/3 h-64 w-[480px] rounded-full bg-cyan/[0.06] blur-3xl"
          aria-hidden="true"
        />

        <div className="relative grid items-center gap-8 px-6 py-8 sm:px-8 sm:py-10 xl:grid-cols-[minmax(0,1fr)_260px]">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-brand-soft/85">
              <span className="size-1.5 rounded-full bg-brand shadow-[0_0_10px_rgba(47,107,255,0.8)]" aria-hidden="true" />
              Local-first skill catalog
            </p>
            <h1 className="mt-3 max-w-xl text-[30px] font-semibold leading-[1.08] tracking-[-0.04em] text-text sm:text-[36px]">
              One library for <span className="brand-gradient-text">every AI agent</span>
            </h1>
            <p className="mt-3 max-w-xl text-[12.5px] leading-relaxed text-muted">
              Discover, inspect and install Agent Skills from sources you choose. Provenance, risk
              signals and local agent paths stay on this machine.
            </p>

            <form onSubmit={search} className="mt-6 flex max-w-2xl flex-col gap-2 sm:flex-row">
              <SearchInput
                id="home-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search skills, authors or categories…"
                aria-label="Search the skill catalog"
                containerClassName="flex-1"
                className="h-12 rounded-[11px] border-line bg-canvas/55 pl-10 text-sm"
              />
              <Button type="submit" variant="primary" size="lg" className="h-12 px-5">
                Search catalog
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            </form>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] text-muted/70">
              <span className="inline-flex items-center gap-1.5">
                <Sparkles className="size-3 text-brand-soft/70" aria-hidden="true" />
                {hasSkills
                  ? `${pluralize(stats.skills, "skill")} indexed from ${pluralize(stats.sources, "source")}`
                  : "The catalog is ready for its first sync"}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <FolderGit2 className="size-3 text-muted/60" aria-hidden="true" />
                {pluralize(stats.categories, "category", "categories")}
              </span>
            </div>
          </div>

          <div className="relative hidden justify-center xl:flex">
            <div className="absolute inset-0 rounded-full bg-brand/10 blur-2xl" aria-hidden="true" />
            <div className="relative flex flex-col items-center">
              <div className="relative grid size-40 place-items-center rounded-[32px] border border-line/80 bg-surface/40">
                <div
                  className="absolute inset-4 rounded-full border border-dashed border-brand/20"
                  aria-hidden="true"
                />
                <img
                  src="/logo.png"
                  alt=""
                  className="relative size-24 rounded-[22px] shadow-[0_0_60px_-8px_rgba(47,107,255,0.45)] ring-1 ring-white/10"
                />
                <span className="absolute -right-2 top-5 rounded-md border border-line bg-elevated px-2 py-1 text-[9px] font-medium text-muted">
                  {formatNumber(stats.enabledSources)} live
                </span>
              </div>
              <p className="mt-4 text-[9px] font-semibold uppercase tracking-[0.18em] text-muted/50">
                Local · private · yours
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[14px] border border-line bg-surface/45 px-5 py-4">
        <div className="grid grid-cols-2 gap-x-5 gap-y-5 sm:grid-cols-3 xl:grid-cols-5">
          <Stat
            icon={FolderGit2}
            label="Sources"
            value={stats.sources}
            hint={`${formatNumber(stats.enabledSources)} enabled`}
          />
          <Stat
            icon={Boxes}
            label="Catalog skills"
            value={stats.skills}
            hint={pluralize(stats.categories, "category", "categories")}
            tone="brand"
          />
          <Stat
            icon={PackageCheck}
            label="Installed"
            value={stats.installed}
            hint="Across detected agents"
            tone={stats.installed > 0 ? "ok" : "muted"}
          />
          <Stat
            icon={ArrowUpCircle}
            label="Updates"
            value={stats.updates}
            hint={stats.updates > 0 ? "Ready to apply" : "Nothing pending"}
            tone={stats.updates > 0 ? "warn" : "ok"}
          />
          <Stat
            icon={ShieldAlert}
            label="Blocked"
            value={stats.blockedSkills}
            hint="Quarantined or high risk"
            tone={stats.blockedSkills > 0 ? "danger" : "muted"}
          />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,1fr)]">
        <div className="space-y-6">
          <section className="overflow-hidden rounded-[14px] border border-line bg-surface/45">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/70 px-4 py-3">
              <div>
                <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-text">Source health</h2>
                <p className="mt-0.5 text-[10px] text-muted">
                  {sources.length > 0
                    ? stats.lastSyncAt
                      ? `Last sync ${formatRelative(stats.lastSyncAt)}`
                      : "No catalog sync has run yet"
                    : "Connect a repository, folder or catalog"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <SyncAllButton variant="primary" size="sm" />
                <Button variant="ghost" size="sm" onClick={() => navigate("sources")}>
                  Manage
                </Button>
              </div>
            </div>
            {sortedSources.length === 0 ? (
              <EmptyState
                compact
                className="m-4"
                icon={FolderGit2}
                title="No catalog sources yet"
                description="Add a GitHub repository, a local folder or an HTTP JSON catalog to start building your library."
                action={
                  <Button variant="primary" size="sm" onClick={() => navigate("sources")}>
                    Add source
                  </Button>
                }
              />
            ) : (
              <div>
                {sortedSources.slice(0, 6).map((source) => (
                  <SourceRow
                    key={source.id}
                    source={source}
                    compact
                    syncing={syncingId === source.id}
                    onSync={() => void syncOne(source)}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-[14px] border border-line bg-surface/45">
            <div className="flex items-center justify-between gap-3 border-b border-line/70 px-4 py-3">
              <div>
                <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-text">
                  Recent operations
                </h2>
                <p className="mt-0.5 text-[10px] text-muted">The local operation journal</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => navigate("activity")}>
                View all
              </Button>
            </div>
            {recentOperations.length === 0 ? (
              <div className="px-4 py-7 text-center">
                <Activity className="mx-auto size-5 text-muted/50" aria-hidden="true" />
                <p className="mt-2 text-xs text-muted">No operations recorded yet.</p>
                <p className="mt-1 text-[10px] text-muted/60">
                  Syncs, installs, updates and settings changes will appear here.
                </p>
              </div>
            ) : (
              <div>
                {recentOperations.slice(0, 5).map((operation) => {
                  const Icon = operationIcon(operation.kind);
                  const tone =
                    operation.status === "success"
                      ? "ok"
                      : operation.status === "error"
                        ? "danger"
                        : "neutral";
                  return (
                    <div
                      key={operation.id}
                      className="flex items-start gap-3 border-b border-line/60 px-4 py-2.5 last:border-b-0"
                    >
                      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border border-line bg-elevated/45 text-brand-soft/80">
                        <Icon className="size-3.5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] font-medium text-text">
                            {operationLabel(operation.kind)}
                          </span>
                          {operation.host ? (
                            <Badge tone="neutral">{hostName(operation.host)}</Badge>
                          ) : null}
                          <Badge tone={tone}>{humanizeStatus(operation.status)}</Badge>
                        </div>
                        {operation.detail ? (
                          <p className="mt-0.5 line-clamp-1 text-[10px] text-muted">{operation.detail}</p>
                        ) : null}
                      </div>
                      <time
                        className="shrink-0 pt-0.5 text-[9px] text-muted/60"
                        dateTime={operation.createdAt}
                        title={formatDate(operation.createdAt)}
                      >
                        {formatRelative(operation.createdAt)}
                      </time>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section className="overflow-hidden rounded-[14px] border border-line bg-surface/45">
            <div className="flex items-center justify-between gap-3 border-b border-line/70 px-4 py-3">
              <div>
                <h2 className="flex items-center gap-2 text-[13px] font-semibold tracking-[-0.01em] text-text">
                  Official sources
                  <Badge tone="brand">Recommended</Badge>
                </h2>
                <p className="mt-0.5 text-[10px] text-muted">Maintained by the skill publishers</p>
              </div>
            </div>
            {official.length === 0 ? (
              <div className="px-4 py-7 text-center">
                <p className="text-xs text-muted">No official sources are configured.</p>
                <Button variant="ghost" size="sm" className="mt-2" onClick={() => navigate("sources")}>
                  Add a source
                </Button>
              </div>
            ) : (
              <div>
                {official.map((source) => (
                  <OfficialSourceRow key={source.id} source={source} />
                ))}
              </div>
            )}
            <div className="border-t border-line/70 p-3">
              <Button size="sm" variant="secondary" className="w-full" onClick={() => navigate("sources")}>
                Add another source
              </Button>
            </div>
          </section>

          <section className="rounded-[14px] border border-line bg-surface/45 p-4">
            <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-text">How it works</h2>
            <ol className="mt-3 space-y-3">
              {[
                ["Import", "Point a source at skills you trust. Every skill keeps its provenance."],
                ["Inspect", "Read the README, scan findings, license and host compatibility before installing."],
                ["Install", "The backend writes into detected agent folders and keeps a backup for rollback."],
              ].map(([title, body], index) => (
                <li key={title} className="flex gap-3">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-brand/25 bg-brand/10 font-mono text-[9px] text-brand-soft">
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-[11px] font-medium text-text">{title}</p>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-muted">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-line bg-canvas/40 px-2.5 py-2 text-[10px] text-muted">
              <ShieldAlert className="size-3 shrink-0 text-brand-soft/70" aria-hidden="true" />
              Imported code is never executed by Skills Launcher.
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function OfficialSourceRow({ source }: { source: Source }) {
  const Icon = sourceKindIcon(source.kind);
  const health = sourceHealth(source);
  return (
    <button
      type="button"
      onClick={() => navigate("explore", { source: source.id })}
      className="group flex w-full items-start gap-3 border-b border-line/60 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-text/[0.025]"
    >
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-elevated/60 text-brand-soft/85">
        <Icon className="size-3.5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[11.5px] font-medium text-text">{source.name}</span>
          <span
            className={cx(
              "ml-auto size-1.5 shrink-0 rounded-full",
              health === "ok" ? "bg-ok" : health === "error" ? "bg-danger" : health === "disabled" ? "bg-muted/50" : "bg-warn",
            )}
            aria-hidden="true"
          />
        </span>
        <span className="mt-0.5 line-clamp-1 block text-[10px] text-muted">
          {source.description || SOURCE_KIND_LABEL[source.kind]}
        </span>
        <span className="mt-1 block text-[9px] text-muted/60">
          {pluralize(source.skillCount, "skill")} · {source.lastSyncAt ? `synced ${formatRelative(source.lastSyncAt)}` : "not synced"}
        </span>
      </span>
      <ArrowRight
        className="mt-1 size-3.5 shrink-0 text-muted/30 transition-colors group-hover:text-brand-soft"
        aria-hidden="true"
      />
    </button>
  );
}
