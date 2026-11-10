import { isIP } from "node:net";
import { HttpError } from "@/lib/http";
import { slugify } from "@/lib/utils";

export const SOURCE_TYPES = ["GITHUB_REPO", "RSS", "HTTP_JSON"] as const;
export const TRUST_TIERS = ["OFFICIAL", "VERIFIED", "COMMUNITY"] as const;

export function parseRepoInput(input: string): { owner: string; repo: string; full: string } {
  const cleaned = input
    .trim()
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "");
  const match = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(cleaned);
  if (!match || !match[1] || !match[2]) throw new HttpError(400, "Repository must be owner/name or a GitHub URL");
  return { owner: match[1], repo: match[2], full: `${match[1]}/${match[2]}` };
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (!host.includes(".") && isIP(host) === 0) return true; // single-label / intranet host
  if (/^\d+$/.test(host)) return true; // numeric IPv4 encodings are ambiguous
  const version = isIP(host);
  if (version === 4) {
    const [a = 0, b = 0] = host.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  if (version === 6) {
    return (
      host === "::" ||
      host === "::1" ||
      host.startsWith("fe80:") ||
      host.startsWith("fc") ||
      host.startsWith("fd") ||
      host.startsWith("::ffff:")
    );
  }
  return false;
}

/** Admin-only outbound URLs: https, public hostname, no credentials. */
export function assertPublicFeedUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new HttpError(400, "Invalid URL");
  }
  if (url.protocol !== "https:") throw new HttpError(400, "Sources must use https");
  if (url.username || url.password) throw new HttpError(400, "URL credentials are not allowed");
  if (isPrivateHost(url.hostname)) {
    throw new HttpError(400, "Private or loopback source URLs are not allowed");
  }
  return url.toString();
}

export function normalizeSourceName(name: string): string {
  return slugify(name).slice(0, 60) || "source";
}
