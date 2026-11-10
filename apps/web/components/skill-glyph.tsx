import {
  Box,
  Bot,
  Code2,
  Container,
  Database,
  Layers,
  ListChecks,
  Palette,
  Search,
  Server,
  Shield,
  TestTube2,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const icons: Record<string, LucideIcon> = {
  frontend: Code2,
  backend: Server,
  design: Palette,
  architecture: Layers,
  security: Shield,
  devops: Container,
  automation: Zap,
  ai: Bot,
  database: Database,
  testing: TestTube2,
  research: Search,
  productivity: ListChecks,
};

function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) h = (h * 31 + value.charCodeAt(i)) % 360;
  return h;
}

export function SkillGlyph({
  slug,
  category,
  size = "md",
  className,
}: {
  slug: string;
  category?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const hue = hash(slug);
  const Icon = icons[category ?? ""] ?? Box;
  const dimensions = { sm: "size-8 rounded-md", md: "size-10 rounded-lg", lg: "size-14 rounded-xl" }[size];
  const iconSize = { sm: "size-4", md: "size-5", lg: "size-7" }[size];

  return (
    <div
      className={cn("relative grid shrink-0 place-items-center border border-white/10", dimensions, className)}
      style={{
        background: `radial-gradient(120% 120% at 20% 0%, hsl(${hue} 70% 58% / 0.28), transparent 60%), linear-gradient(145deg, hsl(${hue} 45% 18% / 0.9), hsl(${(hue + 50) % 360} 40% 10% / 0.9))`,
        boxShadow: `inset 0 1px 0 hsl(${hue} 80% 80% / 0.12)`,
      }}
      aria-hidden
    >
      <Icon className={cn(iconSize, "text-white/85")} strokeWidth={1.6} />
    </div>
  );
}
