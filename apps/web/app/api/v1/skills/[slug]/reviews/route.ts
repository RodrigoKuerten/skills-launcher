import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { assertSameOrigin, clientIp, errorResponse, json, rateLimit, readJson } from "@/lib/http";

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await getSessionUser();
    if (!user) return json({ error: "Authentication required" }, { status: 401 });
    if (!rateLimit(`review:${user.id}`, 10, 60 * 60_000)) {
      return json({ error: "Too many reviews. Try again later." }, { status: 429 });
    }
    const { slug } = await params;
    const body = await readJson<{ rating?: number; body?: string }>(request);
    const rating = Number(body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return json({ error: "rating must be an integer from 1 to 5" }, { status: 400 });
    }
    const text = (body.body ?? "").trim().slice(0, 2000);
    const skill = await db.skill.findFirst({
      where: { OR: [{ id: slug }, { slug }], status: { in: ["ACTIVE", "ARCHIVED"] } },
      select: { id: true },
    });
    if (!skill) return json({ error: "Skill not found" }, { status: 404 });

    const review = await db.$transaction(async (tx) => {
      const row = await tx.review.upsert({
        where: { userId_skillId: { userId: user.id, skillId: skill.id } },
        create: { userId: user.id, skillId: skill.id, rating, body: text },
        update: { rating, body: text },
      });
      const aggregate = await tx.review.aggregate({
        where: { skillId: skill.id },
        _avg: { rating: true },
        _count: { _all: true },
      });
      await tx.skill.update({
        where: { id: skill.id },
        data: { ratingAvg: aggregate._avg.rating ?? 0, ratingCount: aggregate._count._all },
      });
      return row;
    });

    await db.auditLog.create({
      data: { userId: user.id, action: "review.upsert", entity: "Skill", entityId: skill.id, ip: clientIp(request) },
    });
    return json({ data: review }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
