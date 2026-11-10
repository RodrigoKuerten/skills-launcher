import { OPERATION_LABEL } from "./constants";
import type { Source, SourceHealth } from "./types";

const LOCALE = "en-US";
const relativeFormatter = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });
const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const shortDateFormatter = new Intl.DateTimeFormat(LOCALE, {
  year: "numeric",
  month: "short",
  day: "numeric",
});
const compactNumber = new Intl.NumberFormat(LOCALE, {
  notation: "compact",
  maximumFractionDigits: 1,
});
const numberFormatter = new Intl.NumberFormat(LOCALE);
const DAY = 86_400_000;

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

export function formatCompact(value: number): string {
  return value >= 10_000 ? compactNumber.format(value) : numberFormatter.format(value);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateFormatter.format(date);
}

export function formatRelative(value: string | null | undefined): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  const diff = date.getTime() - Date.now();
  const absolute = Math.abs(diff);
  if (absolute < 60_000) return diff <= 0 ? "Just now" : "In a moment";
  if (absolute < 3_600_000) {
    return relativeFormatter.format(Math.round(diff / 60_000), "minute");
  }
  if (absolute < DAY) {
    return relativeFormatter.format(Math.round(diff / 3_600_000), "hour");
  }
  if (absolute < DAY * 30) {
    return relativeFormatter.format(Math.round(diff / DAY), "day");
  }
  return shortDateFormatter.format(date);
}

export function formatInterval(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "Manual only";
  if (minutes < 60) return `${minutes} min`;
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return days === 1 ? "Daily" : `Every ${days} days`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? "Hourly" : `Every ${hours} hours`;
  }
  return `${minutes} min`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}

export function truncateMiddle(value: string, max = 64): string {
  if (value.length <= max) return value;
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return `${value.slice(0, head)}…${value.slice(value.length - tail)}`;
}

export function sourceHealth(source: Source): SourceHealth {
  if (!source.enabled) return "disabled";
  if (source.lastStatus === "running") return "never";
  if (source.lastStatus === "error" || source.lastError) return "error";
  if (!source.lastSyncAt) return "never";
  return "ok";
}

export function sourceHealthLabel(source: Source): string {
  switch (sourceHealth(source)) {
    case "error":
      return "Sync failed";
    case "never":
      return source.lastStatus === "running" ? "Syncing" : "Not synced";
    case "disabled":
      return "Disabled";
    default:
      return "Healthy";
  }
}

export function operationLabel(kind: string): string {
  return (
    OPERATION_LABEL[kind] ??
    kind
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
  );
}

export function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.username === "" && url.password === "";
  } catch {
    return false;
  }
}

export function errorMessage(reason: unknown, fallback = "Something went wrong. Try again."): string {
  let text: string;
  if (typeof reason === "string") {
    text = reason;
  } else if (reason instanceof Error) {
    text = reason.message;
  } else if (reason && typeof reason === "object") {
    try {
      text = JSON.stringify(reason);
    } catch {
      text = "";
    }
  } else {
    text = "";
  }
  // Errors are plain text. Strip any markup before it reaches a toast.
  text = text
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) text = fallback;
  return text.length > 520 ? `${text.slice(0, 517)}…` : text;
}

export function parsePositiveInt(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the selection-based copy path.
    }
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.append(area);
  area.select();
  const copied = document.execCommand("copy");
  area.remove();
  if (!copied) throw new Error("Clipboard access is not available in this window.");
}

export function downloadTextFile(filename: string, text: string): void {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function humanizeStatus(status: string): string {
  return status
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
