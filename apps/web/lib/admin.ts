import { getSessionUser, type SessionUser } from "@/lib/auth";
import { HttpError } from "@/lib/http";

export async function requireAdminApi(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new HttpError(401, "Authentication required");
  if (user.role !== "ADMIN") throw new HttpError(403, "Admin role required");
  return user;
}
