/**
 * Live seed: registers real, verified sources and imports whatever is currently
 * in them. No invented skills, versions or metrics. If a source fails, the run
 * is recorded as an error and the seed continues.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";

for (const file of ["../../.env", "../../.env.local", ".env"]) {
  const path = resolve(process.cwd(), file);
  if (existsSync(path)) {
    try {
      process.loadEnvFile(path);
      break;
    } catch {
      // Continue with existing environment.
    }
  }
}

const categories = [
  { slug: "frontend", name: "Frontend", description: "UI engineering, components, state and performance.", icon: "Code2", sortOrder: 1 },
  { slug: "backend", name: "Backend", description: "APIs, services, queues and server-side patterns.", icon: "Server", sortOrder: 2 },
  { slug: "design", name: "Design & UX", description: "Visual systems, interaction and accessibility.", icon: "Palette", sortOrder: 3 },
  { slug: "architecture", name: "Architecture", description: "System design, boundaries and technical decisions.", icon: "Layers", sortOrder: 4 },
  { slug: "security", name: "Security", description: "Threat modeling, hardening and secure review.", icon: "Shield", sortOrder: 5 },
  { slug: "devops", name: "DevOps", description: "CI/CD, containers, infrastructure and deployment.", icon: "Container", sortOrder: 6 },
  { slug: "automation", name: "Automation", description: "Workflows, agents, loops and tool integration.", icon: "Zap", sortOrder: 7 },
  { slug: "ai", name: "AI & Agents", description: "Prompting, evaluation, RAG and agent architecture.", icon: "Bot", sortOrder: 8 },
  { slug: "database", name: "Database", description: "Schema design, queries, indexes and migrations.", icon: "Database", sortOrder: 9 },
  { slug: "testing", name: "Testing & QA", description: "TDD, E2E, coverage and regression prevention.", icon: "TestTube2", sortOrder: 10 },
  { slug: "research", name: "Research", description: "Deep research, source evaluation and synthesis.", icon: "Search", sortOrder: 11 },
  { slug: "productivity", name: "Productivity", description: "Planning, documentation and workflow discipline.", icon: "ListChecks", sortOrder: 12 },
];

const sources = [
  {
    slug: "anthropics-skills",
    name: "Anthropic Skills",
    type: "GITHUB_REPO",
    url: "https://github.com/anthropics/skills",
    repo: "anthropics/skills",
    branch: "main",
    path: "skills",
    trustTier: "OFFICIAL",
    frequencyMinutes: 360,
    enabled: true,
    maxSkills: 40,
  },
  {
    slug: "openai-skills",
    name: "OpenAI Skills Catalog",
    type: "GITHUB_REPO",
    url: "https://github.com/openai/skills",
    repo: "openai/skills",
    branch: "main",
    path: "skills/.curated",
    trustTier: "OFFICIAL",
    frequencyMinutes: 360,
    enabled: true,
    maxSkills: 35,
  },
  {
    slug: "microsoft-skills",
    name: "Microsoft Skills",
    type: "GITHUB_REPO",
    url: "https://github.com/microsoft/skills",
    repo: "microsoft/skills",
    branch: "main",
    path: ".github/skills",
    trustTier: "OFFICIAL",
    frequencyMinutes: 360,
    enabled: true,
    maxSkills: 35,
  },
  {
    slug: "huggingface-skills",
    name: "Hugging Face Skills",
    type: "GITHUB_REPO",
    url: "https://github.com/huggingface/skills",
    repo: "huggingface/skills",
    branch: "main",
    path: "skills",
    trustTier: "OFFICIAL",
    frequencyMinutes: 360,
    enabled: true,
    maxSkills: 30,
  },
  {
    slug: "vercel-agent-skills",
    name: "Vercel Agent Skills",
    type: "GITHUB_REPO",
    url: "https://github.com/vercel-labs/agent-skills",
    repo: "vercel-labs/agent-skills",
    branch: "main",
    path: "skills",
    trustTier: "VERIFIED",
    frequencyMinutes: 720,
    enabled: true,
    maxSkills: 15,
  },
  {
    slug: "ecc-skills",
    name: "Everything Claude Code",
    type: "GITHUB_REPO",
    url: "https://github.com/affaan-m/ECC",
    repo: "affaan-m/ECC",
    branch: "main",
    path: "skills",
    trustTier: "VERIFIED",
    frequencyMinutes: 720,
    enabled: true,
    maxSkills: 45,
  },
  {
    slug: "superpowers",
    name: "Superpowers",
    type: "GITHUB_REPO",
    url: "https://github.com/obra/superpowers",
    repo: "obra/superpowers",
    branch: "main",
    path: "skills",
    trustTier: "VERIFIED",
    frequencyMinutes: 720,
    enabled: true,
    maxSkills: 30,
  },
  {
    slug: "agent-skills-spec-releases",
    name: "Agent Skills Specification · releases",
    type: "RSS",
    url: "https://github.com/agentskills/agentskills/releases.atom",
    repo: null,
    branch: "main",
    path: null,
    trustTier: "OFFICIAL",
    frequencyMinutes: 240,
    enabled: true,
    maxSkills: 0,
  },
  {
    slug: "huggingface-blog",
    name: "Hugging Face Blog",
    type: "RSS",
    url: "https://huggingface.co/blog/feed.xml",
    repo: null,
    branch: "main",
    path: null,
    trustTier: "VERIFIED",
    frequencyMinutes: 360,
    enabled: true,
    maxSkills: 0,
  },
  {
    slug: "skills-sh",
    name: "skills.sh catalog",
    type: "HTTP_JSON",
    url: "https://skills.sh/api/v1/skills",
    repo: null,
    branch: "main",
    path: null,
    trustTier: "VERIFIED",
    frequencyMinutes: 360,
    enabled: false,
    maxSkills: 0,
    config: JSON.stringify({
      note: "Requires Vercel OIDC bearer token; disabled until a token is configured.",
      docs: "https://skills.sh/docs/api",
      auth: "VERCEL_OIDC_TOKEN",
    }),
  },
];

async function main() {
  if (process.env.NODE_ENV === "production") {
    if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD === "skills-hub-admin") {
      throw new Error("Set a non-default ADMIN_PASSWORD before seeding production");
    }
    if (!process.env.CRON_SECRET || process.env.CRON_SECRET === "change-me-in-production") {
      throw new Error("Set CRON_SECRET before seeding production");
    }
  }

  const [{ db }, { hashPassword }, { syncSource }] = await Promise.all([
    import("../lib/db"),
    import("../lib/password"),
    import("../lib/sync/engine"),
  ]);

  await db.$queryRawUnsafe("PRAGMA journal_mode=WAL").catch(() => {});
  await db.$queryRawUnsafe("PRAGMA busy_timeout=5000").catch(() => {});

  for (const category of categories) {
    await db.category.upsert({
      where: { slug: category.slug },
      create: category,
      update: { name: category.name, description: category.description, icon: category.icon, sortOrder: category.sortOrder },
    });
  }

  const adminEmail = (process.env.ADMIN_EMAIL ?? "admin@skills.hub").toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD ?? "skills-hub-admin";
  const demoEmail = (process.env.DEMO_EMAIL ?? "demo@skills.hub").toLowerCase();
  const demoPassword = process.env.DEMO_PASSWORD ?? "skills-hub-demo";

  await db.user.upsert({
    where: { email: adminEmail },
    create: { email: adminEmail, name: "Hub Admin", passwordHash: await hashPassword(adminPassword), role: "ADMIN" },
    update: { role: "ADMIN" },
  });
  if (process.env.NODE_ENV !== "production" || process.env.DEMO_PASSWORD) {
    await db.user.upsert({
      where: { email: demoEmail },
      create: { email: demoEmail, name: "Demo User", passwordHash: await hashPassword(demoPassword), role: "USER" },
      update: {},
    });
  }

  for (const source of sources) {
    const { maxSkills: _maxSkills, ...data } = source;
    await db.source.upsert({
      where: { slug: source.slug },
      create: {
        ...data,
        config: "config" in source ? (source.config as string) : "{}",
      },
      update: {
        name: data.name,
        type: data.type,
        url: data.url,
        repo: data.repo,
        branch: data.branch,
        path: data.path,
        trustTier: data.trustTier,
        frequencyMinutes: data.frequencyMinutes,
        enabled: data.enabled,
        config: "config" in source ? (source.config as string) : "{}",
      },
    });
  }

  console.log(`Seeded ${categories.length} categories and ${sources.length} sources.`);
  console.log(`Admin: ${adminEmail} / ${adminPassword}`);
  console.log(`Demo:  ${demoEmail} / ${demoPassword}`);

  const shouldSync = !process.argv.includes("--no-sync");
  if (!shouldSync) {
    console.log("Skipping sync (--no-sync).");
    await db.$disconnect();
    return;
  }

  console.log("\nImporting live sources (this can take a few minutes)…\n");
  const rows = await db.source.findMany({ where: { enabled: true }, orderBy: { trustTier: "asc" } });
  const summary = [];
  for (const row of rows) {
    const config = sourceConfig(row.slug);
    try {
      const result = await syncSource(row.id, {
        trigger: "cli",
        maxSkills: config ?? 30,
      });
      summary.push({ source: row.slug, ...result });
      console.log(
        `  ${row.slug.padEnd(28)} ${result.status.padEnd(5)} found=${result.found} new=${result.created} updated=${result.updated} quarantined=${result.quarantined}`,
      );
    } catch (error) {
      console.error(`  ${row.slug.padEnd(28)} FAILED ${error instanceof Error ? error.message : error}`);
      summary.push({ source: row.slug, status: "ERROR", error: String(error) });
    }
  }

  const active = await db.skill.findMany({
    where: { status: "ACTIVE", currentVersionId: { not: null } },
    orderBy: [{ qualityScore: "desc" }, { stars: "desc" }],
    take: 6,
    select: { id: true },
  });
  await db.skill.updateMany({ where: {}, data: { featured: false } });
  if (active.length) {
    await db.skill.updateMany({ where: { id: { in: active.map((skill) => skill.id) } }, data: { featured: true } });
  }

  const counts = await Promise.all([
    db.skill.count({ where: { status: "ACTIVE" } }),
    db.skill.count({ where: { status: "QUARANTINED" } }),
    db.skillVersion.count({ where: { status: "PUBLISHED" } }),
    db.skillHost.count({ where: { status: "VERIFIED" } }),
  ]);

  console.log("\nSeed complete.");
  console.log(`Active skills: ${counts[0]} · quarantined: ${counts[1]} · published versions: ${counts[2]} · host validations: ${counts[3]}`);
  if (counts[0] === 0) {
    console.log("No skill was auto-published. Review the quarantine queue at /admin/review.");
  }
  console.log(JSON.stringify(summary, null, 2));
  await db.$disconnect();
}

function sourceConfig(slug: string): number | null {
  return sources.find((source) => source.slug === slug)?.maxSkills ?? null;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
