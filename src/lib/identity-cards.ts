import { prisma } from "@/lib/prisma";

// Confirmed live against DISTINCT typeCode: identities are corp_identity
// (81) and runner_identity (67). There is no `identity` typeCode.
export const IDENTITY_TYPE_CODES = ["corp_identity", "runner_identity"] as const;

export type IdentityCard = {
  code: string;
  title: string;
  factionCode: string;
  typeCode: string;
  sideCode: string;
};

export function isIdentityTypeCode(typeCode: string): boolean {
  return (IDENTITY_TYPE_CODES as readonly string[]).includes(typeCode);
}

export async function listIdentityCards(): Promise<IdentityCard[]> {
  return prisma.card.findMany({
    where: { typeCode: { in: [...IDENTITY_TYPE_CODES] } },
    select: {
      code: true,
      title: true,
      factionCode: true,
      typeCode: true,
      sideCode: true,
    },
    orderBy: [{ sideCode: "asc" }, { title: "asc" }],
  });
}
