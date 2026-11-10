import type { NextRequest } from "next/server";
import { isHostId } from "@skills-hub/core";
import { db } from "@/lib/db";
import { getApiTokenUser, getSessionUser } from "@/lib/auth";
import { errorResponse, json, readJson } from "@/lib/http";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Authentication required" }, { status: 401 });
    const installations = await db.installation.findMany({
      where: { userId: user.id, status: { not: "REMOVED" } },
      include: { skill: { select: { slug: true, name: true, currentVersion: { select: { versionLabel: true } } } } },
      orderBy: { updatedAt: "desc" },
    });
    return json({ data: installations });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Called by the local companion after a successful install/update. */
export async function POST(request: NextRequest) {
  try {
    const user = await getApiTokenUser(request);
    if (!user) return json({ error: "Valid API token required" }, { status: 401 });
    const body = await readJson<{
      machineId?: string;
      skillSlug?: string;
      host?: string;
      versionLabel?: string;
      contentHash?: string;
      installedPath?: string;
      status?: string;
    }>(request);

    if (
      typeof body.machineId !== "string" ||
      typeof body.skillSlug !== "string" ||
      typeof body.host !== "string" ||
      typeof body.versionLabel !== "string" ||
      typeof body.contentHash !== "string" ||
      typeof body.installedPath !== "string" ||
      !body.machineId.trim() ||
      !body.skillSlug.trim() ||
      !isHostId(body.host)
    ) {
      return json({ error: "machineId, skillSlug, host, versionLabel, contentHash and installedPath are required" }, { status: 400 });
    }
    const skill = await db.skill.findUnique({ where: { slug: body.skillSlug }, select: { id: true } });
    if (!skill) return json({ error: "Skill not found" }, { status: 404 });

    const machineId = body.machineId.slice(0, 128);
    const status = ["INSTALLED", "ROLLED_BACK", "REMOVED"].includes(body.status ?? "")
      ? (body.status as string)
      : "INSTALLED";
    const existing = await db.installation.findUnique({
      where: { machineId_agentHost_skillId: { machineId, agentHost: body.host, skillId: skill.id } },
    });

    const installation = await db.$transaction(async (tx) => {
      const row = await tx.installation.upsert({
        where: { machineId_agentHost_skillId: { machineId, agentHost: body.host!, skillId: skill.id } },
        create: {
          userId: user.id,
          machineId,
          agentHost: body.host!,
          skillId: skill.id,
          versionLabel: (body.versionLabel ?? "unknown").slice(0, 80),
          contentHash: (body.contentHash ?? "").slice(0, 128),
          installedPath: (body.installedPath ?? "").slice(0, 500),
          status,
        },
        update: {
          userId: user.id,
          versionLabel: (body.versionLabel ?? "unknown").slice(0, 80),
          contentHash: (body.contentHash ?? "").slice(0, 128),
          installedPath: (body.installedPath ?? "").slice(0, 500),
          status,
        },
      });
      if (!existing && status === "INSTALLED") {
        await tx.skill.update({ where: { id: skill.id }, data: { installCount: { increment: 1 } } });
      }
      return row;
    });

    return json({ data: { id: installation.id, status: installation.status } }, { status: existing ? 200 : 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
