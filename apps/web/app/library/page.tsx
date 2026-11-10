import Link from "next/link";
import { BookOpen, PackageCheck, Terminal } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatDate, hostLabel } from "@/lib/utils";
import { skillCardInclude, toSkillCard } from "@/lib/catalog";
import { SkillCard } from "@/components/skill-card";
import { ButtonLink, Card, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "My library" };

export default async function LibraryPage() {
  const user = await requireUser();
  const [saved, installations] = await Promise.all([
    db.libraryItem.findMany({
      where: { userId: user.id },
      include: { skill: { include: skillCardInclude } },
      orderBy: { createdAt: "desc" },
    }),
    db.installation.findMany({
      where: { userId: user.id, status: { not: "REMOVED" } },
      include: {
        skill: {
          select: {
            slug: true,
            name: true,
            currentVersion: { select: { versionLabel: true, contentHash: true } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  return (
    <div className="container-page py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">Library</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">My skills</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {saved.length} saved · {installations.length} reported installation{installations.length === 1 ? "" : "s"} ·{" "}
            {user.email}
          </p>
        </div>
        <ButtonLink href="/explore" variant="outline" size="sm">
          Find more skills
        </ButtonLink>
      </div>

      <section className="mt-8">
        <div className="mb-3 flex items-center gap-2">
          <BookOpen className="size-4 text-accent" />
          <h2 className="text-sm font-semibold">Saved</h2>
        </div>
        {saved.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {saved.map((item) => (
              <SkillCard key={item.id} skill={toSkillCard(item.skill)} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<BookOpen className="size-7" />}
            title="Nothing saved yet"
            description="Save skills to follow their versions and get update signals in one place."
            action={<ButtonLink href="/explore" size="sm">Explore skills</ButtonLink>}
          />
        )}
      </section>

      <section className="mt-10">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PackageCheck className="size-4 text-accent" />
            <h2 className="text-sm font-semibold">Reported installations</h2>
          </div>
          <ButtonLink href="/my-agents" variant="ghost" size="sm">
            Manage agents
          </ButtonLink>
        </div>
        {installations.length ? (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Skill</th>
                  <th className="px-4 py-2.5 font-medium">Agent</th>
                  <th className="px-4 py-2.5 font-medium">Installed</th>
                  <th className="px-4 py-2.5 font-medium">Latest</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {installations.map((installation) => {
                  const outdated =
                    installation.contentHash !== installation.skill.currentVersion?.contentHash &&
                    installation.status === "INSTALLED";
                  return (
                    <tr key={installation.id} className="hover:bg-muted/40">
                      <td className="px-4 py-3">
                        <Link href={`/skills/${installation.skill.slug}`} className="font-medium hover:text-accent">
                          {installation.skill.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{hostLabel(installation.agentHost)}</td>
                      <td className="px-4 py-3 font-mono text-[10px]">{installation.versionLabel}</td>
                      <td className="px-4 py-3 font-mono text-[10px]">
                        {installation.skill.currentVersion?.versionLabel ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={outdated ? "rounded-full bg-warning/10 px-2 py-0.5 text-[9px] text-warning" : "rounded-full bg-success/10 px-2 py-0.5 text-[9px] text-success"}>
                          {outdated ? "update available" : installation.status.toLowerCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[10px] text-muted-foreground">{formatDate(installation.updatedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-5">
            <div className="flex items-start gap-3">
              <Terminal className="mt-0.5 size-4 text-muted-foreground" />
              <div>
                <p className="text-xs font-medium">No reported installations</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  The companion can report successful installs to this account with an API token. Create one in your
                  profile and pass it to the companion. Without reporting, installs stay local to your machine.
                </p>
                <div className="mt-2 flex gap-2">
                  <ButtonLink href="/profile" size="sm" variant="outline">Create API token</ButtonLink>
                  <ButtonLink href="/my-agents" size="sm">Open My Agents</ButtonLink>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
