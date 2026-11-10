import { NextResponse, type NextRequest } from "next/server";
import { listSkills, parseCatalogParams } from "@/lib/catalog";
import { errorResponse, json, rateLimit, clientIp } from "@/lib/http";

export async function GET(request: NextRequest) {
  try {
    if (!rateLimit(`api:skills:${clientIp(request)}`, 120, 60_000)) {
      return json({ error: "Rate limit exceeded" }, { status: 429 });
    }
    const url = new URL(request.url);
    const params = parseCatalogParams(Object.fromEntries(url.searchParams.entries()));
    const result = await listSkills(params);
    return json({
      data: result.items,
      meta: { total: result.total, page: result.page, pages: result.pages, limit: result.limit },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: { Allow: "GET, OPTIONS" } });
}
