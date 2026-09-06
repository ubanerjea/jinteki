import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { IDENTITY_TYPE_CODES, isIdentityTypeCode, listIdentityCards } from "./identity-cards";

afterAll(async () => {
  await prisma.$disconnect();
});

describe("identity type codes (live DB)", () => {
  it("identities are corp_identity and runner_identity, not identity", async () => {
    const rows = await prisma.card.groupBy({ by: ["typeCode"] });
    const identityLike = rows
      .map((r) => r.typeCode)
      .filter((code) => code.includes("identity"))
      .sort();
    expect(identityLike).toEqual(["corp_identity", "runner_identity"]);
    expect(identityLike).toEqual([...IDENTITY_TYPE_CODES].sort());
    expect(isIdentityTypeCode("identity")).toBe(false);
  });

  it("listIdentityCards returns every identity, title + faction", async () => {
    const direct = await prisma.card.count({
      where: { typeCode: { in: [...IDENTITY_TYPE_CODES] } },
    });
    const listed = await listIdentityCards();
    expect(listed.length).toBe(direct);
    expect(listed.length).toBeGreaterThan(0);
    expect(listed.every((c) => isIdentityTypeCode(c.typeCode))).toBe(true);
    expect(listed.every((c) => c.title && c.factionCode)).toBe(true);
  });
});
