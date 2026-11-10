import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin";
import { assertSameOrigin, errorResponse, json, readJson } from "@/lib/http";
import { TRUST_TIERS } from "@/lib/source-input";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminApi();
    const { id } = await params;
    const body = await readJson<{
      name?: string;
      enabled?: boolean;
      frequencyMinutes?: number;
      trustTier?: string;
      branch?: string;
      path?: string;
    }>(request);

    const data: Record<string, unknown> = {};
    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, 120);
    if (typeof body.enabled === "boolean") data.enabled = body.enabled;
    if (body.frequencyMinutes != null) data.frequencyMinutes = Math.min(10080, Math.max(60, Number(body.frequencyMinutes) || 360));
    if (body.trustTier) {
      if (!TRUST_TIERS.includes(body.trustTier as (typeof TRUST_TIERS)[number])) {
        return json({ error: "Invalid trust tier" }, { status: 400 });
      }
      data.trustTier = body.trustTier;
    }
    if (typeof body.branch === "string") data.branch = body.branch.trim().slice(0, 100);
    if (typeof body.path === "string") data.path = body.path.trim().replace(/^\/+|\/+$/g, "").slice(0, 200) || null;

    if (!Object.keys(data).length) return json({ error: "No changes" }, { status: 400 });
    const existing = await db.source.findUnique({ where: { id } });
    if (!existing) return json({ error: "Source not found" }, { status: 404 });
    // Scope/ref/trust changes must force a real re-scan; the tree SHA alone is
    // not enough to know that the selected subtree or trust policy changed.
    if (
      (data.path !== undefined && data.path !== existing.path) ||
      (data.branch !== undefined && data.branch !== existing.branch) ||
      (data.trustTier !== undefined && data.trustTier !== existing.trustTier)
    ) {
      data.lastTreeSha = null;
    }
    const source = await db.source.update({ where: { id }, data });
    await db.auditLog.create({
      data: { userId: admin.id, action: "source.update", entity: "Source", entityId: id, metadata: JSON.stringify(data) },
    });
    return json({ data: source });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminApi();
    const { id } = await params;
    const source = await db.source.findUnique({ where: { id } });
    if (!source) return json({ error: "Source not found" }, { status: 404 });
    // Deleting a source cascades catalog rows. Preserve any user-generated data;
    // admins should pause the source instead of destroying reviews/libraries.
    const [reviews, library, installations, reports] = await Promise.all([
      db.review.count({ where: { skill: { sourceId: id } } }),
      db.libraryItem.count({ where: { skill: { sourceId: id } } }),
      db.installation.count({ where: { skill: { sourceId: id } } }),
      db.report.count({ where: { skill: { sourceId: id } } }),
    ]);
    if (reviews + library + installations + reports > 0) {
      return json(
        {
          error:
            "This source has reviews, library items, reports or installation history. Pause it instead of deleting it.",
        },
        { status: 409 },
      );
    }
    await db.source.delete({ where: { id } });
    await db.auditLog.create({
      data: { userId: admin.id, action: "source.delete", entity: "Source", entityId: id, metadata: JSON.stringify({ name: source.name }) },
    });
    return json({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
