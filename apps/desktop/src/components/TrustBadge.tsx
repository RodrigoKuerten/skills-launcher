import { BadgeCheck, Globe, Users } from "lucide-react";
import type { TrustLevel } from "../lib/types";
import { Badge, type BadgeTone } from "./ui/Badge";

const TONES: Record<string, BadgeTone> = {
  OFFICIAL: "brand",
  VERIFIED: "cyan",
  COMMUNITY: "neutral",
};

const LABELS: Record<string, string> = {
  OFFICIAL: "Official source",
  VERIFIED: "Verified source",
  COMMUNITY: "Community",
};

export function TrustBadge({ trust, className }: { trust: TrustLevel | string; className?: string }) {
  const Icon = trust === "OFFICIAL" ? BadgeCheck : trust === "VERIFIED" ? Globe : Users;
  return (
    <Badge
      tone={TONES[trust] ?? "neutral"}
      className={className}
      title="Source label set by you in Sources; it is not a platform signature."
    >
      <Icon className="size-2.5" aria-hidden="true" />
      {LABELS[trust] ?? trust}
    </Badge>
  );
}
