import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { HttpError, assertBodySize, assertSameOrigin, clientIp, rateLimit } from "@/lib/http";
import { createSession, verifyPassword } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    assertBodySize(request);
  } catch (error) {
    return new NextResponse(error instanceof HttpError ? error.message : "Forbidden", {
      status: error instanceof HttpError ? error.status : 403,
    });
  }
  const ip = clientIp(request);
  if (!rateLimit(`login:${ip}`, 10, 5 * 60_000)) {
    return NextResponse.redirect(new URL("/login?error=rate", request.url), 303);
  }

  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/explore");
  const safeNext = (() => {
    try {
      const target = new URL(next, request.url);
      if (target.origin !== new URL(request.url).origin) return "/explore";
      return `${target.pathname}${target.search}${target.hash}`;
    } catch {
      return "/explore";
    }
  })();

  const user = email ? await db.user.findUnique({ where: { email } }) : null;
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.redirect(new URL("/login?error=invalid", request.url), 303);
  }

  await createSession(user.id);
  await db.auditLog.create({
    data: { userId: user.id, action: "auth.login", entity: "User", entityId: user.id, ip },
  });
  return NextResponse.redirect(new URL(safeNext, request.url), 303);
}
