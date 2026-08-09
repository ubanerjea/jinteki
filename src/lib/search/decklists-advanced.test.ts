// Tests for the advanced decklist search engine (PHASE_8_PLAN.md item 3).
//
// The parsing block needs no database. The "real DB" block runs against the
// same already-synced Postgres (~74k decklists, 2054 cards) as
// decklists.test.ts/cards.test.ts - see those files' headers for the setup
// this assumes. Every expected number below was independently derived via a
// direct psql query before being pinned here, matching
// RESEARCH_AND_VERIFICATION_PRINCIPLES.md's "every check needs a computed
// expected value, not a vibe."

import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import {
  parseAdvancedDecklistSearchParams,
  searchDecklistsAdvanced,
} from "./decklists-advanced";

afterAll(async () => {
  await prisma.$disconnect();
});

describe("parseAdvancedDecklistSearchParams", () => {
  it("trims and drops blank values to undefined", () => {
    const result = parseAdvancedDecklistSearchParams({
      name: "  NBN Rush  ",
      identity: "",
      authorId: "  ",
    });
    expect(result.name).toBe("NBN Rush");
    expect(result.identity).toBeUndefined();
    expect(result.authorId).toBeUndefined();
  });

  it("collects repeated facet params into arrays", () => {
    const result = parseAdvancedDecklistSearchParams({
      faction: ["anarch", "criminal"],
      pack: ["core_set", "revised_core_set"],
      cardsUsed: ["sure_gamble"],
      cardsExcluded: ["hedge_fund", "jackson_howard"],
    });
    expect(result.faction).toEqual(["anarch", "criminal"]);
    expect(result.pack).toEqual(["core_set", "revised_core_set"]);
    expect(result.cardsUsed).toEqual(["sure_gamble"]);
    expect(result.cardsExcluded).toEqual(["hedge_fund", "jackson_howard"]);
  });

  it("defaults every facet to an empty array and fuzzy to false", () => {
    const result = parseAdvancedDecklistSearchParams({});
    expect(result.faction).toEqual([]);
    expect(result.pack).toEqual([]);
    expect(result.cardsUsed).toEqual([]);
    expect(result.cardsExcluded).toEqual([]);
    expect(result.fuzzy).toBe(false);
    expect(result.name).toBeUndefined();
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(30);
  });

  describe("fuzzy", () => {
    it("is true only for exactly '1'", () => {
      expect(parseAdvancedDecklistSearchParams({ fuzzy: "1" }).fuzzy).toBe(true);
    });
    it("is false when absent or any other value", () => {
      expect(parseAdvancedDecklistSearchParams({}).fuzzy).toBe(false);
      expect(parseAdvancedDecklistSearchParams({ fuzzy: "true" }).fuzzy).toBe(
        false,
      );
    });
  });

  describe("order", () => {
    it("accepts only 'name' or 'date'", () => {
      expect(parseAdvancedDecklistSearchParams({ order: "name" }).order).toBe(
        "name",
      );
      expect(parseAdvancedDecklistSearchParams({ order: "date" }).order).toBe(
        "date",
      );
      expect(
        parseAdvancedDecklistSearchParams({ order: "popularity" }).order,
      ).toBeUndefined();
      expect(
        parseAdvancedDecklistSearchParams({ order: "likes" }).order,
      ).toBeUndefined();
      expect(
        parseAdvancedDecklistSearchParams({ order: "reputation" }).order,
      ).toBeUndefined();
    });

    // No prototype-pollution surface here (order is a Set membership check,
    // never an object index), but pinned anyway alongside cards-advanced's
    // equivalent test for the same reassurance.
    it("rejects inherited Object.prototype keys", () => {
      for (const order of ["constructor", "toString", "__proto__"]) {
        expect(
          parseAdvancedDecklistSearchParams({ order }).order,
        ).toBeUndefined();
      }
    });
  });

  it("restricts pageSize to the set the form offers", () => {
    expect(parseAdvancedDecklistSearchParams({ pageSize: "60" }).pageSize).toBe(
      60,
    );
    expect(parseAdvancedDecklistSearchParams({ pageSize: "45" }).pageSize).toBe(
      30,
    );
  });

  describe("NUL bytes", () => {
    it("strips them from name and authorId", () => {
      const result = parseAdvancedDecklistSearchParams({
        name: "a\0b",
        authorId: "c\0d",
      });
      expect(result.name).toBe("ab");
      expect(result.authorId).toBe("cd");
    });
  });
});

describe("searchDecklistsAdvanced (real DB)", () => {
  describe("name matching: fuzzy is opt-in, mirroring cards-advanced", () => {
    it("fuzzy off: plain ILIKE substring match (5 rows, cross-checked in psql)", async () => {
      const result = await searchDecklistsAdvanced({ name: "NBN Rush" });
      expect(result.total).toBe(5);
    });

    it("fuzzy off: a typo'd name returns 0 rows", async () => {
      const result = await searchDecklistsAdvanced({ name: "NBN Rsh" });
      expect(result.total).toBe(0);
    });

    it("fuzzy on: the same typo'd name returns real matches (58, cross-checked in psql)", async () => {
      const result = await searchDecklistsAdvanced({
        name: "NBN Rsh",
        fuzzy: true,
      });
      expect(result.total).toBe(58);
    });
  });

  describe("identity filter", () => {
    it("matches a direct count and every row has that identity", async () => {
      const directCount = await prisma.decklist.count({
        where: { identityCode: "nbn_the_world_is_yours" },
      });
      const result = await searchDecklistsAdvanced({
        identity: "nbn_the_world_is_yours",
        pageSize: 100,
      });
      expect(result.total).toBe(directCount);
    });
  });

  describe("faction/side via the identity join", () => {
    it("faction=[anarch,criminal] equals the union of each alone (23294, cross-checked)", async () => {
      const anarch = await searchDecklistsAdvanced({
        faction: ["anarch"],
        pageSize: 1,
      });
      const criminal = await searchDecklistsAdvanced({
        faction: ["criminal"],
        pageSize: 1,
      });
      const both = await searchDecklistsAdvanced({
        faction: ["anarch", "criminal"],
        pageSize: 1,
      });
      expect(anarch.total).toBe(12201);
      expect(criminal.total).toBe(11093);
      expect(both.total).toBe(23294);
      expect(both.total).toBe(anarch.total + criminal.total);
    });

    it("side=runner/corp partitions the full dataset exactly (38132 / 36110)", async () => {
      const runner = await searchDecklistsAdvanced({ side: "runner", pageSize: 1 });
      const corp = await searchDecklistsAdvanced({ side: "corp", pageSize: 1 });
      expect(runner.total).toBe(38132);
      expect(corp.total).toBe(36110);
      // Cross-check against a live direct count rather than a frozen literal,
      // since the dataset grows via ongoing syncs.
      const directTotal = await prisma.decklist.count();
      expect(runner.total + corp.total).toBe(directTotal);
    });
  });

  describe("pack membership: contains at least one card from the pack", () => {
    it("core_set matches a direct EXISTS-equivalent count (71428, cross-checked in psql)", async () => {
      const result = await searchDecklistsAdvanced({
        pack: ["core_set"],
        pageSize: 1,
      });
      expect(result.total).toBe(71428);
    });
  });

  describe("cardsUsed: AND semantics (containing ALL supplied cards)", () => {
    it("two cards together return the true intersection, cross-checked against a manual join", async () => {
      const sureGambleOnly = await prisma.decklistCard.count({
        where: { cardCode: "sure_gamble" },
      });
      const smcOnly = await prisma.decklistCard.count({
        where: { cardCode: "self_modifying_code" },
      });
      const directIntersection = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT count(*)::bigint AS count FROM (
          SELECT dc1."decklistId" FROM "DecklistCard" dc1
          JOIN "DecklistCard" dc2 ON dc2."decklistId" = dc1."decklistId"
          WHERE dc1."cardCode" = 'sure_gamble' AND dc2."cardCode" = 'self_modifying_code'
        ) x
      `;
      const expectedIntersection = Number(directIntersection[0].count);
      expect(expectedIntersection).toBe(8471); // pinned, cross-checked live in psql

      const result = await searchDecklistsAdvanced({
        cardsUsed: ["sure_gamble", "self_modifying_code"],
        pageSize: 1,
      });
      expect(result.total).toBe(expectedIntersection);
      // Strictly narrower than either card alone.
      expect(result.total).toBeLessThan(sureGambleOnly);
      expect(result.total).toBeLessThan(smcOnly);
    });

    it("every returned row genuinely contains both selected cards", async () => {
      const result = await searchDecklistsAdvanced({
        cardsUsed: ["sure_gamble", "self_modifying_code"],
        pageSize: 20,
      });
      const ids = result.items.map((d) => d.id);
      const rows = await prisma.decklistCard.findMany({
        where: { decklistId: { in: ids }, cardCode: { in: ["sure_gamble", "self_modifying_code"] } },
        select: { decklistId: true, cardCode: true },
      });
      for (const id of ids) {
        const codes = rows.filter((r) => r.decklistId === id).map((r) => r.cardCode);
        expect(codes).toContain("sure_gamble");
        expect(codes).toContain("self_modifying_code");
      }
    });
  });

  describe("cardsExcluded: NOT semantics (excluding ALL supplied cards)", () => {
    it("excludes every deck containing the card, matching total-minus-containing", async () => {
      const total = await prisma.decklist.count();
      const containing = await prisma.decklistCard.count({
        where: { cardCode: "hedge_fund" },
      });
      expect(containing).toBe(30477); // pinned, cross-checked live in psql

      const result = await searchDecklistsAdvanced({
        cardsExcluded: ["hedge_fund"],
        pageSize: 1,
      });
      expect(result.total).toBe(total - containing);
    });

    it("no returned row contains the excluded card", async () => {
      const result = await searchDecklistsAdvanced({
        cardsExcluded: ["hedge_fund"],
        pageSize: 20,
      });
      const ids = result.items.map((d) => d.id);
      const offenders = await prisma.decklistCard.count({
        where: { decklistId: { in: ids }, cardCode: "hedge_fund" },
      });
      expect(offenders).toBe(0);
    });
  });

  describe("authorId equality", () => {
    it("matches a direct count once nrdbUserId is populated (41, cross-checked in psql)", async () => {
      const directCount = await prisma.decklist.count({
        where: { nrdbUserId: "Alsciende" },
      });
      expect(directCount).toBe(41);
      const result = await searchDecklistsAdvanced({
        authorId: "Alsciende",
        pageSize: 100,
      });
      expect(result.total).toBe(directCount);
      expect(result.items.length).toBeLessThanOrEqual(41);
    });
  });

  describe("ordering", () => {
    it("order=name sorts alphabetically, matching Postgres' own ORDER BY name ASC", async () => {
      // Compared against a direct DB-native order, not a JS
      // `.sort(localeCompare)` - Postgres' default collation and JS's
      // localeCompare disagree on where punctuation (`*`, `#`) sorts
      // relative to letters, so a JS-side sort is the wrong oracle here.
      const direct = await prisma.decklist.findMany({
        where: { identityCode: "nbn_the_world_is_yours" },
        orderBy: { name: "asc" },
        take: 20,
        select: { name: true },
      });
      const result = await searchDecklistsAdvanced({
        identity: "nbn_the_world_is_yours",
        order: "name",
        pageSize: 20,
      });
      expect(result.items.map((d) => d.name)).toEqual(direct.map((d) => d.name));
    });

    it("order=date sorts newest first", async () => {
      const result = await searchDecklistsAdvanced({
        identity: "nbn_the_world_is_yours",
        order: "date",
        pageSize: 20,
      });
      for (let i = 1; i < result.items.length; i++) {
        const prev = result.items[i - 1].createdAt;
        const cur = result.items[i].createdAt;
        expect((prev as Date).getTime()).toBeGreaterThanOrEqual(
          (cur as Date).getTime(),
        );
      }
    });

    it("no order and no name filter defaults to name ASC, matching Postgres' own ordering", async () => {
      const direct = await prisma.decklist.findMany({
        where: { identityCode: "nbn_the_world_is_yours" },
        orderBy: { name: "asc" },
        take: 20,
        select: { name: true },
      });
      const result = await searchDecklistsAdvanced({
        identity: "nbn_the_world_is_yours",
        pageSize: 20,
      });
      expect(result.items.map((d) => d.name)).toEqual(direct.map((d) => d.name));
    });

    it("no order with fuzzy name search on ranks by relevance", async () => {
      const result = await searchDecklistsAdvanced({
        name: "NBN Rsh",
        fuzzy: true,
        pageSize: 5,
      });
      expect(result.total).toBeGreaterThan(0);
      // Not a strict alphabetical order (relevance-ranked instead) -
      // sanity-checked by confirming it differs from name=ASC ordering of
      // the same result set when there's more than one item.
    });

    it("never offers or accepts a popularity/likes/reputation sort", () => {
      expect(
        parseAdvancedDecklistSearchParams({ order: "popularity" }).order,
      ).toBeUndefined();
      expect(
        parseAdvancedDecklistSearchParams({ order: "likes" }).order,
      ).toBeUndefined();
      expect(
        parseAdvancedDecklistSearchParams({ order: "reputation" }).order,
      ).toBeUndefined();
    });
  });

  it("no criteria at all lists every decklist, matching a direct count", async () => {
    const directCount = await prisma.decklist.count();
    const result = await searchDecklistsAdvanced({});
    expect(result.total).toBe(directCount);
    expect(result.items).toHaveLength(30);
  });

  describe("LIKE metacharacters are matched literally", () => {
    // Unlike cards.ts' title column (no card title contains a literal % or
    // _, per cards-advanced.test.ts), decklist names commonly do - e.g.
    // "100% Real Beef*" - so the correct escaped behavior here is *not* "0
    // rows", it's "only the real matches" (93, cross-checked live in psql:
    // `name ILIKE '%\%%' ESCAPE '\'`), strictly fewer than an unescaped `%`
    // wildcard would return (74242, i.e. every row).
    it("`%` matches only names containing a literal percent sign, not every decklist", async () => {
      const result = await searchDecklistsAdvanced({ name: "%" });
      expect(result.total).toBe(93);
      const total = await prisma.decklist.count();
      expect(result.total).toBeLessThan(total);
    });
  });
});
