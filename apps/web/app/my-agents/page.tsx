import Link from "next/link";
import { ArrowRight, Terminal } from "lucide-react";
import { AgentsDashboard } from "@/components/agents-dashboard";
import { ButtonLink } from "@/components/ui";

export const metadata = { title: "My Agents" };

export default function MyAgentsPage() {
  return (
    <div className="container-page py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">Local companion</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">My Agents</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Detect the AI tools installed on this computer, see their skill directories, and manage local installations.
            The marketplace never touches your filesystem directly.
          </p>
        </div>
        <div className="flex gap-2">
          <ButtonLink href="/explore" variant="outline" size="sm">
            Browse skills
          </ButtonLink>
          <Link
            href="/docs/agents"
            className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            Setup guide <ArrowRight className="size-3" />
          </Link>
        </div>
      </div>

      <div className="mt-6 flex items-start gap-2 rounded-lg border border-border bg-card/60 p-3 text-[11px] text-muted-foreground">
        <Terminal className="mt-0.5 size-3.5 shrink-0 text-accent" />
        <p>
          One-click installs require the companion process. It stays on your machine, binds to loopback, and exposes only
          detection/install/update routes behind a per-machine token. Installations can be reported to your account with an
          API token from your profile.
        </p>
      </div>

      <div className="mt-6">
        <AgentsDashboard />
      </div>
    </div>
  );
}
