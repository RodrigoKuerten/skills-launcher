import { useCallback, useEffect, useRef, useState } from "react";
import { Compass, SearchX, SlidersHorizontal, TriangleAlert } from "lucide-react";
import { useAppData } from "../app/app-context";
import { PageHeader } from "../components/layout/PageHeader";
import { Pagination } from "../components/Pagination";
import { SkillCard } from "../components/SkillCard";
import { SkillDetailSheet } from "../components/SkillDetailSheet";
import { SyncAllButton } from "../components/SyncAllButton";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { SearchInput } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Skeleton } from "../components/ui/Skeleton";
import { Switch } from "../components/ui/Switch";
import { RISK_LEVELS, SKILL_SORTS, TRUST_LEVELS, HOSTS } from "../lib/constants";
import { errorMessage, formatNumber, pluralize } from "../lib/format";
import { ipc } from "../lib/ipc";
import { navigate } from "../lib/router";
import type { SkillPage, SkillQuery, SkillSort } from "../lib/types";

export interface ExplorePageProps {
  params: URLSearchParams;
}

const PAGE_SIZE = 18;

export default function ExplorePage({ params }: ExplorePageProps) {
  const { bootstrap, revision, refresh } = useAppData();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [debouncedQ, setDebouncedQ] = useState((params.get("q") ?? "").trim());
  const [category, setCategory] = useState(params.get("category") ?? "");
  const [sourceId, setSourceId] = useState(params.get("source") ?? "");
  const [host, setHost] = useState(params.get("host") ?? "");
  const [trust, setTrust] = useState("");
  const [risk, setRisk] = useState("");
  const [sort, setSort] = useState<SkillSort>("quality");
  const [includeBlocked, setIncludeBlocked] = useState(params.get("blocked") === "1");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<SkillPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const requestId = useRef(0);
  const paramKey = useRef(params.toString());

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(q.trim()), 240);
    return () => window.clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    if (paramKey.current === params.toString()) return;
    paramKey.current = params.toString();
    setQ(params.get("q") ?? "");
    setDebouncedQ((params.get("q") ?? "").trim());
    setCategory(params.get("category") ?? "");
    setSourceId(params.get("source") ?? "");
    setHost(params.get("host") ?? "");
    setIncludeBlocked(params.get("blocked") === "1");
    setPage(1);
  }, [params]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, category, sourceId, host, trust, risk, sort, includeBlocked]);

  const load = useCallback(async () => {
    const request = ++requestId.current;
    setLoading(true);
    setFetchError(null);
    const query: SkillQuery = {
      page,
      pageSize: PAGE_SIZE,
      sort,
      includeBlocked,
    };
    if (debouncedQ) query.q = debouncedQ;
    if (category) query.category = category;
    if (sourceId) query.sourceId = sourceId;
    if (host) query.host = host;
    if (trust) query.trust = trust;
    if (risk) query.risk = risk;
    try {
      const result = await ipc.listSkills(query);
      if (requestId.current !== request) return;
      setData(result);
    } catch (reason) {
      if (requestId.current !== request) return;
      setData(null);
      setFetchError(errorMessage(reason, "Could not query the local catalog."));
    } finally {
      if (requestId.current === request) setLoading(false);
    }
  }, [page, sort, includeBlocked, debouncedQ, category, sourceId, host, trust, risk, revision]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!bootstrap) return null;
  const stats = bootstrap.stats;
  const sources = bootstrap.sources;
  const categoryNames = new Map(bootstrap.categories.map((item) => [item.slug, item.name]));
  const activeFilters = [debouncedQ, category, sourceId, host, trust, risk].filter(Boolean).length;
  const hasFilters = activeFilters > 0;
  const hiddenBlocked = !includeBlocked && stats.blockedSkills > 0;
  const catalogEmpty = data?.total === 0 && !hasFilters && stats.skills === 0;

  const reset = () => {
    setQ("");
    setDebouncedQ("");
    setCategory("");
    setSourceId("");
    setHost("");
    setTrust("");
    setRisk("");
    setSort("quality");
    setIncludeBlocked(false);
    setPage(1);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Catalog"
        title="Explore"
        description="Search the skills imported from your sources. Filters only touch the local catalog."
        meta={
          <span>
            {pluralize(stats.skills, "skill")} indexed · {pluralize(sources.length, "source")}
          </span>
        }
        actions={<SyncAllButton variant="secondary" size="sm" label="Sync sources" />}
      />

      <section className="rounded-[14px] border border-line bg-surface/45 p-3">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
          <SearchInput
            id="explore-search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            onClear={() => setQ("")}
            placeholder="Search by name, summary, author…"
            aria-label="Search skills"
            aria-keyshortcuts="Control+K Meta+K"
            containerClassName="flex-1"
            className="h-10"
          />
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-10 items-center gap-2 rounded-[10px] border border-line bg-surface/80 px-3">
              <Switch
                checked={includeBlocked}
                onCheckedChange={setIncludeBlocked}
                label="Include quarantined and blocked skills"
              />
              <span className="text-[11px] text-muted">
                Include blocked
                {stats.blockedSkills > 0 ? (
                  <span className="ml-1 text-[10px] tabular-nums text-muted/60">
                    ({stats.blockedSkills})
                  </span>
                ) : null}
              </span>
            </div>
            <Select
              value={sort}
              onChange={(event) => setSort(event.target.value as SkillSort)}
              options={SKILL_SORTS.map((option) => ({ value: option.value, label: option.label }))}
              aria-label="Sort skills"
              className="w-40"
            />
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="flex size-10 items-center justify-center rounded-[10px] border border-line bg-surface/40 text-muted/60">
            <SlidersHorizontal className="size-3.5" aria-hidden="true" />
          </span>
          <Select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            options={bootstrap.categories.map((item) => ({
              value: item.slug,
              label: `${item.name}${item.skillCount > 0 ? ` (${item.skillCount})` : ""}`,
            }))}
            placeholder="All categories"
            aria-label="Filter by category"
            className="w-40"
          />
          <Select
            value={sourceId}
            onChange={(event) => setSourceId(event.target.value)}
            options={sources.map((source) => ({ value: source.id, label: source.name }))}
            placeholder="All sources"
            aria-label="Filter by source"
            className="w-44"
          />
          <Select
            value={host}
            onChange={(event) => setHost(event.target.value)}
            options={HOSTS.map((item) => ({ value: item.id, label: item.name }))}
            placeholder="Any agent"
            aria-label="Filter by agent host"
            className="w-40"
          />
          <Select
            value={trust}
            onChange={(event) => setTrust(event.target.value)}
            options={TRUST_LEVELS.map((option) => ({ value: option.value, label: option.label }))}
            placeholder="Any trust"
            aria-label="Filter by trust"
            className="w-32"
          />
          <Select
            value={risk}
            onChange={(event) => setRisk(event.target.value)}
            options={RISK_LEVELS.map((option) => ({ value: option.value, label: option.label }))}
            placeholder="Any risk"
            aria-label="Filter by risk"
            className="w-32"
          />
          {activeFilters > 0 || includeBlocked ? (
            <Button variant="ghost" size="sm" onClick={reset}>
              Clear filters
            </Button>
          ) : null}
        </div>
      </section>

      <div className="flex min-h-5 items-center justify-between gap-3">
        <p className="text-[11px] text-muted" aria-live="polite">
          {loading && !data
            ? "Reading the catalog…"
            : data
              ? `${formatNumber(data.total)} ${data.total === 1 ? "skill" : "skills"}${hasFilters ? " matching these filters" : ""}`
              : ""}
        </p>
        {loading && data ? (
          <span className="flex items-center gap-1.5 text-[10px] text-muted">
            <span className="size-1.5 animate-soft-pulse rounded-full bg-brand" aria-hidden="true" />
            Updating results
          </span>
        ) : null}
      </div>

      {fetchError ? (
        <EmptyState
          icon={TriangleAlert}
          title="Could not load the catalog"
          description={fetchError}
          action={
            <Button variant="secondary" onClick={() => void load()}>
              Retry
            </Button>
          }
        />
      ) : loading && !data ? (
        <ExploreSkeleton />
      ) : data && data.items.length === 0 ? (
        catalogEmpty ? (
          <EmptyState
            icon={Compass}
            title="Your catalog is empty"
            description="Sync a source to import Agent Skills into the local catalog. Skills are never invented or preloaded."
            action={
              <>
                <SyncAllButton variant="primary" size="md" label="Sync all sources" />
                <Button variant="secondary" size="md" onClick={() => navigate("sources")}>
                  Manage sources
                </Button>
              </>
            }
            hint={
              sources.length > 0
                ? "The seeded sources are ready. Run a sync to populate Explore."
                : "Add a GitHub repository, local folder or HTTP JSON catalog first."
            }
          />
        ) : (
          <EmptyState
            icon={SearchX}
            title="No skills match these filters"
            description="Try a broader query, a different category or clear the advanced filters."
            action={
              <Button variant="secondary" onClick={reset}>
                Clear filters
              </Button>
            }
            hint={
              hiddenBlocked
                ? `${formatNumber(stats.blockedSkills)} quarantined or high-risk skills are hidden. Enable “Include blocked” to review them.`
                : undefined
            }
          />
        )
      ) : data ? (
        <>
          <div
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
            aria-busy={loading}
            style={{ opacity: loading ? 0.65 : 1 }}
          >
            {data.items.map((skill) => (
              <SkillCard
                key={skill.id}
                skill={skill}
                categoryLabel={skill.category ? (categoryNames.get(skill.category) ?? skill.category) : undefined}
                onOpen={setSelectedId}
              />
            ))}
          </div>
          <div className="border-t border-line pt-4">
            <Pagination page={data.page} pages={data.pages} total={data.total} onPageChange={setPage} />
          </div>
        </>
      ) : null}

      <SkillDetailSheet
        skillId={selectedId}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        onChanged={() => void refresh()}
      />
    </div>
  );
}

function ExploreSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="h-[214px] rounded-[13px] border border-line bg-surface/45 p-4">
          <div className="flex items-center gap-2">
            <Skeleton className="size-3 rounded" />
            <Skeleton className="h-2.5 w-24" />
            <Skeleton className="ml-auto h-4 w-16" />
          </div>
          <Skeleton className="mt-4 h-4 w-3/4" />
          <Skeleton className="mt-3 h-2.5 w-full" />
          <Skeleton className="mt-2 h-2.5 w-5/6" />
          <div className="mt-4 flex gap-2">
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="mt-6 flex items-center justify-between border-t border-line/70 pt-3">
            <Skeleton className="h-2.5 w-24" />
            <Skeleton className="h-2.5 w-10" />
          </div>
        </div>
      ))}
    </div>
  );
}
