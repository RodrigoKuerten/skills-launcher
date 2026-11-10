import Link from "next/link";

const links = [
  { href: "/docs", label: "Overview" },
  { href: "/docs/agents", label: "Companion & install" },
  { href: "/docs/api", label: "Public API" },
  { href: "/docs/architecture", label: "Architecture" },
];

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container-page grid gap-10 py-10 lg:grid-cols-[210px_1fr]">
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <p className="px-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Documentation</p>
        <nav className="mt-3 space-y-0.5">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="block rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="mt-6 border-t border-border pt-4">
          <p className="px-2 text-[10px] leading-relaxed text-muted-foreground">
            Source of truth lives in <code className="font-mono">docs/</code>; the API reference is <code className="font-mono">docs/API.md</code>.
          </p>
        </div>
      </aside>
      <div className="min-w-0 max-w-3xl">{children}</div>
    </div>
  );
}
