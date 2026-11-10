import Link from "next/link";
import { ArrowRight, BookOpen, Package, ShieldCheck, Workflow } from "lucide-react";

export const metadata = { title: "Documentation" };

export default function DocsPage() {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">Docs</div>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Skills Launcher</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        A catalog and distribution layer for Agent Skills. Skills are imported from verifiable sources, content-addressed,
        statically scanned, validated per host, and installed by a loopback companion with backups and rollback.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {[
          {
            href: "/docs/agents",
            icon: Package,
            title: "Companion & install",
            text: "Detect hosts, pair the token, install, update, roll back.",
          },
          {
            href: "/docs/api",
            icon: BookOpen,
            title: "Public API",
            text: "Catalog, manifest, download, library, reviews, reports.",
          },
          {
            href: "/docs/architecture",
            icon: Workflow,
            title: "Architecture",
            text: "Trust boundaries, sync pipeline, versioning, scaling.",
          },
          {
            href: "/sources",
            icon: ShieldCheck,
            title: "Sources",
            text: "What is monitored, how often, and what happens on failure.",
          },
        ].map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group rounded-xl border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-accent/30"
          >
            <card.icon className="size-4 text-accent" />
            <p className="mt-3 text-sm font-medium group-hover:text-accent">{card.title}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{card.text}</p>
            <span className="mt-2 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              Read <ArrowRight className="size-3" />
            </span>
          </Link>
        ))}
      </div>

      <h2 className="mt-10 text-lg font-semibold tracking-tight">Quickstart</h2>
      <pre className="mt-3 overflow-x-auto rounded-xl border border-border bg-card p-4 font-mono text-[11px] leading-relaxed">
        <code>{`# 1. Install dependencies and prepare the database
npm install
npm run db:push

# 2. Seed sources, categories, users and import live skills
npm run db:seed

# 3. Start the marketplace
npm run dev

# 4. In another terminal, start the local companion
npm run agent

# 5. Open http://localhost:3000 and pair My Agents with the printed token`}</code>
      </pre>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Seed requires network access to GitHub. A <code className="font-mono">GITHUB_TOKEN</code> is optional but strongly
        recommended (60 vs 5,000 requests/hour). If a source fails, the failure is stored; no placeholder skills are created.
      </p>

      <h2 className="mt-10 text-lg font-semibold tracking-tight">Guarantees, stated narrowly</h2>
      <ul className="mt-3 space-y-2 text-xs leading-relaxed text-muted-foreground">
        <li>
          <strong className="text-foreground">Immutable versions.</strong> A version is identified by the SHA-256 of its
          canonical file set, not by a tag. History is never overwritten.
        </li>
        <li>
          <strong className="text-foreground">License-aware distribution.</strong> Full mirror/download is only offered for
          detected permissive licenses. Otherwise the catalog links to the source.
        </li>
        <li>
          <strong className="text-foreground">Quarantine gating.</strong> High/critical scan findings and low-trust source
          imports stay unpublished until an admin approves the specific version.
        </li>
        <li>
          <strong className="text-foreground">Local writes only.</strong> Install adapters live in the companion, not the web
          app. Files are checksum-verified, path-validated, backed up and journaled.
        </li>
        <li>
          <strong className="text-foreground">No execution.</strong> Import and install never run scripts, hooks or commands
          from a skill. Detection only invokes host version flags.
        </li>
      </ul>
    </div>
  );
}
