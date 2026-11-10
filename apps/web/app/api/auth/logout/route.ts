import { NextResponse, type NextRequest } from "next/server";
import { destroySession } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/http";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
  } catch {
    return new NextResponse("Forbidden", { status: 403 });
  }
  await destroySession();
  return NextResponse.redirect(new URL("/", request.url), 303);
}
