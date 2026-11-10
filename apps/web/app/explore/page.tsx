import Link from "next/link";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { HOSTS } from "@skills-hub/core";
import { getCategoriesWithCounts, listSkills, parseCatalogParams } from "@/lib/catalog";
import { SkillCard } from "@/components/skill-card";
import { ButtonLink, EmptyState } from "@/components/ui";
import { CatalogSearch, FilterChip, MobileFilters, SortSelect } from "@/components/explore-controls";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Explore skills",
  description: "Search, filter and sort agent skills by category, compatible host, trust level and quality.",
};

const trustOptions = [
  { value: "OFFICIAL", label: "Official source" },
  { value: "VERIFIED_COMMUNITY", label: "Community verified" },
  { value: "IN_REVIEW", label: "In review" },
  { value: "STALE", label: "Stale" },
  { value: "ARCHIVED", label: "Archived" },
  { value: "UNSAFE", label: "Unsafe signals" },
];

function buildHref(
  current: Record<string, string | string[] | undefined>,
  updates: Record<string, string | undefined>,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(current)) {
    if (key !== "page" && typeof value === "string" && value) params.set(key, value);
  }
  for (const [key, value] of Object.entries(updates)) {
    if (value) params.set(key, value);
    else params.delete(key);
  }
  const qs = params.toString();
  return qs ? `/explore?${qs}` : "/explore";
}

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const params = parseCatalogParams(raw);
  const [result, categories] = await Promise.all([listSkills(params), getCategoriesWithCounts()]);
  const baseQuery = new URLSearchParams(
    Object.entries(raw)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[0] !== "page")
      .map(([key, value]) => [key, value]),
  ).toString();

  const activeFilters = [
    params.category ? { key: "category", label: categories.find((category) => category.slug === params.category)?.name ?? params.category } : null,
    params.host ? { key: "host", label: HOSTS.find((host) => host.id === params.host)?.name ?? params.host } : null,
    params.trust ? { key: "trust", label: trustOptions.find((trust) => trust.value === params.trust)?.label ?? params.trust } : null,
    params.q ? { key: "q", label: `“${params.q}”` } : null,
  ].filter(Boolean) as Array<{ key: string; label: string }>;

  return (
    <div className="container-page py-10">
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">Catalog</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Explore skills</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {result.total.toLocaleString()} published skill{result.total === 1 ? "" : "s"} from verifiable sources.
          </p>
        </div>
        <ButtonLink href="/categories" variant="outline" size="sm">
          Browse categories
        </ButtonLink>
      </div>

      <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
        <aside className="hidden lg:block">
          <div className="sticky top-20 space-y-6">
            <FilterGroup title="Categories">
              <FilterChip href={buildHref(raw, { category: undefined })} active={!params.category}>
                All categories
              </FilterChip>
              {categories.map((category) => (
                <FilterChip
                  key={category.id}
                  href={buildHref(raw, { category: category.slug })}
                  active={params.category === category.slug}
                  count={category._count.skills}
                >
                  {category.name}
                </FilterChip>
              ))}
            </FilterGroup>

            <FilterGroup title="Compatible host">
              <FilterChip href={buildHref(raw, { host: undefined })} active={!params.host}>
                Any host
              </FilterChip>
              {HOSTS.map((host) => (
                <FilterChip
                  key={host.id}
                  href={buildHref(raw, { host: host.id })}
                  active={params.host === host.id}
                >
                  {host.name}
                </FilterChip>
              ))}
            </FilterGroup>

            <FilterGroup title="Trust">
              <FilterChip href={buildHref(raw, { trust: undefined })} active={!params.trust}>
                Any trust level
              </FilterChip>
              {trustOptions.map((option) => (
                <FilterChip
                  key={option.value}
                  href={buildHref(raw, { trust: option.value })}
                  active={params.trust === option.value}
                >
                  {option.label}
                </FilterChip>
              ))}
            </FilterGroup>

            <div className="rounded-lg border border-border bg-card/60 p-3">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Reading the badges</p>
              <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
                Trust describes the source. The scan score describes static findings. They are independent axes.
              </p>
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <CatalogSearch key={baseQuery} initialQuery={params.q} params={baseQuery} />
            <div className="flex flex-wrap items-center gap-2">
              <MobileFilters
                key={baseQuery}
                categories={categories.map((category) => ({ slug: category.slug, name: category.name }))}
                hosts={HOSTS.map((host) => ({ id: host.id, name: host.name }))}
                trust={trustOptions}
                params={baseQuery}
              />
              <SortSelect value={params.sort ?? "quality"} params={baseQuery} />
            </div>
          </div>

          {activeFilters.length ? (
            <div className="mb-4 flex flex-wrap items-center gap-1.5">
              {activeFilters.map((filter) => (
                <Link
                  key={filter.key}
                  href={buildHref(raw, { [filter.key]: undefined })}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  {filter.label}
                  <X className="size-3" />
                </Link>
              ))}
              <Link href="/explore" className="text-[10px] text-accent hover:underline">
                Clear all
              </Link>
            </div>
          ) : null}

          {result.items.length ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {result.items.map((skill) => (
                  <SkillCard key={skill.slug} skill={skill} />
                ))}
              </div>

              {result.pages > 1 ? (
                <nav className="mt-8 flex items-center justify-between" aria-label="Pagination">
                  <PageLink
                    href={buildHref(raw, { page: String(Math.max(1, result.page - 1)) })}
                    disabled={result.page <= 1}
                    direction="previous"
                  />
                  <span className="font-mono text-[11px] text-muted-foreground">
                    page {result.page} / {result.pages}
                  </span>
                  <PageLink
                    href={buildHref(raw, { page: String(Math.min(result.pages, result.page + 1)) })}
                    disabled={result.page >= result.pages}
                    direction="next"
                  />
                </nav>
              ) : null}
            </>
          ) : (
            <EmptyState
              icon={<ChevronLeft className="size-7" />}
              title="No skills match these filters"
              description="Try a broader search, remove a host filter, or clear everything."
              action={
                <ButtonLink href="/explore" variant="outline" size="sm">
                  Clear filters
                </ButtonLink>
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{title}</h2>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function PageLink({ href, disabled, direction }: { href: string; disabled: boolean; direction: "previous" | "next" }) {
  if (disabled) {
    return (
      <span aria-disabled="true" className="inline-flex h-8 cursor-not-allowed items-center gap-1 rounded-md border border-dashed border-border px-3 text-xs text-muted-foreground">
        {direction === "previous" ? <ChevronLeft className="size-3.5" /> : null}
        {direction === "previous" ? "Previous" : "Next"}
        {direction === "next" ? <ChevronRight className="size-3.5" /> : null}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-3 text-xs text-muted-foreground transition-colors hover:border-muted-foreground/30 hover:text-foreground"
    >
      {direction === "previous" ? <ChevronLeft className="size-3.5" /> : null}
      {direction === "previous" ? "Previous" : "Next"}
      {direction === "next" ? <ChevronRight className="size-3.5" /> : null}
    </Link>
  );
}
