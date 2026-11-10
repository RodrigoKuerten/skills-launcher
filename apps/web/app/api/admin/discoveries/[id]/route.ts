import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin";
import { assertSameOrigin, errorResponse, json, readJson } from "@/lib/http";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminApi();
    const { id } = await params;
    const body = await readJson<{ status?: string }>(request);
    if (!body.status || !["APPROVED", "REJECTED", "NEW"].includes(body.status)) {
      return json({ error: "Invalid status" }, { status: 400 });
    }
    const discovery = await db.discovery.findUnique({ where: { id } });
    if (!discovery) return json({ error: "Discovery not found" }, { status: 404 });
    const updated = await db.discovery.update({
      where: { id },
      data: { status: body.status, reviewedAt: body.status === "NEW" ? null : new Date() },
    });
    await db.auditLog.create({
      data: { userId: admin.id, action: "discovery.review", entity: "Discovery", entityId: id, metadata: JSON.stringify({ status: body.status }) },
    });
    return json({ data: updated });
  } catch (error) {
    return errorResponse(error);
  }
}
