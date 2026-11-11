import { ShieldCheck } from "lucide-react";
import { cx } from "../lib/cx";
import type { RiskLevel } from "../lib/types";
import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";
import { RiskGlyph } from "./RiskGlyph";

const LEVELS: Array<{
  value: RiskLevel;
  label: string;
  summary: string;
  action: string;
}> = [
  {
    value: "LOW",
    label: "Low risk",
    summary: "No blocking rule matched this version.",
    action: "Install is allowed. A clean text scan is not a guarantee that the skill is safe.",
  },
  {
    value: "MEDIUM",
    label: "Medium risk",
    summary: "A non-blocking warning was found.",
    action: "Install is allowed. Review findings such as non-HTTPS or shortened links.",
  },
  {
    value: "HIGH",
    label: "High risk",
    summary: "A serious content signal was found.",
    action: "Install is blocked by default. Review the findings and source before explicitly allowing it.",
  },
  {
    value: "CRITICAL",
    label: "Critical risk",
    summary: "A critical signal was found and the version is quarantined.",
    action: "The UI blocks installation. Inspect the findings and source before trusting this version.",
  },
];

const TONES: Record<RiskLevel, { text: string; border: string; background: string; dot: string }> = {
  LOW: {
    text: "text-ok",
    border: "border-ok/30",
    background: "bg-ok/[0.06]",
    dot: "bg-ok",
  },
  MEDIUM: {
    text: "text-warn",
    border: "border-warn/30",
    background: "bg-warn/[0.06]",
    dot: "bg-warn",
  },
  HIGH: {
    text: "text-danger",
    border: "border-danger/35",
    background: "bg-danger/[0.07]",
    dot: "bg-danger",
  },
  CRITICAL: {
    text: "text-danger",
    border: "border-danger/50",
    background: "bg-danger/[0.1]",
    dot: "bg-danger",
  },
};

function normalizeRisk(risk: RiskLevel | string): RiskLevel {
  return (risk.toUpperCase() in TONES ? risk.toUpperCase() : "LOW") as RiskLevel;
}

export function RiskInfoDialog({
  risk,
  open,
  onOpenChange,
}: {
  risk: RiskLevel | string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const current = normalizeRisk(risk);
  const meta = LEVELS.find((level) => level.value === current) ?? LEVELS[0]!;
  const tone = TONES[current];

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`${meta.label} explained`}
      description="How Skills Launcher classifies this content and what it means for installation."
      size="md"
      footer={
        <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
          Got it
        </Button>
      }
    >
      <div className="space-y-4">
        <section
          className={cx(
            "relative overflow-hidden rounded-xl border px-4 py-4",
            tone.border,
            tone.background,
          )}
        >
          <div className="pointer-events-none absolute -right-8 -top-10 size-40 rounded-full bg-current/10 blur-2xl" aria-hidden="true" />
          <div className="relative flex items-center gap-4">
            <div className={cx("relative grid size-24 shrink-0 place-items-center rounded-[24px] border bg-canvas/35", tone.border, tone.text)}>
              <svg viewBox="0 0 96 96" className="absolute inset-0 size-full opacity-35" aria-hidden="true">
                <circle cx="48" cy="48" r="38" fill="none" stroke="currentColor" strokeDasharray="2 7" />
                <circle cx="48" cy="48" r="29" fill="none" stroke="currentColor" strokeOpacity="0.55" />
                <circle cx="48" cy="13" r="2.2" fill="currentColor" />
              </svg>
              <RiskGlyph risk={current} className="relative size-12" />
            </div>
            <div className="min-w-0">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-soft">
                <span className={cx("size-1.5 rounded-full", tone.dot)} aria-hidden="true" />
                Current level
              </span>
              <h3 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-text">{meta.label}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted">{meta.summary}</p>
            </div>
          </div>
          <p className={cx("relative mt-3 border-t pt-3 text-[11px] leading-relaxed", tone.border, tone.text)}>
            {meta.action}
          </p>
        </section>

        <section aria-labelledby="risk-scale-title">
          <h3 id="risk-scale-title" className="text-xs font-semibold text-text">
            The four levels
          </h3>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {LEVELS.map((level) => {
              const levelTone = TONES[level.value];
              const active = level.value === current;
              return (
                <div
                  key={level.value}
                  className={cx(
                    "rounded-lg border p-3",
                    active ? cx(levelTone.border, levelTone.background) : "border-line bg-surface/40",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className={cx("grid size-6 place-items-center rounded-md border bg-canvas/30", levelTone.border, levelTone.text)}>
                      <RiskGlyph risk={level.value} className="size-4" fill={false} />
                    </span>
                    <span className={cx("text-[11px] font-semibold", active ? levelTone.text : "text-text")}>
                      {level.label}
                    </span>
                    {active ? (
                      <span className="ml-auto rounded border border-current/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                        Current
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{level.summary}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl border border-line bg-surface/40 p-3.5">
          <h3 className="flex items-center gap-2 text-xs font-semibold text-text">
            <ShieldCheck className="size-3.5 text-brand-soft" aria-hidden="true" />
            How the level is chosen
          </h3>
          <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-muted">
            <li>The text scanner looks for prompt injection, destructive commands, secret requests, remote execution, hidden Unicode and suspicious links.</li>
            <li>The worst finding sets the level. The 0–100 security score is a separate signal and does not change the level by itself.</li>
            <li>Included scripts are flagged but never executed. They produce a low-severity finding.</li>
          </ul>
        </section>

        <p className="rounded-lg border border-line bg-canvas/35 px-3 py-2.5 text-[11px] leading-relaxed text-muted-soft">
          This is a heuristic scanner, not a security guarantee. A clean scan means no known rule matched; it does not
          prove that the skill is safe or that it matches its description.
        </p>
      </div>
    </Dialog>
  );
}
