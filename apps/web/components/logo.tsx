import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("group inline-flex items-center gap-2.5", className)}>
      <span className="relative grid size-7 place-items-center rounded-md border border-border bg-card transition-colors group-hover:border-accent/50">
        <span className="grid grid-cols-3 gap-[3px]">
          {Array.from({ length: 9 }).map((_, index) => (
            <span
              key={index}
              className={cn(
                "size-[3px] rounded-[1px] bg-muted-foreground/60",
                index === 4 && "bg-accent shadow-[0_0_6px_var(--accent)]",
              )}
            />
          ))}
        </span>
      </span>
      <span className="text-[13px] font-semibold tracking-tight">
        Skills<span className="text-muted-foreground">Hub</span>
      </span>
    </Link>
  );
}
