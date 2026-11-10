import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { assertSameOrigin, errorResponse, json, readJson } from "@/lib/http";

const REASONS = new Set(["unsafe", "malware", "broken", "license", "spam"]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await getSessionUser();
    if (!user) return json({ error: "Authentication required" }, { status: 401 });
    const { slug } = await params;
    const body = await readJson<{ reason?: string; details?: string }>(request);
    if (!body.reason || !REASONS.has(body.reason)) {
      return json({ error: "Invalid report reason" }, { status: 400 });
    }
    const skill = await db.skill.findFirst({
      where: { OR: [{ id: slug }, { slug }] },
      select: { id: true },
    });
    if (!skill) return json({ error: "Skill not found" }, { status: 404 });

    const open = await db.report.findFirst({
      where: { userId: user.id, skillId: skill.id, status: "OPEN" },
    });
    if (open) return json({ error: "You already have an open report for this skill" }, { status: 409 });

    const report = await db.report.create({
      data: {
        userId: user.id,
        skillId: skill.id,
        reason: body.reason,
        details: (body.details ?? "").trim().slice(0, 4000),
      },
    });
    return json({ data: { id: report.id, status: report.status } }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
