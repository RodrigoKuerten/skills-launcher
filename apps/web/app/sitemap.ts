import type { MetadataRoute } from "next";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const skills = await db.skill.findMany({
    where: { status: "ACTIVE", currentVersionId: { not: null } },
    select: { slug: true, updatedAt: true },
    orderBy: { qualityScore: "desc" },
    take: 5000,
  });

  const staticRoutes = ["", "/explore", "/categories", "/updates", "/sources", "/my-agents", "/docs", "/docs/api", "/docs/agents", "/docs/architecture"];
  return [
    ...staticRoutes.map((path) => ({
      url: `${base}${path}`,
      lastModified: new Date(),
      changeFrequency: path === "" ? ("daily" as const) : ("weekly" as const),
      priority: path === "" || path === "/explore" ? 1 : 0.6,
    })),
    ...skills.map((skill) => ({
      url: `${base}/skills/${skill.slug}`,
      lastModified: skill.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
