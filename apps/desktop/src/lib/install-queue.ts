import { errorMessage } from "./format";
import type { InstallResponse, SkillSummary } from "./types";

export interface InstallQueueItem {
  skillId: string;
  name: string;
  versionId: string;
  versionLabel: string;
  allowRisky: boolean;
}

export function queueBlockReason(skill: SkillSummary): string | null {
  if (skill.status === "QUARANTINED" || skill.latestVersion?.status === "QUARANTINED") {
    return "Quarantined skills cannot be installed from the queue.";
  }
  if (!skill.latestVersion) return "No published version is available yet.";
  if (skill.riskLevel === "HIGH" || skill.riskLevel === "CRITICAL") {
    return "High-risk skills must be reviewed and allowed in the detail sheet.";
  }
  return null;
}

export async function installQueuedSkills({
  items,
  hosts,
  install,
  hostName,
}: {
  items: InstallQueueItem[];
  hosts: string[];
  install: (request: {
    skillId: string;
    versionId: string | null;
    hosts: string[];
    allowRisky: boolean;
  }) => Promise<InstallResponse>;
  hostName: (host: string) => string;
}): Promise<{ completed: string[]; failures: string[] }> {
  const completed: string[] = [];
  const failures: string[] = [];

  for (const item of items) {
    try {
      const response = await install({
        skillId: item.skillId,
        versionId: item.versionId,
        hosts,
        allowRisky: item.allowRisky,
      });
      const failed = response.outcomes.filter((outcome) => !outcome.ok);
      if (response.outcomes.length === 0) {
        failures.push(`${item.name}: no install result was returned`);
      } else if (failed.length === 0) {
        completed.push(item.skillId);
      } else {
        failures.push(
          `${item.name}: ${failed
            .map((outcome) => `${hostName(outcome.host)}: ${outcome.message}`)
            .join(" · ")}`,
        );
      }
    } catch (reason) {
      failures.push(`${item.name}: ${errorMessage(reason)}`);
    }
  }

  return { completed, failures };
}
