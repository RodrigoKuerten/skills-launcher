import type { InstalledSkill } from "@skills-hub/core";
import { readState } from "./store.js";

export type ReportStatus = "INSTALLED" | "ROLLED_BACK" | "REMOVED";

export function marketplaceToken(): string | null {
  const token = process.env.SKILLS_HUB_API_TOKEN?.trim();
  return token ? token : null;
}

/**
 * Optional account sync. Reporting is best-effort and never blocks a local
 * install; the token is a capability created in the user's profile.
 */
export async function reportInstallation(
  installation: InstalledSkill,
  status: ReportStatus,
  appUrl: string,
  token: string | null = marketplaceToken(),
): Promise<{ reported: boolean; message?: string }> {
  if (!token) return { reported: false, message: "SKILLS_HUB_API_TOKEN is not set" };
  let base: URL;
  try {
    base = new URL(appUrl);
  } catch {
    return { reported: false, message: "Invalid marketplace URL" };
  }
  if (base.protocol !== "http:" && base.protocol !== "https:") {
    return { reported: false, message: "Marketplace URL must be http(s)" };
  }
  const state = await readState();
  try {
    const response = await fetch(`${base.origin}/api/v1/installations`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        machineId: state.machineId,
        skillSlug: installation.skillSlug,
        host: installation.host,
        versionLabel: installation.versionLabel,
        contentHash: installation.contentHash,
        installedPath: installation.installPath,
        status,
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return { reported: false, message: `HTTP ${response.status}: ${body.slice(0, 200)}` };
    }
    return { reported: true };
  } catch (error) {
    return { reported: false, message: error instanceof Error ? error.message : String(error) };
  }
}
