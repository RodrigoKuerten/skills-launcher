import { cx } from "../../lib/cx";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-shimmer rounded-md bg-elevated/70", className)} aria-hidden="true" />;
}
