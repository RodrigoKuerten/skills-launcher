import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { assertSameOrigin, errorResponse, json, readJson } from "@/lib/http";
import { skillCardInclude } from "@/lib/catalog";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Authentication required" }, { status: 401 });
    const items = await db.libraryItem.findMany({
      where: { userId: user.id },
      include: { skill: { include: skillCardInclude } },
      orderBy: { createdAt: "desc" },
    });
    return json({ data: items });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await getSessionUser();
    if (!user) return json({ error: "Authentication required" }, { status: 401 });
    const body = await readJson<{ skillId?: string }>(request);
    if (!body.skillId) return json({ error: "skillId is required" }, { status: 400 });

    const skill = await db.skill.findUnique({ where: { id: body.skillId }, select: { id: true, status: true } });
    if (!skill || (skill.status !== "ACTIVE" && skill.status !== "ARCHIVED")) {
      return json({ error: "Skill not found" }, { status: 404 });
    }

    const existing = await db.libraryItem.findUnique({
      where: { userId_skillId: { userId: user.id, skillId: skill.id } },
    });
    if (existing) {
      await db.libraryItem.delete({ where: { id: existing.id } });
      return json({ saved: false });
    }
    await db.libraryItem.create({ data: { userId: user.id, skillId: skill.id } });
    return json({ saved: true });
  } catch (error) {
    return errorResponse(error);
  }
}
