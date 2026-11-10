import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin";
import { assertSameOrigin, errorResponse, json, readJson } from "@/lib/http";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminApi();
    const { id } = await params;
    const category = await db.category.findUnique({
      where: { id },
      include: { _count: { select: { skills: true } } },
    });
    if (!category) return json({ error: "Category not found" }, { status: 404 });
    if (category._count.skills > 0) {
      return json({ error: "Reassign or remove its skills before deleting this category" }, { status: 409 });
    }
    await db.category.delete({ where: { id } });
    await db.auditLog.create({
      data: { userId: admin.id, action: "category.delete", entity: "Category", entityId: id },
    });
    return json({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminApi();
    const { id } = await params;
    const body = await readJson<{ name?: string; description?: string; icon?: string; sortOrder?: number }>(request);
    const data: Record<string, unknown> = {};
    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, 80);
    if (typeof body.description === "string") data.description = body.description.trim().slice(0, 400);
    if (typeof body.icon === "string") data.icon = body.icon.trim().slice(0, 40) || "Box";
    if (body.sortOrder != null) data.sortOrder = Number(body.sortOrder) || 0;
    if (!Object.keys(data).length) return json({ error: "No changes" }, { status: 400 });
    const category = await db.category.update({ where: { id }, data });
    await db.auditLog.create({
      data: { userId: admin.id, action: "category.update", entity: "Category", entityId: id },
    });
    return json({ data: category });
  } catch (error) {
    return errorResponse(error);
  }
}
