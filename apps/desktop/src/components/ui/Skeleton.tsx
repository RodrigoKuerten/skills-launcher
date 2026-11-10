import { cx } from "../../lib/cx";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-md bg-text/[0.065]", className)} aria-hidden="true" />;
}
