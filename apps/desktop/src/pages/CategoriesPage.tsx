import { ArrowRight, Compass, LayoutGrid } from "lucide-react";
import { useAppData } from "../app/app-context";
import { PageHeader } from "../components/layout/PageHeader";
import { SyncAllButton } from "../components/SyncAllButton";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { formatNumber, pluralize } from "../lib/format";
import { categoryIcon } from "../lib/icons";
import { navigate } from "../lib/router";

export default function CategoriesPage() {
  const { bootstrap } = useAppData();
  if (!bootstrap) return null;
  const { categories, stats } = bootstrap;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Catalog"
        title="Categories"
        description="A fixed taxonomy keeps discovery predictable across sources. Counts reflect the local catalog only."
        meta={
          <span>
            {pluralize(categories.length, "category", "categories")} ·{" "}
            {pluralize(stats.skills, "skill")}
          </span>
        }
        actions={
          <Button variant="secondary" size="sm" onClick={() => navigate("explore")}>
            <Compass className="size-3.5" aria-hidden="true" />
            Explore all
          </Button>
        }
      />

      {categories.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title="No categories available"
          description="Categories are seeded with the local database. If this stays empty, the catalog could not initialize."
          action={<SyncAllButton variant="primary" size="md" />}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {categories.map((category) => {
            const Icon = categoryIcon(category.icon);
            return (
              <button
                key={category.slug}
                type="button"
                disabled={category.skillCount === 0}
                onClick={() => navigate("explore", { category: category.slug })}
                className="group relative flex min-h-[132px] flex-col rounded-[13px] border border-line bg-surface/50 p-4 text-left transition-[border-color,background,box-shadow] duration-200 hover:border-brand/35 hover:bg-surface/80 hover:shadow-[0_18px_50px_-32px_rgba(47,107,255,0.65)] disabled:cursor-default disabled:opacity-65 disabled:hover:border-line disabled:hover:bg-surface/50 disabled:hover:shadow-none"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="grid size-9 place-items-center rounded-[10px] border border-line bg-elevated/55 text-brand-soft">
                    <Icon className="size-[17px]" aria-hidden="true" />
                  </span>
                  <span className="text-right">
                    <span className="block text-lg font-semibold leading-none tabular-nums tracking-[-0.03em] text-text">
                      {formatNumber(category.skillCount)}
                    </span>
                    <span className="mt-1 block text-[11px] uppercase tracking-[0.08em] text-muted-soft">
                      {category.skillCount === 1 ? "skill" : "skills"}
                    </span>
                  </span>
                </div>
                <h2 className="mt-4 text-[13px] font-semibold tracking-[-0.01em] text-text">
                  {category.name}
                </h2>
                <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted">
                  {category.description}
                </p>
                <span className="mt-auto flex items-center gap-1 pt-3 text-[11px] font-medium text-muted-soft transition-colors group-hover:text-brand-soft">
                  {category.skillCount > 0 ? "Browse skills" : "No skills yet"}
                  {category.skillCount > 0 ? (
                    <ArrowRight
                      className="size-3 transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="rounded-[13px] border border-line bg-surface/35 px-4 py-3">
        <p className="flex flex-wrap items-center gap-2 text-[11px] leading-relaxed text-muted-soft">
          <LayoutGrid className="size-3.5 shrink-0 text-brand-soft/70" aria-hidden="true" />
          Skills are classified when they are imported. A category can legitimately contain zero skills
          until a source is synced.
        </p>
      </div>
    </div>
  );
}
