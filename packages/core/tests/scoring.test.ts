import { describe, expect, it } from "vitest";
import { qualityScore } from "../src/scoring.js";
import type { QualityInput } from "../src/types.js";

function baseInput(overrides: Partial<QualityInput> = {}): QualityInput {
  return {
    sourceTrust: "OFFICIAL",
    stars: 1200,
    forks: 80,
    pushedAt: new Date().toISOString(),
    docsLength: 3000,
    hasLicense: true,
    hasInstallInstructions: true,
    compatibilityVerified: 7,
    securityScore: 100,
    riskLevel: "LOW",
    archived: false,
    hasDescription: true,
    fileCount: 4,
    ...overrides,
  };
}

describe("qualityScore", () => {
  it("scores a strong official skill as OFFICIAL", () => {
    const result = qualityScore(baseInput());

    expect(result.total).toBeGreaterThanOrEqual(85);
    expect(result.total).toBeLessThanOrEqual(100);
    expect(result.trustLevel).toBe("OFFICIAL");
    expect(result.signals.length).toBeGreaterThan(0);

    const componentSum = [
      "source",
      "freshness",
      "docs",
      "community",
      "compatibility",
      "security",
    ].reduce((sum, key) => sum + (result.breakdown[key] ?? 0), 0);
    expect(result.total).toBe(componentSum);
  });

  it("marks high or critical security risk as UNSAFE", () => {
    const high = qualityScore(
      baseInput({ riskLevel: "HIGH", securityScore: 60 }),
    );
    const critical = qualityScore(
      baseInput({ riskLevel: "CRITICAL", securityScore: 0 }),
    );

    expect(high.trustLevel).toBe("UNSAFE");
    expect(critical.trustLevel).toBe("UNSAFE");
  });

  it("marks archived repositories ARCHIVED and subtracts 20 points", () => {
    const fresh = qualityScore(baseInput());
    const archived = qualityScore(baseInput({ archived: true }));

    expect(archived.trustLevel).toBe("ARCHIVED");
    expect(archived.breakdown.archivedPenalty).toBe(-20);
    expect(archived.total).toBe(fresh.total - 20);
  });

  it("uses full, partial and zero freshness bands", () => {
    const now = Date.now();
    const day = 86_400_000;

    const fresh = qualityScore(
      baseInput({ pushedAt: new Date(now - 30 * day).toISOString() }),
    );
    const partial = qualityScore(
      baseInput({ pushedAt: new Date(now - 200 * day).toISOString() }),
    );
    const old = qualityScore(
      baseInput({ pushedAt: new Date(now - 500 * day).toISOString() }),
    );

    expect(fresh.breakdown.freshness).toBe(20);
    expect(partial.breakdown.freshness).toBe(10);
    expect(old.breakdown.freshness).toBe(0);
  });

  it("marks repositories without a push in over 365 days as STALE", () => {
    const result = qualityScore(
      baseInput({
        pushedAt: new Date(Date.now() - 400 * 86_400_000).toISOString(),
      }),
    );

    expect(result.trustLevel).toBe("STALE");
  });

  it("marks qualifying verified community sources VERIFIED_COMMUNITY", () => {
    const result = qualityScore(
      baseInput({ sourceTrust: "VERIFIED", securityScore: 100 }),
    );

    expect(result.total).toBeGreaterThanOrEqual(70);
    expect(result.trustLevel).toBe("VERIFIED_COMMUNITY");
  });

  it("keeps totals inside 0-100", () => {
    const result = qualityScore(
      baseInput({
        sourceTrust: "COMMUNITY",
        stars: 0,
        forks: 0,
        pushedAt: null,
        docsLength: 0,
        hasLicense: false,
        hasInstallInstructions: false,
        compatibilityVerified: 0,
        securityScore: 0,
        hasDescription: false,
        fileCount: 0,
      }),
    );

    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(result.total).toBeLessThanOrEqual(100);
    expect(result.trustLevel).toBe("IN_REVIEW");
  });
});
