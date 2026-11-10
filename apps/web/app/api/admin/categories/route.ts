import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin";
import { assertSameOrigin, errorResponse, json, readJson } from "@/lib/http";
import { slugify } from "@/lib/utils";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminApi();
    const body = await readJson<{ name?: string; description?: string; icon?: string; sortOrder?: number }>(request);
    const name = (body.name ?? "").trim().slice(0, 80);
    if (!name) return json({ error: "name is required" }, { status: 400 });
    const slug = slugify(name);
    if (!slug) return json({ error: "Invalid name" }, { status: 400 });
    if (await db.category.findUnique({ where: { slug } })) {
      return json({ error: "Category already exists" }, { status: 409 });
    }
    const category = await db.category.create({
      data: {
        slug,
        name,
        description: (body.description ?? "").trim().slice(0, 400),
        icon: (body.icon ?? "Box").trim().slice(0, 40) || "Box",
        sortOrder: Number(body.sortOrder) || 0,
      },
    });
    await db.auditLog.create({
      data: { userId: admin.id, action: "category.create", entity: "Category", entityId: category.id },
    });
    return json({ data: category }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
