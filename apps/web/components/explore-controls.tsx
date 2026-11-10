"use client";

import { useRouter } from "next/navigation";
import { Search, SlidersHorizontal } from "lucide-react";
import { sortOptions } from "@/lib/catalog";
import { cn } from "@/lib/utils";
import { useState } from "react";

function withParams(base: string, updates: Record<string, string | null>): string {
  const next = new URLSearchParams(base);
  for (const [key, value] of Object.entries(updates)) {
    if (value) next.set(key, value);
    else next.delete(key);
  }
  next.delete("page");
  const qs = next.toString();
  return qs ? `/explore?${qs}` : "/explore";
}

export function CatalogSearch({ initialQuery, params }: { initialQuery?: string; params: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery ?? "");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    router.push(withParams(params, { q: value.trim() || null }));
  }

  return (
    <form onSubmit={submit} className="relative min-w-0 flex-1" role="search">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        type="search"
        placeholder="Search by name, description or author…"
        aria-label="Search skills"
        className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/15"
      />
    </form>
  );
}

export function SortSelect({ value, params }: { value: string; params: string }) {
  const router = useRouter();

  return (
    <div className="flex items-center gap-1.5">
      <SlidersHorizontal className="hidden size-3.5 text-muted-foreground sm:block" />
      <select
        value={value}
        aria-label="Sort skills"
        onChange={(event) => router.push(withParams(params, { sort: event.target.value }))}
        className="h-9 rounded-lg border border-border bg-card px-2 text-xs text-foreground focus:border-accent/60 focus:outline-none"
      >
        {sortOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function MobileFilters({
  categories,
  hosts,
  trust,
  params,
}: {
  categories: Array<{ slug: string; name: string }>;
  hosts: Array<{ id: string; name: string }>;
  trust: Array<{ value: string; label: string }>;
  params: string;
}) {
  const router = useRouter();

  function update(key: string, value: string) {
    router.push(withParams(params, { [key]: value || null }));
  }

  const current = new URLSearchParams(params);
  const selectClass = "h-9 w-full min-w-0 rounded-lg border border-border bg-card px-2 text-xs sm:max-w-[140px]";
  return (
    <div className="grid w-full grid-cols-2 gap-1.5 sm:flex sm:w-auto lg:hidden">
      <select aria-label="Category" defaultValue={current.get("category") ?? ""} onChange={(event) => update("category", event.target.value)} className={selectClass}>
        <option value="">All categories</option>
        {categories.map((category) => (
          <option key={category.slug} value={category.slug}>
            {category.name}
          </option>
        ))}
      </select>
      <select aria-label="Compatible host" defaultValue={current.get("host") ?? ""} onChange={(event) => update("host", event.target.value)} className={selectClass}>
        <option value="">Any host</option>
        {hosts.map((host) => (
          <option key={host.id} value={host.id}>
            {host.name}
          </option>
        ))}
      </select>
      <select aria-label="Trust level" defaultValue={current.get("trust") ?? ""} onChange={(event) => update("trust", event.target.value)} className={selectClass}>
        <option value="">Any trust</option>
        {trust.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function FilterChip({
  href,
  active,
  children,
  count,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <a
      href={href}
      className={cn(
        "flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
        active ? "bg-accent-soft font-medium text-accent" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <span className="truncate">{children}</span>
      {count != null ? <span className="font-mono text-[10px] text-muted-foreground">{count}</span> : null}
    </a>
  );
}
