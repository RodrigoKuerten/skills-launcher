import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { db } from "@/lib/db";
import { formatNumber } from "@/lib/utils";
import { SkillGlyph } from "@/components/skill-glyph";
import { ButtonLink, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export const metadata = { title: "Categories" };

export default async function CategoriesPage() {
  const categories = await db.category.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      _count: { select: { skills: { where: { status: "ACTIVE" } } } },
      skills: {
        where: { status: "ACTIVE" },
        orderBy: [{ qualityScore: "desc" }, { stars: "desc" }],
        take: 3,
        select: { name: true, slug: true },
      },
    },
  });

  return (
    <div className="container-page py-12">
      <div className="max-w-2xl">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">Browse</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Categories</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Every skill is classified by its primary job. Categories are curated by admins; classification starts with
          deterministic keyword rules and is corrected on review.
        </p>
      </div>

      {categories.length ? (
        <div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => (
            <Link
              key={category.id}
              href={`/explore?category=${category.slug}`}
              className="group relative overflow-hidden rounded-xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-accent/30"
            >
              <div className="flex items-start justify-between">
                <SkillGlyph slug={category.slug} category={category.slug} />
                <span className="rounded-full border border-border bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                  {category._count.skills} skills
                </span>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <h2 className="text-sm font-semibold group-hover:text-accent">{category.name}</h2>
                <ArrowRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
              </div>
              <p className="mt-1.5 line-clamp-2 min-h-8 text-xs leading-relaxed text-muted-foreground">
                {category.description}
              </p>
              <div className="mt-4 border-t border-border/60 pt-3">
                {category.skills.length ? (
                  <ul className="space-y-1">
                    {category.skills.map((skill) => (
                      <li key={skill.slug} className="truncate text-[11px] text-muted-foreground">
                        {skill.name}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[11px] text-muted-foreground">No published skills yet.</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="mt-9">
          <EmptyState
            title="No categories yet"
            description="Seed the database to create the core taxonomy."
            action={<ButtonLink href="/admin">Open admin</ButtonLink>}
          />
        </div>
      )}

      <div className="mt-10 flex items-center justify-between rounded-xl border border-border bg-card p-5">
        <div>
          <p className="text-sm font-medium">Not sure where to start?</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Browse the highest-quality skills across every category.
          </p>
        </div>
        <ButtonLink href="/explore?sort=quality" size="sm">
          Best quality
        </ButtonLink>
      </div>
      <p className="mt-4 font-mono text-[10px] text-muted-foreground">
        {formatNumber(categories.reduce((total, category) => total + category._count.skills, 0))} published skills across{" "}
        {categories.length} categories
      </p>
    </div>
  );
}
