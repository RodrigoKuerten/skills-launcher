import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin";
import { assertSameOrigin, errorResponse, json, readJson } from "@/lib/http";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminApi();
    const { id } = await params;
    const source = await db.source.findUnique({ where: { id } });
    if (!source) return json({ error: "Source not found" }, { status: 404 });
    const body = await readJson<{ maxSkills?: number }>(request).catch(() => ({}) as { maxSkills?: number });

    const { syncSource } = await import("@/lib/sync/engine");
    const summary = await syncSource(id, {
      trigger: "admin",
      maxSkills: Math.min(100, Math.max(1, Number(body.maxSkills) || 40)),
    });
    await db.auditLog.create({
      data: { userId: admin.id, action: "source.sync", entity: "Source", entityId: id, metadata: JSON.stringify(summary) },
    });
    return json({ ok: true, summary });
  } catch (error) {
    return errorResponse(error);
  }
}
