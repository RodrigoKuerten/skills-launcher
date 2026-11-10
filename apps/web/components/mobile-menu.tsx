"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LayoutGrid, LogOut, UserRound, X } from "lucide-react";

type NavUser = { name: string; role: string } | null;

export function MobileMenu({
  links,
  user,
}: {
  links: Array<{ href: string; label: string }>;
  user: NavUser;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onClick(event: MouseEvent) {
      if (container.current && !container.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <div className="relative md:hidden" ref={container}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        className="flex size-9 items-center justify-center rounded-md border border-border text-muted-foreground"
      >
        {open ? <X className="size-4" /> : <LayoutGrid className="size-4" />}
      </button>
      {open ? (
        <div id="mobile-menu" className="absolute right-0 top-11 w-52 rounded-lg border border-border bg-card p-1.5 shadow-2xl">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="block rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
          <div className="my-1 border-t border-border" />
          {user ? (
            <>
              <Link
                href="/profile"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <UserRound className="size-4" /> {user.name}
              </Link>
              {user.role === "ADMIN" ? (
                <Link
                  href="/admin"
                  onClick={() => setOpen(false)}
                  className="block rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  Admin
                </Link>
              ) : null}
              <form action="/api/auth/logout" method="post">
                <button
                  type="submit"
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <LogOut className="size-4" /> Sign out
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="block rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Sign in
            </Link>
          )}
        </div>
      ) : null}
    </div>
  );
}
