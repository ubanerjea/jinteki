import { PrismaClient } from "@prisma/client";

// Standard Next.js dev-mode hot-reload-safe Prisma Client singleton.
// Without this, every hot reload in `next dev` would create a new
// PrismaClient and eventually exhaust Postgres connections.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
