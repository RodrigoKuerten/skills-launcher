import { ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import type { RiskLevel } from "../lib/types";
import { Badge, type BadgeTone } from "./ui/Badge";

const TONES: Record<string, BadgeTone> = {
  LOW: "ok",
  MEDIUM: "warn",
  HIGH: "danger",
  CRITICAL: "danger",
};

const LABELS: Record<string, string> = {
  LOW: "Low risk",
  MEDIUM: "Medium risk",
  HIGH: "High risk",
  CRITICAL: "Critical",
};

export function RiskBadge({ risk, className }: { risk: RiskLevel | string; className?: string }) {
  const Icon = risk === "LOW" ? ShieldCheck : risk === "MEDIUM" ? ShieldQuestion : ShieldAlert;
  return (
    <Badge tone={TONES[risk] ?? "neutral"} className={className}>
      <Icon className="size-2.5" aria-hidden="true" />
      {LABELS[risk] ?? risk}
    </Badge>
  );
}
