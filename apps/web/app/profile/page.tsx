import { CalendarDays, Mail, ShieldCheck, UserRound } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import { Card } from "@/components/ui";
import { ThemeToggle } from "@/components/theme-toggle";
import { TokenManager } from "@/components/token-manager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const user = await requireUser();
  const [saved, reviews, reports, tokens] = await Promise.all([
    db.libraryItem.count({ where: { userId: user.id } }),
    db.review.count({ where: { userId: user.id } }),
    db.report.count({ where: { userId: user.id } }),
    db.apiToken.count({ where: { userId: user.id } }),
  ]);

  return (
    <div className="container-page py-10">
      <div className="max-w-2xl">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">Account</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your identity, activity and companion credentials.</p>
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center gap-3">
              <div className="grid size-12 place-items-center rounded-full border border-border bg-muted text-lg font-semibold">
                {user.name.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{user.name}</p>
                <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Mail className="size-3" /> {user.email}
                </p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {[
                { label: "Saved skills", value: saved },
                { label: "Reviews", value: reviews },
                { label: "Reports", value: reports },
                { label: "API tokens", value: tokens },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-border bg-muted/30 p-2.5">
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{item.label}</p>
                  <p className="mt-0.5 text-base font-semibold tabular-nums">{item.value}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-2 border-t border-border pt-4 text-[11px] text-muted-foreground">
              <p className="flex items-center gap-2">
                <UserRound className="size-3.5" /> Role: <span className="font-mono text-foreground">{user.role}</span>
              </p>
              <p className="flex items-center gap-2">
                <ShieldCheck className="size-3.5" /> Sessions are HTTP-only cookies with server-side revocation.
              </p>
              <p className="flex items-center gap-2">
                <CalendarDays className="size-3.5" /> Signed in as {formatDate(new Date())}
              </p>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold">Appearance</h2>
            <p className="mt-1 text-[11px] text-muted-foreground">Dark is the default. The choice is stored in this browser.</p>
            <div className="mt-3 flex items-center gap-2">
              <ThemeToggle />
              <span className="text-xs text-muted-foreground">Toggle theme</span>
            </div>
          </Card>
        </div>

        <TokenManager />
      </div>
    </div>
  );
}
