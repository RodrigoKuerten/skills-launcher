import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { assertSameOrigin, errorResponse, json } from "@/lib/http";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await getSessionUser();
    if (!user) return json({ error: "Authentication required" }, { status: 401 });
    const { id } = await params;
    const deleted = await db.apiToken.deleteMany({ where: { id, userId: user.id } });
    if (!deleted.count) return json({ error: "Token not found" }, { status: 404 });
    return json({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
