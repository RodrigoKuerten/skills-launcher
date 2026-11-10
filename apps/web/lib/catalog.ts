import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { normalizeSearch } from "@/lib/search";
import type { SkillCardData } from "@/components/skill-card";

/** Only the columns the card renders; never pull file/readme blobs into a list. */
export const skillCardInclude = {
  category: true,
  source: true,
  hosts: true,
  currentVersion: {
    select: { versionLabel: true, publishedAt: true, scannerVersion: true },
  },
} satisfies Prisma.SkillInclude;

export type CatalogParams = {
  q?: string;
  category?: string;
  host?: string;
  trust?: string;
  sort?: string;
  page?: number;
  limit?: number;
};

const SORTS: Record<string, Record<string, "asc" | "desc">[]> = {
  quality: [{ qualityScore: "desc" }, { stars: "desc" }],
  popular: [{ stars: "desc" }, { qualityScore: "desc" }],
  updated: [{ updatedAt: "desc" }],
  newest: [{ createdAt: "desc" }],
  rating: [{ ratingAvg: "desc" }, { ratingCount: "desc" }],
  name: [{ name: "asc" }],
};

export function parseCatalogParams(search: Record<string, string | string[] | undefined>): CatalogParams {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  return {
    q: first(search.q)?.slice(0, 120),
    category: first(search.category),
    host: first(search.host),
    trust: first(search.trust),
    sort: first(search.sort) ?? "quality",
    page: Math.max(1, Number(first(search.page)) || 1),
    limit: Math.min(48, Math.max(1, Number(first(search.limit)) || 12)),
  };
}

export async function listSkills(params: CatalogParams) {
  const requestedPage = Number(params.page ?? 1);
  const page = Number.isFinite(requestedPage) ? Math.min(1000, Math.max(1, Math.floor(requestedPage))) : 1;
  const limit = Math.min(48, Math.max(1, params.limit ?? 12));
  const where: Record<string, unknown> = { status: "ACTIVE" };
  if (params.q) {
    // searchText is lowercased and accent-stripped at ingest, so this works on
    // SQLite and stays portable to Postgres without a `mode` argument.
    const q = normalizeSearch(params.q.replace(/[%_]/g, " "));
    if (q) {
      where.OR = [
        { searchText: { contains: q } },
        { name: { contains: params.q.replace(/[%_]/g, " ") } },
        { author: { contains: params.q.replace(/[%_]/g, " ") } },
      ];
    }
  }
  if (params.category) where.category = { slug: params.category };
  if (params.host) where.hosts = { some: { host: params.host, status: "VERIFIED" } };
  if (params.trust && ["OFFICIAL", "VERIFIED_COMMUNITY", "IN_REVIEW", "STALE", "ARCHIVED", "UNSAFE"].includes(params.trust)) {
    where.trustLevel = params.trust;
  }

  const [items, total] = await Promise.all([
    db.skill.findMany({
      where,
      include: skillCardInclude,
      orderBy: SORTS[params.sort ?? "quality"] ?? SORTS.quality,
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.skill.count({ where }),
  ]);

  return {
    items: items.map(toSkillCard),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    limit,
  };
}

export function toSkillCard(skill: {
  slug: string;
  name: string;
  summary: string;
  author: string;
  stars: number;
  installCount: number;
  qualityScore: number;
  securityScore: number;
  riskLevel: string;
  trustLevel: string;
  license: string | null;
  priceCents: number;
  featured: boolean;
  repositoryUrl: string;
  category?: { name: string; slug: string } | null;
  source?: { name: string; trustTier: string } | null;
  hosts?: Array<{ host: string; status: string }>;
  currentVersion?: {
    versionLabel: string;
    publishedAt: Date | null;
    scannerVersion?: string | null;
  } | null;
}): SkillCardData {
  return {
    slug: skill.slug,
    name: skill.name,
    summary: skill.summary,
    author: skill.author,
    stars: skill.stars,
    installCount: skill.installCount,
    qualityScore: skill.qualityScore,
    securityScore: skill.securityScore,
    riskLevel: skill.riskLevel,
    trustLevel: skill.trustLevel,
    license: skill.license,
    priceCents: skill.priceCents,
    featured: skill.featured,
    repositoryUrl: skill.repositoryUrl,
    category: skill.category ? { name: skill.category.name, slug: skill.category.slug } : null,
    source: skill.source ? { name: skill.source.name, trustTier: skill.source.trustTier } : null,
    hosts: skill.hosts?.map((host) => ({ host: host.host, status: host.status })) ?? [],
    currentVersion: skill.currentVersion
      ? {
          versionLabel: skill.currentVersion.versionLabel,
          publishedAt: skill.currentVersion.publishedAt,
          scannerVersion: skill.currentVersion.scannerVersion,
        }
      : null,
  };
}

export async function getSkillBySlug(slug: string) {
  return db.skill.findUnique({
    where: { slug },
    include: {
      category: true,
      source: true,
      hosts: true,
      currentVersion: {
        select: {
          id: true,
          versionLabel: true,
          contentHash: true,
          commitSha: true,
          changelog: true,
          readme: true,
          fileCount: true,
          totalBytes: true,
          qualityScore: true,
          securityScore: true,
          riskLevel: true,
          scanFindings: true,
          compatibility: true,
          status: true,
          license: true,
          trustLevel: true,
          scannerVersion: true,
          sourceUrl: true,
          fetchedAt: true,
          publishedAt: true,
          createdAt: true,
        },
      },
      versions: {
        where: { status: "PUBLISHED" },
        orderBy: { publishedAt: "desc" },
        take: 12,
        select: {
          id: true,
          versionLabel: true,
          contentHash: true,
          commitSha: true,
          publishedAt: true,
          fileCount: true,
        },
      },
      reviews: {
        select: { id: true, rating: true, body: true, createdAt: true, user: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
      _count: { select: { installations: true, reviews: true } },
    },
  });
}

export async function getCategoriesWithCounts() {
  return db.category.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { skills: { where: { status: "ACTIVE" } } } } },
  });
}

export async function getPlatformStats() {
  const [skills, sources, versions, categories, hosts] = await Promise.all([
    db.skill.count({ where: { status: "ACTIVE" } }),
    db.source.count({ where: { enabled: true } }),
    db.skillVersion.count({ where: { status: "PUBLISHED" } }),
    db.category.count(),
    db.skillHost.count({ where: { status: "VERIFIED" } }),
  ]);
  return { skills, sources, versions, categories, hostCompatibility: hosts };
}

export const sortOptions = [
  { value: "quality", label: "Best quality" },
  { value: "popular", label: "Most starred" },
  { value: "updated", label: "Recently updated" },
  { value: "newest", label: "Newest" },
  { value: "rating", label: "Top rated" },
  { value: "name", label: "Name A–Z" },
];
