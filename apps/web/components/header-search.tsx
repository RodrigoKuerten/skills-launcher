"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { Search } from "lucide-react";

export function HeaderSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const active = document.activeElement?.tagName.toLowerCase();
      if (active === "input" || active === "textarea" || active === "select" || document.activeElement?.getAttribute("contenteditable") === "true") return;
      event.preventDefault();
      inputRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const value = new FormData(event.currentTarget).get("q")?.toString().trim();
        router.push(value ? `/explore?q=${encodeURIComponent(value)}` : "/explore");
      }}
      className="relative hidden w-full max-w-xs lg:block"
      role="search"
    >
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={inputRef}
        name="q"
        type="search"
        placeholder="Search skills…"
        aria-label="Search skills"
        className="h-8 w-full rounded-md border border-border bg-card/70 pl-8 pr-12 text-xs text-foreground placeholder:text-muted-foreground focus:border-accent/50 focus:outline-none"
      />
      <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
        /
      </kbd>
    </form>
  );
}
