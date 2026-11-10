export function cn(
  ...values: Array<string | false | null | undefined | Record<string, boolean | undefined>>
): string {
  const parts: string[] = [];
  for (const value of values) {
    if (!value) continue;
    if (typeof value === "string") parts.push(value);
    else if (typeof value === "object") {
      for (const [key, enabled] of Object.entries(value)) if (enabled) parts.push(key);
    }
  }
  return parts.join(" ");
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { notation: value >= 10_000 ? "compact" : "standard" }).format(value);
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(
    new Date(value),
  );
}

export function formatRelative(value: Date | string | null | undefined): string {
  if (!value) return "never";
  const date = new Date(value).getTime();
  const diff = Date.now() - date;
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}

export function hostLabel(host: string): string {
  const labels: Record<string, string> = {
    "claude-code": "Claude Code",
    codex: "Codex",
    opencode: "OpenCode",
    cursor: "Cursor",
    windsurf: "Windsurf",
    copilot: "Copilot",
    "gemini-cli": "Gemini CLI",
  };
  return labels[host] ?? host;
}

export function publicUrl(value: string): string {
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return "";
  }
}

export function redactTextUrls(value: string): string {
  return value.replace(/https?:\/\/[^\s"'<>]+/g, (raw) => publicUrl(raw) || "[url]");
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
