import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { db } from "./db";
import { hashPassword, verifyPassword } from "./password";

const SESSION_COOKIE = "ash_session";
const SESSION_DAYS = 30;

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: string;
};

export { hashPassword, verifyPassword };

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function createSession(userId: string): Promise<void> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.session.create({ data: { tokenHash: sha256(token), userId, expiresAt } });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
  store.delete(SESSION_COOKIE);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { select: { id: true, email: true, name: true, role: true } } },
  });
  if (!session || session.expiresAt.getTime() < Date.now()) return null;
  return session.user;
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/library");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin");
  if (user.role !== "ADMIN") redirect("/");
  return user;
}

/** Bearer API token auth for the local companion's installation reports. */
export async function getApiTokenUser(request: NextRequest): Promise<SessionUser | null> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const raw = header.slice(7).trim();
  if (!raw) return null;
  const record = await db.apiToken.findUnique({
    where: { tokenHash: sha256(raw) },
    include: { user: { select: { id: true, email: true, name: true, role: true } } },
  });
  if (!record) return null;
  void db.apiToken.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return record.user;
}

export async function createApiToken(userId: string, name: string): Promise<string> {
  const raw = `sh_${randomToken(24)}`;
  await db.apiToken.create({ data: { tokenHash: sha256(raw), userId, name } });
  return raw;
}
