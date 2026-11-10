import { HOST_IDS } from "./types";
import type { QualityInput, QualityResult, TrustLevel } from "./types";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function ageInDays(pushedAt: string | Date | null): number | null {
  if (pushedAt === null) return null;
  const date = pushedAt instanceof Date ? pushedAt : new Date(pushedAt);
  const time = date.getTime();
  if (Number.isNaN(time)) return null;
  return Math.max(0, (Date.now() - time) / 86_400_000);
}

export function qualityScore(input: QualityInput): QualityResult {
  const signals: string[] = [];
  const breakdown: Record<string, number> = {};

  const source =
    input.sourceTrust === "OFFICIAL"
      ? 15
      : input.sourceTrust === "VERIFIED"
        ? 11
        : 6;
  breakdown.source = source;
  signals.push(`Source trust ${input.sourceTrust}: ${source}/15.`);

  const days = ageInDays(input.pushedAt);
  let freshness = 0;
  if (days !== null) {
    if (days <= 90) freshness = 20;
    else if (days <= 365) freshness = 10;
  }
  breakdown.freshness = freshness;
  signals.push(
    days === null
      ? "No repository push date available: 0/20 freshness."
      : `Last push ${Math.round(days)} day(s) ago: ${freshness}/20 freshness.`,
  );

  let docs = 0;
  if (input.docsLength >= 2000) docs += 6;
  else if (input.docsLength >= 500) docs += 4;
  else if (input.docsLength > 0) docs += 2;
  if (input.hasInstallInstructions) docs += 3;
  if (input.hasDescription) docs += 2;
  if (input.hasLicense) docs += 4;
  docs = Math.min(15, docs);
  breakdown.docs = docs;
  signals.push(
    `Docs: ${input.docsLength} chars, license ${input.hasLicense ? "present" : "missing"}, install instructions ${input.hasInstallInstructions ? "present" : "missing"}: ${docs}/15.`,
  );

  const stars = Math.max(0, input.stars);
  const forks = Math.max(0, input.forks);
  const community = clamp(
    Math.round(
      Math.min(14, Math.log10(stars + 1) * 4) +
        Math.min(6, Math.log10(forks + 1) * 2),
    ),
    0,
    20,
  );
  breakdown.community = community;
  signals.push(
    `Community: ${stars} star(s), ${forks} fork(s): ${community}/20.`,
  );

  const verifiedHosts = clamp(
    Math.floor(input.compatibilityVerified),
    0,
    HOST_IDS.length,
  );
  const compatibility = Math.round(
    (verifiedHosts / HOST_IDS.length) * 15,
  );
  breakdown.compatibility = compatibility;
  signals.push(
    `Compatibility: ${verifiedHosts}/${HOST_IDS.length} hosts: ${compatibility}/15.`,
  );

  const security = Math.round(
    (clamp(input.securityScore, 0, 100) / 100) * 15,
  );
  breakdown.security = security;
  signals.push(
    `Security score ${input.securityScore}/100: ${security}/15.`,
  );

  let total =
    source +
    freshness +
    docs +
    community +
    compatibility +
    security;

  if (input.archived) {
    total -= 20;
    breakdown.archivedPenalty = -20;
    signals.push("Archived repository: -20 points.");
  }

  total = clamp(Math.round(total), 0, 100);

  let trustLevel: TrustLevel;
  if (input.riskLevel === "HIGH" || input.riskLevel === "CRITICAL") {
    trustLevel = "UNSAFE";
    signals.push(`Security risk level ${input.riskLevel}: marked UNSAFE.`);
  } else if (input.archived) {
    trustLevel = "ARCHIVED";
  } else if (days !== null && days > 365) {
    trustLevel = "STALE";
    signals.push("No push in over 365 days: marked STALE.");
  } else if (input.sourceTrust === "OFFICIAL" && total >= 60) {
    trustLevel = "OFFICIAL";
  } else if (input.sourceTrust === "VERIFIED" && total >= 70) {
    trustLevel = "VERIFIED_COMMUNITY";
  } else {
    trustLevel = "IN_REVIEW";
  }

  return { total, breakdown, trustLevel, signals };
}
