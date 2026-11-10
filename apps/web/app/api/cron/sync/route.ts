import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { assertSameOrigin, errorResponse, json } from "@/lib/http";

function secretMatches(candidate: string, secret: string): boolean {
  const a = Buffer.from(candidate);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  try {
    const configured = process.env.CRON_SECRET;
    const secret =
      configured && configured !== "change-me-in-production" && configured !== "dev-cron-secret"
        ? configured
        : null;
    const header = request.headers.get("authorization") ?? "";
    const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
    const cronOk = Boolean(secret && bearer && secretMatches(bearer, secret));

    if (!cronOk) {
      try {
        assertSameOrigin(request);
      } catch {
        return json({ error: "Forbidden" }, { status: 403 });
      }
      const user = await getSessionUser();
      if (!user || user.role !== "ADMIN") {
        return json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    // Imported lazily so pages that do not sync never load the GitHub client.
    const { runDueSources } = await import("@/lib/sync/engine");
    const summary = await runDueSources({ limit: 4 });
    return json({ ok: true, ...summary });
  } catch (error) {
    return errorResponse(error);
  }
}
