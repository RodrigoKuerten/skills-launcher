import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin";
import { assertSameOrigin, errorResponse, json, readJson } from "@/lib/http";
import { assertPublicFeedUrl, normalizeSourceName, parseRepoInput, SOURCE_TYPES, TRUST_TIERS } from "@/lib/source-input";

export async function GET() {
  try {
    await requireAdminApi();
    const sources = await db.source.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { skills: true, runs: true, discoveries: { where: { status: "NEW" } } } },
        runs: { orderBy: { startedAt: "desc" }, take: 1 },
      },
    });
    return json({ data: sources });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminApi();
    const body = await readJson<{
      name?: string;
      type?: string;
      repo?: string;
      url?: string;
      branch?: string;
      path?: string;
      trustTier?: string;
      frequencyMinutes?: number;
      enabled?: boolean;
    }>(request);

    const type = body.type ?? "";
    if (!SOURCE_TYPES.includes(type as (typeof SOURCE_TYPES)[number])) {
      return json({ error: "Invalid source type" }, { status: 400 });
    }
    const trustTier = body.trustTier ?? "COMMUNITY";
    if (!TRUST_TIERS.includes(trustTier as (typeof TRUST_TIERS)[number])) {
      return json({ error: "Invalid trust tier" }, { status: 400 });
    }
    const frequency = Math.min(10080, Math.max(60, Number(body.frequencyMinutes) || 360));

    let name = (body.name ?? "").trim().slice(0, 120);
    let url = "";
    let repo: string | null = null;
    // Empty branch means "use the repository's default branch". This matters
    // for repos still on master/trunk; hard-coding main would fail forever.
    let branch = (body.branch ?? "").trim().slice(0, 100);
    let path = (body.path ?? "").trim().replace(/^\/+|\/+$/g, "").slice(0, 200) || null;

    if (type === "GITHUB_REPO") {
      const parsed = parseRepoInput(body.repo ?? body.url ?? "");
      repo = parsed.full;
      url = `https://github.com/${parsed.full}`;
      if (!name) name = parsed.full;
    } else {
      url = assertPublicFeedUrl(body.url ?? "");
      if (!name) name = new URL(url).hostname;
      branch = "main";
      path = null;
    }

    if (!name) return json({ error: "name is required" }, { status: 400 });

    const baseSlug = normalizeSourceName(repo ?? name);
    let slug = baseSlug;
    let suffix = 2;
    while (await db.source.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    const source = await db.source.create({
      data: {
        slug,
        name,
        type,
        url,
        repo,
        branch,
        path,
        trustTier,
        frequencyMinutes: frequency,
        enabled: body.enabled !== false,
      },
    });
    await db.auditLog.create({
      data: { userId: admin.id, action: "source.create", entity: "Source", entityId: source.id, metadata: JSON.stringify({ type, url }) },
    });
    return json({ data: source }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
