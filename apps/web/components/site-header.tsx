import Link from "next/link";
import { BookOpen, LogOut, ShieldCheck } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { ButtonLink, Button } from "@/components/ui";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { HeaderSearch } from "@/components/header-search";
import { MobileMenu } from "@/components/mobile-menu";

const links = [
  { href: "/explore", label: "Explore" },
  { href: "/categories", label: "Categories" },
  { href: "/updates", label: "Updates" },
  { href: "/sources", label: "Sources" },
  { href: "/my-agents", label: "My Agents" },
];

export async function SiteHeader() {
  const user = await getSessionUser();

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 glass">
      <div className="container-page flex h-14 items-center gap-4">
        <Logo />
        <nav className="hidden items-center gap-0.5 md:flex" aria-label="Main">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <HeaderSearch />
          <ThemeToggle />
          {user ? (
            <>
              <ButtonLink href="/library" variant="ghost" size="icon" aria-label="My library" title="My library">
                <BookOpen className="size-4" />
              </ButtonLink>
              {user.role === "ADMIN" ? (
                <ButtonLink href="/admin" variant="ghost" size="icon" aria-label="Admin" title="Admin">
                  <ShieldCheck className="size-4" />
                </ButtonLink>
              ) : null}
              <Link
                href="/profile"
                className="ml-1 grid size-8 place-items-center rounded-full border border-border bg-muted text-[11px] font-semibold transition-colors hover:border-accent/50"
                title={user.email}
                aria-label={`Account: ${user.name}`}
              >
                {user.name.slice(0, 1).toUpperCase()}
              </Link>
              <form action="/api/auth/logout" method="post">
                <Button type="submit" variant="ghost" size="icon" aria-label="Sign out" title="Sign out">
                  <LogOut className="size-4" />
                </Button>
              </form>
            </>
          ) : (
            <>
              <ButtonLink href="/login" variant="ghost" size="sm" className="hidden sm:inline-flex">
                Sign in
              </ButtonLink>
              <ButtonLink href="/register" size="sm">
                Get started
              </ButtonLink>
            </>
          )}
          <MobileMenu links={links} user={user ? { name: user.name, role: user.role } : null} />
        </div>
      </div>
    </header>
  );
}
