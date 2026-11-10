import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { HttpError, assertBodySize, assertSameOrigin, clientIp, rateLimit } from "@/lib/http";
import { createSession, hashPassword } from "@/lib/auth";

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
  if (!rateLimit(`register:${ip}`, 5, 10 * 60_000)) {
    return NextResponse.redirect(new URL("/register?error=rate", request.url), 303);
  }

  const form = await request.formData();
  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");

  if (password.length < 8) {
    return NextResponse.redirect(new URL("/register?error=weak", request.url), 303);
  }
  if (!name || !email.includes("@")) {
    return NextResponse.redirect(new URL("/register?error=invalid", request.url), 303);
  }
  if (await db.user.findUnique({ where: { email } })) {
    return NextResponse.redirect(new URL("/register?error=exists", request.url), 303);
  }

  const user = await db.user.create({
    data: { name, email, passwordHash: await hashPassword(password), role: "USER" },
  });
  await createSession(user.id);
  await db.auditLog.create({
    data: { userId: user.id, action: "auth.register", entity: "User", entityId: user.id, ip },
  });
  return NextResponse.redirect(new URL("/explore", request.url), 303);
}
