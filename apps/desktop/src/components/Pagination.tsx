import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatNumber } from "../lib/format";
import { IconButton } from "./ui/IconButton";

export interface PaginationProps {
  page: number;
  pages: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, pages, total, onPageChange }: PaginationProps) {
  if (pages <= 1) {
    return (
      <p className="text-[11px] text-muted">
        {formatNumber(total)} {total === 1 ? "skill" : "skills"}
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-[11px] text-muted">
        {formatNumber(total)} {total === 1 ? "skill" : "skills"} · page {page} of {pages}
      </p>
      <div className="flex items-center gap-1.5">
        <IconButton
          label="Previous page"
          icon={<ChevronLeft className="size-4" aria-hidden="true" />}
          variant="secondary"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
        />
        <span className="min-w-14 text-center font-mono text-[11px] tabular-nums text-muted">
          {page} / {pages}
        </span>
        <IconButton
          label="Next page"
          icon={<ChevronRight className="size-4" aria-hidden="true" />}
          variant="secondary"
          onClick={() => onPageChange(Math.min(pages, page + 1))}
          disabled={page >= pages}
        />
      </div>
    </div>
  );
}
