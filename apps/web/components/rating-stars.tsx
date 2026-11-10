import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function RatingStars({ value, className }: { value: number; className?: string }) {
  return (
    <span role="img" className={cn("inline-flex items-center gap-0.5", className)} aria-label={`${value.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={cn("size-3", value >= star - 0.25 ? "fill-accent text-accent" : "text-border")}
          aria-hidden
        />
      ))}
    </span>
  );
}
