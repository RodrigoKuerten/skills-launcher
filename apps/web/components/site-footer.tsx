import Link from "next/link";
import { Logo } from "@/components/logo";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-border/70">
      <div className="container-page grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Logo />
          <p className="mt-3 max-w-xs text-xs leading-relaxed text-muted-foreground">
            A versioned, scanned marketplace for agent skills. Imported from verifiable sources, installed by a local
            companion you control.
          </p>
          <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Automated scans are heuristics, not a security guarantee.
          </p>
        </div>
        <FooterColumn
          title="Product"
          links={[
            { href: "/explore", label: "Explore skills" },
            { href: "/categories", label: "Categories" },
            { href: "/updates", label: "Changelog" },
            { href: "/library", label: "My library" },
          ]}
        />
        <FooterColumn
          title="Ecosystem"
          links={[
            { href: "/sources", label: "Monitored sources" },
            { href: "/my-agents", label: "My agents" },
            { href: "/docs/agents", label: "Install guide" },
            { href: "/docs/api", label: "Public API" },
          ]}
        />
        <FooterColumn
          title="Platform"
          links={[
            { href: "/docs", label: "Documentation" },
            { href: "/docs/architecture", label: "Architecture" },
            { href: "/admin", label: "Administration" },
            { href: "https://agentskills.io/specification", label: "Agent Skills spec", external: true },
          ]}
        />
      </div>
      <div className="border-t border-border/60">
        <div className="container-page flex flex-col gap-2 py-5 text-[11px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} AI Skills Hub. Source metadata belongs to its original authors.</p>
          <p className="font-mono">Built with ECC multi-agent orchestration</p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: Array<{ href: string; label: string; external?: boolean }>;
}) {
  return (
    <div>
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground">{title}</h3>
      <ul className="mt-3 space-y-2">
        {links.map((link) => (
          <li key={link.href + link.label}>
            {link.external ? (
              <a
                href={link.href}
                target="_blank"
                rel="noreferrer noopener"
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label} ↗
              </a>
            ) : (
              <Link href={link.href} className="text-xs text-muted-foreground transition-colors hover:text-foreground">
                {link.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
