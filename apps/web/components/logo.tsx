import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("group inline-flex items-center gap-2.5", className)}>
      <img
        src="/logo.png"
        alt=""
        width={28}
        height={28}
        className="size-7 rounded-md border border-border object-cover transition-colors group-hover:border-accent/50"
      />
      <span className="text-[13px] font-semibold tracking-tight">
        Skills<span className="text-muted-foreground"> Launcher</span>
      </span>
    </Link>
  );
}
