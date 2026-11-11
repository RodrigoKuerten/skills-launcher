import { useId, type ReactNode } from "react";
import { cx } from "../lib/cx";
import type { RiskLevel } from "../lib/types";

const GLYPHS: Record<RiskLevel, ReactNode> = {
  LOW: (
    <path
      d="m8.2 12.1 2.3 2.3 5.3-5.4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.2"
    />
  ),
  MEDIUM: (
    <>
      <path d="M12 7.7v5.1" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />
      <circle cx="12" cy="16.5" r="1.15" fill="currentColor" />
    </>
  ),
  HIGH: (
    <>
      <path d="M12 6.8v6.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />
      <circle cx="12" cy="16.7" r="1.15" fill="currentColor" />
    </>
  ),
  CRITICAL: (
    <>
      <path
        d="m8.3 8.3 7.4 7.4m0-7.4-7.4 7.4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2.2"
      />
    </>
  ),
};

export function RiskGlyph({
  risk,
  className,
  fill = true,
}: {
  risk: RiskLevel | string;
  className?: string;
  fill?: boolean;
}) {
  const level = (risk in GLYPHS ? risk : "LOW") as RiskLevel;
  const gradientId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <svg
      viewBox="0 0 24 24"
      className={cx("shrink-0", className)}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="5" y1="3" x2="19" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.26" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.06" />
        </linearGradient>
      </defs>
      <path
        d="M12 2.8 19.6 5.7v5.6c0 4.9-3.1 8.4-7.6 10.1-4.5-1.7-7.6-5.2-7.6-10.1V5.7L12 2.8Z"
        fill={fill ? `url(#${gradientId})` : "none"}
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.35"
      />
      {GLYPHS[level]}
    </svg>
  );
}
