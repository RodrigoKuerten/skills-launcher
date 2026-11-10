import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin";
import { assertSameOrigin, errorResponse, json, readJson } from "@/lib/http";

export async function GET() {
  try {
    await requireAdminApi();
    const reports = await db.report.findMany({
      include: {
        skill: { select: { slug: true, name: true, status: true, trustLevel: true } },
        user: { select: { email: true } },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 100,
    });
    return json({ data: reports });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminApi();
    const { id } = await params;
    const body = await readJson<{ status?: string }>(request);
    if (!body.status || !["OPEN", "RESOLVED", "DISMISSED"].includes(body.status)) {
      return json({ error: "Invalid status" }, { status: 400 });
    }
    const report = await db.report.findUnique({ where: { id } });
    if (!report) return json({ error: "Report not found" }, { status: 404 });
    const updated = await db.report.update({
      where: { id },
      data: { status: body.status, resolvedAt: body.status === "OPEN" ? null : new Date() },
    });
    await db.auditLog.create({
      data: { userId: admin.id, action: "report.update", entity: "Report", entityId: id, metadata: JSON.stringify({ from: report.status, to: body.status }) },
    });
    return json({ data: updated });
  } catch (error) {
    return errorResponse(error);
  }
}
