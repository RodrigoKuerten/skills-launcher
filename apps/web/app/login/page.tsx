import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { Logo } from "@/components/logo";
import { Button, Input, Label } from "@/components/ui";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const user = await getSessionUser();
  if (user) redirect("/");
  const { next, error } = await searchParams;
  const showDemo = process.env.NODE_ENV !== "production";

  return (
    <div className="container-page grid min-h-[calc(100vh-8rem)] items-center gap-12 py-12 lg:grid-cols-2">
      <div className="mx-auto w-full max-w-sm">
        <Logo />
        <h1 className="mt-8 text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sign in to save skills and follow updates.</p>

        {error ? (
          <div className="mt-4 rounded-lg border border-danger/25 bg-danger/5 p-3 text-xs text-danger">
            {error === "invalid" ? "Invalid email or password." : "Could not sign in. Try again."}
          </div>
        ) : null}

        <form action="/api/auth/login" method="post" className="mt-6 space-y-4">
          <input type="hidden" name="next" value={next ?? "/explore"} />
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required placeholder="••••••••" />
          </div>
          <Button type="submit" className="w-full">
            Sign in
          </Button>
        </form>

        <p className="mt-4 text-xs text-muted-foreground">
          No account?{" "}
          <Link href="/register" className="text-accent hover:underline">
            Create one
          </Link>
        </p>

        {showDemo ? (
          <div className="mt-8 rounded-lg border border-border bg-muted/40 p-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Seeded demo accounts</p>
            <div className="mt-2 space-y-1 font-mono text-[10px] text-muted-foreground">
              <p>admin@skills.hub · skills-hub-admin</p>
              <p>demo@skills.hub · skills-hub-demo</p>
            </div>
            <p className="mt-1.5 text-[9px] text-muted-foreground">Only shown outside production.</p>
          </div>
        ) : null}
      </div>

      <div className="relative hidden overflow-hidden rounded-2xl border border-border bg-card p-8 lg:block">
        <div className="pointer-events-none absolute inset-0 surface-grid opacity-30" aria-hidden />
        <div className="relative">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">Why an account</div>
          <h2 className="mt-3 max-w-sm text-2xl font-semibold tracking-tight">
            Your skills, your agents, one current version.
          </h2>
          <ul className="mt-6 space-y-4 text-xs text-muted-foreground">
            {[
              ["Save and follow", "Build a library and get notified when a source publishes a new version."],
              ["Keep provenance", "Every version links back to a commit, tree and content hash."],
              ["Install locally", "The companion writes to allowlisted skill folders, with backups and rollback."],
              ["Review safely", "Quarantined content never becomes downloadable before admin approval."],
            ].map(([title, description]) => (
              <li key={title} className="flex gap-3">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
                <span>
                  <strong className="block text-[11px] font-medium text-foreground">{title}</strong>
                  {description}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-8 rounded-lg border border-border bg-background p-4 font-mono text-[10px] leading-relaxed text-muted-foreground">
            <p>$ skills-hub detect</p>
            <p className="text-success">✓ claude-code · codex · opencode</p>
            <p className="mt-2">$ skills-hub install tdd-workflow --all</p>
            <p className="text-success">✓ 3 agents · backup · checksum verified</p>
          </div>
        </div>
      </div>
    </div>
  );
}
