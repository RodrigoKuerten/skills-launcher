import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { createApiToken, getSessionUser } from "@/lib/auth";
import { assertSameOrigin, errorResponse, json, readJson } from "@/lib/http";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Authentication required" }, { status: 401 });
    const tokens = await db.apiToken.findMany({
      where: { userId: user.id },
      select: { id: true, name: true, createdAt: true, lastUsedAt: true },
      orderBy: { createdAt: "desc" },
    });
    return json({ data: tokens });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await getSessionUser();
    if (!user) return json({ error: "Authentication required" }, { status: 401 });
    const body = await readJson<{ name?: string }>(request);
    const name = (body.name ?? "Local companion").trim().slice(0, 80) || "Local companion";
    const existing = await db.apiToken.count({ where: { userId: user.id } });
    if (existing >= 10) return json({ error: "Token limit reached (10)" }, { status: 409 });
    const token = await createApiToken(user.id, name);
    return json({ token, name }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
