import { Prisma } from "@prisma/client";

export function publicDecklistSql(): Prisma.Sql {
  return Prisma.sql`d."isPublic" = true`;
}

export function canViewDecklist(
  decklist: { isPublic: boolean; ownerId: string | null },
  userId: string | null | undefined,
): boolean {
  return decklist.isPublic || (userId != null && decklist.ownerId === userId);
}
