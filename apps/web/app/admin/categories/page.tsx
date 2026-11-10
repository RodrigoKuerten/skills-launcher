import { FolderTree } from "lucide-react";
import { db } from "@/lib/db";
import { AddCategoryForm, CategoryEditor } from "@/components/admin-controls";
import { EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminCategoriesPage() {
  const categories = await db.category.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { skills: true } } },
  });

  return (
    <div>
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">Admin / Taxonomy</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Categories</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Imports are classified by deterministic keyword rules. Admins can correct names and descriptions; deleting a
          category requires moving its skills first.
        </p>
      </div>

      <div className="mt-6">
        <AddCategoryForm />
      </div>

      <div className="mt-6 space-y-2">
        {categories.length ? (
          categories.map((category) => (
            <CategoryEditor
              key={category.id}
              id={category.id}
              name={category.name}
              description={category.description}
              skillCount={category._count.skills}
            />
          ))
        ) : (
          <EmptyState icon={<FolderTree className="size-6" />} title="No categories" description="Seed the database or add one above." />
        )}
      </div>
    </div>
  );
}
