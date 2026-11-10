import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, {
    ...init,
    headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) },
  });
}

/** Public, non-user-specific data may be cached briefly at the edge/browser. */
export function jsonCached(data: unknown, maxAgeSeconds = 30, init?: ResponseInit) {
  return NextResponse.json(data, {
    ...init,
    headers: {
      "Cache-Control": `public, max-age=${maxAgeSeconds}, stale-while-revalidate=120`,
      ...(init?.headers ?? {}),
    },
  });
}

export function errorResponse(error: unknown) {
  if (error instanceof HttpError) return json({ error: error.message }, { status: error.status });
  console.error("[api]", error);
  return json({ error: "Internal server error" }, { status: 500 });
}

/**
 * CSRF defense for cookie-authenticated mutations: the Origin (when present)
 * must match the request host. CLI/agent callers use bearer tokens instead.
 */
export function assertSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return; // same-origin fetch from server/curl; auth still required
  const host = request.headers.get("host");
  try {
    if (new URL(origin).host !== host) throw new HttpError(403, "Cross-origin request rejected");
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(403, "Invalid origin");
  }
}

const buckets = new Map<string, { count: number; resetAt: number }>();

/** Fixed-window limiter. Single instance only; swap for Redis in production. */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  if (buckets.size > 5000) {
    for (const [bucketKey, value] of buckets) if (value.resetAt < now) buckets.delete(bucketKey);
    // Bound memory even under a rotating-key flood.
    if (buckets.size > 10_000) buckets.clear();
  }
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

export function clientIp(request: NextRequest): string {
  // Trust only the proxy-appended hop. Do not trust a client-supplied leftmost
  // X-Forwarded-For value. A deployment behind multiple proxies should normalize
  // this at the edge.
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((part) => part.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1]!;
  }
  return request.headers.get("x-real-ip")?.trim() || "local";
}

export function assertBodySize(request: NextRequest, maxBytes = 1_000_000): void {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new HttpError(413, "Request body too large");
  }
}

export async function readJson<T>(request: NextRequest): Promise<T> {
  assertBodySize(request);
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Request body is required");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 1_000_000) {
        await reader.cancel();
        throw new HttpError(413, "Request body too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}

export function assertString(value: unknown, field: string, max = 10_000): string {
  if (typeof value !== "string" || !value.trim()) throw new HttpError(400, `Missing ${field}`);
  if (value.length > max) throw new HttpError(400, `${field} is too long`);
  return value.trim();
}
