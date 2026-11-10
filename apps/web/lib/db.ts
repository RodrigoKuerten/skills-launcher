import { PrismaClient } from "@prisma/client";

// shortcut: dev-only fallback for direct `next dev` launches without env;
// production must provide DATABASE_URL explicitly.
if (!process.env.DATABASE_URL && process.env.NODE_ENV !== "production") {
  process.env.DATABASE_URL = "file:./dev.db";
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

let pragmasApplied = false;

/** SQLite safety: WAL + a busy timeout for the single-writer job worker. */
export async function ensureSqlitePragmas() {
  if (pragmasApplied) return;
  pragmasApplied = true;
  try {
    // PRAGMA journal_mode/busy_timeout return a row, so they need queryRaw.
    await db.$queryRawUnsafe("PRAGMA journal_mode=WAL");
    await db.$queryRawUnsafe("PRAGMA busy_timeout=5000");
    await db.$executeRawUnsafe("PRAGMA foreign_keys=ON");
  } catch {
    // Non-SQLite providers ignore this.
  }
}
