// Integration tests against the real, already-synced Postgres database
// (2054 cards) - not fixture-based like Phase 2/3's mapper tests. Per
// PHASE_4_PLAN.md: "Decide during the build whether these need a real
// Postgres connection ... likely yes, since the thing being tested is
// actual trigram ranking behavior." Requires `docker compose up -d` and a
// synced DB (see agent-reports/phase-2.md); vitest.config.ts loads
// DATABASE_URL from .env so these run the same way `pnpm test` always has.

import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { parseCardSearchParams, searchCards } from "./cards";

afterAll(async () => {
  await prisma.$disconnect();
});

describe("parseCardSearchParams", () => {
  it("trims and drops blank values to undefined", () => {
    const result = parseCardSearchParams({
      q: "  Sure Gamble  ",
      faction: "",
      side: "runner",
      type: "  ",
    });
    expect(result.q).toBe("Sure Gamble");
    expect(result.faction).toBeUndefined();
    expect(result.side).toBe("runner");
    expect(result.type).toBeUndefined();
  });

  it("defaults page to 1 and pageSize to the default when absent", () => {
    const result = parseCardSearchParams({});
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(30);
  });

  it("takes the first value when a param is repeated in the URL", () => {
    const result = parseCardSearchParams({ q: ["first", "second"] });
    expect(result.q).toBe("first");
  });
});

describe("searchCards (real DB)", () => {
  it("an empty query lists results rather than erroring or returning nothing", async () => {
    const result = await searchCards({});
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.total).toBeGreaterThan(2000); // 2054 cards synced
  });

  it('searching "Sure Gamble" returns Sure Gamble', async () => {
    const result = await searchCards({ q: "Sure Gamble" });
    expect(result.items.map((c) => c.title)).toContain("Sure Gamble");
  });

  it("a typo'd search still returns something reasonable", async () => {
    const result = await searchCards({ q: "Sur Gambl" });
    expect(result.items.map((c) => c.title)).toContain("Sure Gamble");
  });

  it("faction filter matches a direct count", async () => {
    const directCount = await prisma.card.count({
      where: { factionCode: "anarch" },
    });
    const result = await searchCards({ faction: "anarch", pageSize: 100 });
    expect(result.total).toBe(directCount);
    expect(
      result.items.every((c) => c.factionCode === "anarch"),
    ).toBe(true);
  });

  it("combines faction + side + type filters (structured WHERE, not raw SQL)", async () => {
    const filters = {
      factionCode: "haas_bioroid",
      sideCode: "corp",
      typeCode: "ice",
    };
    const directCount = await prisma.card.count({ where: filters });
    const result = await searchCards({
      faction: filters.factionCode,
      side: filters.sideCode,
      type: filters.typeCode,
      pageSize: 100,
    });
    expect(result.total).toBe(directCount);
    expect(
      result.items.every(
        (c) =>
          c.factionCode === filters.factionCode &&
          c.sideCode === filters.sideCode &&
          c.typeCode === filters.typeCode,
      ),
    ).toBe(true);
  });

  it("paginates correctly: page 2 continues where page 1 left off, no overlap", async () => {
    const pageSize = 10;
    const page1 = await searchCards({ page: 1, pageSize });
    const page2 = await searchCards({ page: 2, pageSize });
    expect(page1.items).toHaveLength(pageSize);
    expect(page2.items).toHaveLength(pageSize);
    const page1Codes = new Set(page1.items.map((c) => c.code));
    const overlap = page2.items.filter((c) => page1Codes.has(c.code));
    expect(overlap).toHaveLength(0);
    // Same total reported on both pages.
    expect(page1.total).toBe(page2.total);
  });

  it("total-count matches a direct SELECT count(*) with the same filter", async () => {
    const directCount = await prisma.card.count({
      where: { sideCode: "runner" },
    });
    const result = await searchCards({ side: "runner", pageSize: 1 });
    expect(result.total).toBe(directCount);
  });
});
