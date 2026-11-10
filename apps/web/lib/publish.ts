import { validateAllHosts, type HostId, type SkillFile } from "@skills-hub/core";
import { db } from "@/lib/db";
import { readFiles } from "@/lib/manifest";
import { HttpError } from "@/lib/http";
import { normalizeSearch } from "@/lib/search";

type CompatEntry = { host: string; status: string; notes: string };

function parseCompatibility(raw: string, files: SkillFile[]): CompatEntry[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return (parsed as CompatEntry[]).filter((entry) => entry && typeof entry.host === "string");
    }
    if (parsed && typeof parsed === "object") {
      return Object.entries(parsed as Record<string, unknown>).map(([host, value]) => {
        if (typeof value === "string") return { host, status: value, notes: "" };
        const entry = value as { status?: string; notes?: string };
        return { host, status: entry.status ?? "UNSUPPORTED", notes: entry.notes ?? "" };
      });
    }
  } catch {
    // Fall through to revalidation below.
  }
  return validateAllHosts(files).map((result) => ({
    host: result.host,
    status: result.status,
    notes: result.notes.join(" · "),
  }));
}

/**
 * Admin publish path. The sync engine also publishes transactionally for
 * eligible sources; both paths move the pointer and rebuild host rows.
 */
export async function publishVersion(versionId: string, adminId: string) {
  const version = await db.skillVersion.findUnique({
    where: { id: versionId },
    include: { skill: { include: { source: true } } },
  });
  if (!version) throw new HttpError(404, "Version not found");
  if (version.status === "REJECTED") throw new HttpError(409, "Rejected versions cannot be published");
  if (version.skill.status === "REJECTED") throw new HttpError(409, "Skill was rejected");
  if (version.incomplete) {
    throw new HttpError(409, "This version has an incomplete snapshot; re-sync the source before approving");
  }

  const files = readFiles(version.files);
  const compatibility = parseCompatibility(version.compatibility, files);
  const trustLevel =
    version.riskLevel === "HIGH" || version.riskLevel === "CRITICAL"
      ? "UNSAFE"
      : version.skill.source.trustTier === "OFFICIAL"
        ? "OFFICIAL"
        : version.skill.source.trustTier === "VERIFIED"
          ? "VERIFIED_COMMUNITY"
          : "IN_REVIEW";

  await db.$transaction(async (tx) => {
    // Re-check inside the transaction: another admin may have rejected this
    // version after the read above.
    const published = await tx.skillVersion.updateMany({
      where: { id: version.id, status: { not: "REJECTED" }, incomplete: false },
      data: {
        status: "PUBLISHED",
        // Keep the original publication timestamp when restoring an old version.
        ...(version.publishedAt ? {} : { publishedAt: new Date() }),
      },
    });
    if (published.count !== 1) throw new HttpError(409, "Version is rejected or incomplete");
    await tx.skill.update({
      where: { id: version.skillId },
      data: {
        status: "ACTIVE",
        currentVersionId: version.id,
        qualityScore: version.qualityScore,
        securityScore: version.securityScore,
        riskLevel: version.riskLevel,
        trustLevel,
        license: version.license ?? version.skill.source.license ?? version.skill.license,
        sourceUrl: version.sourceUrl,
        searchText: normalizeSearch(`${version.skill.name} ${version.readme}`),
        lastSyncedAt: new Date(),
      },
    });
    // Host rows must describe the newly published version, not a union of old
    // and new capabilities.
    const hosts = compatibility.map((entry) => entry.host);
    await tx.skillHost.deleteMany({
      where: { skillId: version.skillId, ...(hosts.length ? { host: { notIn: hosts } } : {}) },
    });
    for (const entry of compatibility) {
      await tx.skillHost.upsert({
        where: { skillId_host: { skillId: version.skillId, host: entry.host as HostId } },
        create: {
          skillId: version.skillId,
          host: entry.host,
          status: entry.status,
          notes: entry.notes,
          validatedAt: new Date(),
        },
        update: { status: entry.status, notes: entry.notes, validatedAt: new Date() },
      });
    }
    await tx.auditLog.create({
      data: {
        userId: adminId,
        action: "version.publish",
        entity: "SkillVersion",
        entityId: version.id,
        metadata: JSON.stringify({ skillId: version.skillId, versionLabel: version.versionLabel }),
      },
    });
  });

  return { skillId: version.skillId, versionId: version.id, hosts: compatibility.length };
}

export async function rejectVersion(versionId: string, adminId: string) {
  const version = await db.skillVersion.findUnique({
    where: { id: versionId },
    include: { skill: { select: { id: true, currentVersionId: true } } },
  });
  if (!version) throw new HttpError(404, "Version not found");
  if (version.skill.currentVersionId === version.id) {
    throw new HttpError(409, "Cannot reject the currently published version; publish another version first");
  }
  await db.$transaction(async (tx) => {
    const current = await tx.skill.findUnique({
      where: { id: version.skillId },
      select: { currentVersionId: true },
    });
    if (current?.currentVersionId === version.id) {
      throw new HttpError(409, "Cannot reject the currently published version; publish another version first");
    }
    await tx.skillVersion.update({ where: { id: version.id }, data: { status: "REJECTED" } });
    if (!current?.currentVersionId) {
      const remaining = await tx.skillVersion.count({
        where: { skillId: version.skillId, status: { not: "REJECTED" } },
      });
      if (remaining === 0) {
        await tx.skill.update({ where: { id: version.skillId }, data: { status: "REJECTED" } });
      }
    }
    await tx.auditLog.create({
      data: {
        userId: adminId,
        action: "version.reject",
        entity: "SkillVersion",
        entityId: version.id,
        metadata: JSON.stringify({ skillId: version.skillId }),
      },
    });
  });
  return { ok: true };
}

export async function rejectSkill(skillId: string, adminId: string) {
  const skill = await db.skill.findUnique({ where: { id: skillId } });
  if (!skill) throw new HttpError(404, "Skill not found");
  await db.$transaction(async (tx) => {
    await tx.skill.update({ where: { id: skillId }, data: { status: "REJECTED", currentVersionId: null } });
    await tx.skillVersion.updateMany({
      where: { skillId, status: "QUARANTINED" },
      data: { status: "REJECTED" },
    });
    await tx.auditLog.create({
      data: {
        userId: adminId,
        action: "skill.reject",
        entity: "Skill",
        entityId: skillId,
        metadata: JSON.stringify({ name: skill.name }),
      },
    });
  });
  return { ok: true };
}

export async function approveSkill(skillId: string, adminId: string) {
  const pending = await db.skillVersion.findFirst({
    where: { skillId, status: "QUARANTINED" },
    orderBy: { createdAt: "desc" },
  });
  if (!pending) throw new HttpError(409, "There is no quarantined version to approve");
  return publishVersion(pending.id, adminId);
}
