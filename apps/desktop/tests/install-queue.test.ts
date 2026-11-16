import { describe, expect, it } from "vitest";
import {
  installQueuedSkills,
  queueBlockReason,
  type InstallQueueItem,
} from "../src/lib/install-queue";
import type { SkillSummary } from "../src/lib/types";

const items: InstallQueueItem[] = [
  { skillId: "a", name: "Alpha", versionId: "a1", versionLabel: "1.0.0", allowRisky: false },
  { skillId: "b", name: "Beta", versionId: "b1", versionLabel: "1.0.0", allowRisky: false },
  { skillId: "c", name: "Gamma", versionId: "c1", versionLabel: "1.0.0", allowRisky: true },
];

const hostName = (host: string) => (host === "codex" ? "Codex" : host === "cursor" ? "Cursor" : host);

describe("installQueuedSkills", () => {
  it("completes a skill only when every target host succeeds", async () => {
    const calls: Array<{ skillId: string; hosts: string[]; allowRisky: boolean }> = [];
    const result = await installQueuedSkills({
      items,
      hosts: ["codex", "cursor"],
      hostName,
      install: async (request) => {
        calls.push({
          skillId: request.skillId,
          hosts: request.hosts,
          allowRisky: request.allowRisky,
        });
        if (request.skillId === "a") {
          return { outcomes: [{ host: "codex", ok: true, message: "", installPath: null }] };
        }
        if (request.skillId === "b") {
          return {
            outcomes: [
              { host: "codex", ok: true, message: "", installPath: null },
              { host: "cursor", ok: false, message: "write failed", installPath: null },
            ],
          };
        }
        throw new Error("disk full");
      },
    });

    expect(calls.map((call) => call.skillId)).toEqual(["a", "b", "c"]);
    expect(calls[0]?.hosts).toEqual(["codex", "cursor"]);
    expect(calls[2]?.allowRisky).toBe(true);
    expect(result.completed).toEqual(["a"]);
    expect(result.failures).toHaveLength(2);
    expect(result.failures[0]).toContain("Beta: Cursor: write failed");
    expect(result.failures[1]).toContain("Gamma: disk full");
  });
});

describe("queueBlockReason", () => {
  const base = {
    status: "PUBLISHED",
    riskLevel: "LOW",
    latestVersion: { id: "v1", status: "PUBLISHED" },
  } as SkillSummary;

  it("allows a published, low-risk skill", () => {
    expect(queueBlockReason(base)).toBeNull();
  });

  it("blocks quarantined, unversioned and high-risk skills", () => {
    expect(queueBlockReason({ ...base, status: "QUARANTINED" })).toMatch(/quarantined/i);
    expect(
      queueBlockReason({ ...base, latestVersion: { ...base.latestVersion!, status: "QUARANTINED" } }),
    ).toMatch(/quarantined/i);
    expect(queueBlockReason({ ...base, latestVersion: null })).toMatch(/no published version/i);
    expect(queueBlockReason({ ...base, riskLevel: "CRITICAL" })).toMatch(/high-risk/i);
  });
});
