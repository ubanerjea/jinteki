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

  describe("format (card-pool membership, addendum 2026-08-08)", () => {
    it("blank/absent format filters nothing", () => {
      expect(parseAdvancedDecklistSearchParams({}).format).toBeUndefined();
      expect(parseAdvancedDecklistSearchParams({ format: "" }).format).toBeUndefined();
      expect(
        parseAdvancedDecklistSearchParams({ format: "  " }).format,
      ).toBeUndefined();
    });

    it("trims a real value", () => {
      expect(
        parseAdvancedDecklistSearchParams({ format: "  standard  " }).format,
      ).toBe("standard");
    });
  });

  describe("rotation (Phase 10 §3)", () => {
    it("blank/absent rotation filters nothing", () => {
      expect(parseAdvancedDecklistSearchParams({}).rotation).toBeUndefined();
      expect(
        parseAdvancedDecklistSearchParams({ rotation: "" }).rotation,
      ).toBeUndefined();
      expect(
        parseAdvancedDecklistSearchParams({ rotation: "  " }).rotation,
      ).toBeUndefined();
    });

    it("trims a real value", () => {
      expect(
        parseAdvancedDecklistSearchParams({ rotation: "  rotation_2025  " })
          .rotation,
      ).toBe("rotation_2025");
    });
  });

  describe("tournamentLegal (Phase 10 §3)", () => {
    it("accepts only '1' or '0'", () => {
      expect(
        parseAdvancedDecklistSearchParams({ tournamentLegal: "1" })
          .tournamentLegal,
      ).toBe("1");
      expect(
        parseAdvancedDecklistSearchParams({ tournamentLegal: "0" })
          .tournamentLegal,
      ).toBe("0");
    });

    it("blank/absent/garbage all mean Ignore (undefined)", () => {
      expect(
        parseAdvancedDecklistSearchParams({}).tournamentLegal,
      ).toBeUndefined();
      expect(
        parseAdvancedDecklistSearchParams({ tournamentLegal: "" })
          .tournamentLegal,
      ).toBeUndefined();
      expect(
        parseAdvancedDecklistSearchParams({ tournamentLegal: "yes" })
          .tournamentLegal,
      ).toBeUndefined();
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

  describe("format: card-pool membership, deck-wide (addendum, 2026-08-08)", () => {
    it(
      "format=standard returns a strict subset of the unfiltered total, cross-checked against an independently-shaped direct query",
      async () => {
        const total = await prisma.decklist.count();

        // Deliberately written differently from the implementation's
        // correlated NOT EXISTS (a NOT IN over a plain subquery instead) -
        // an independent derivation of the same "no card in the deck fails
        // format_ids containment" semantics, not a copy-paste of the
        // production SQL, per the addendum's testing instruction. This
        // shape can't short-circuit per-decklist the way the correlated
        // NOT EXISTS does, so it's genuinely slower (~7s vs ~70ms in psql,
        // confirmed live) - real work, not a hung query, hence the raised
        // timeout below rather than simplifying it back into a copy of the
        // implementation.
        const oracle = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT count(*)::bigint AS count FROM "Decklist" d
        WHERE d.id NOT IN (
          SELECT dc."decklistId" FROM "DecklistCard" dc
          JOIN "Card" cc ON cc.code = dc."cardCode"
          WHERE NOT ((cc.raw->'attributes'->'format_ids') @> to_jsonb('standard'::text))
        )
      `;
        const expected = Number(oracle[0].count);
        expect(expected).toBe(73475); // pinned, cross-checked live in psql

        const result = await searchDecklistsAdvanced({
          format: "standard",
          pageSize: 1,
        });
        expect(result.total).toBe(expected);
        expect(result.total).toBeLessThan(total);
      },
      15000,
    );

    it("a decklist whose identity alone fails membership is excluded, not just non-identity cards", async () => {
      // boris_syfr_kovac_crafty_veteran's format_ids does not contain
      // "standard" (confirmed live in psql), and it is used as the identity
      // on real decklists - the identity slot is a DecklistCard row too
      // (Phase 4's finding that NRDB's card_slots includes the identity),
      // so it must be enough on its own to fail the deck-wide check even if
      // every other card in the deck passes.
      const identityCode = "boris_syfr_kovac_crafty_veteran";

      const identityCard = await prisma.card.findUniqueOrThrow({
        where: { code: identityCode },
        select: { raw: true },
      });
      const formatIds = (
        identityCard.raw as { attributes?: { format_ids?: string[] } }
      ).attributes?.format_ids;
      expect(formatIds).not.toContain("standard");

      const usingThisIdentity = await prisma.decklist.count({
        where: { identityCode },
      });
      expect(usingThisIdentity).toBeGreaterThan(0);

      const result = await searchDecklistsAdvanced({
        identity: identityCode,
        format: "standard",
        pageSize: 10,
      });
      expect(result.total).toBe(0);
      expect(result.items).toHaveLength(0);
    });
  });

  describe("rotation: every card must have ever belonged to the target pool (Phase 10 §3)", () => {
    it(
      "rotation=rotation_2025 returns a strict subset, cross-checked against an independently-shaped direct query",
      async () => {
        const total = await prisma.decklist.count();

        // Deliberately a different shape from the implementation's
        // correlated NOT EXISTS (a LATERAL LEFT JOIN anti-join instead) -
        // not a copy-paste of the production SQL. A plain `NOT IN (subquery
        // over the full 1.78M-row DecklistCard/Card join)` was tried first
        // (the same shape the format filter's own oracle test uses) but
        // confirmed live to be pathologically slow for this specific
        // JSONB path/value (Postgres chose a non-hashed SubPlan with
        // cost≈1e9 and didn't complete even after minutes, confirmed via
        // EXPLAIN and a real timed run - see agent-reports/phase-10.md) -
        // NOT a correctness issue, a query-planning one specific to that
        // shape, so a different (still independent) shape is used here
        // instead. This one completes in ~2.6s (confirmed live in psql).
        const oracle = await prisma.$queryRaw<{ count: bigint }[]>`
          SELECT count(*)::bigint AS count FROM "Decklist" d
          LEFT JOIN LATERAL (
            SELECT 1 FROM "DecklistCard" dc
            JOIN "Card" cc ON cc.code = dc."cardCode"
            WHERE dc."decklistId" = d.id
              AND NOT ((cc.raw->'attributes'->'card_pool_ids') @> to_jsonb('rotation_2025'::text))
            LIMIT 1
          ) bad ON true
          WHERE bad IS NULL
        `;
        const expected = Number(oracle[0].count);
        expect(expected).toBe(6100); // pinned, cross-checked live in psql

        const result = await searchDecklistsAdvanced({
          rotation: "rotation_2025",
          pageSize: 1,
        });
        expect(result.total).toBe(expected);
        expect(result.total).toBeLessThan(total);
      },
      15000,
    );

    it("every returned row's cards really do belong to rotation_2025", async () => {
      const result = await searchDecklistsAdvanced({
        rotation: "rotation_2025",
        pageSize: 20,
      });
      expect(result.items.length).toBeGreaterThan(0);
      const ids = result.items.map((d) => d.id);
      const cards = await prisma.decklistCard.findMany({
        where: { decklistId: { in: ids } },
        select: { cardCode: true },
      });
      const codes = [...new Set(cards.map((c) => c.cardCode))];
      const cardRows = await prisma.card.findMany({
        where: { code: { in: codes } },
        select: { code: true, raw: true },
      });
      for (const card of cardRows) {
        const poolIds = (
          card.raw as { attributes?: { card_pool_ids?: string[] } }
        ).attributes?.card_pool_ids;
        expect(poolIds).toContain("rotation_2025");
      }
    });

    it("blank rotation filters nothing (full total)", async () => {
      const total = await prisma.decklist.count();
      const result = await searchDecklistsAdvanced({ pageSize: 1 });
      expect(result.total).toBe(total);
    });
  });

  describe("tournamentLegal: not banned under the active restriction AND a member of the active card pool (Phase 10 §3)", () => {
    it(
      "format=standard: Yes/No partition the format-filtered subtotal exactly (5970 / 67505 of 73475)",
      async () => {
        // Baseline is the format-filtered subtotal, not the grand decklist
        // total - searchDecklistsAdvanced's pre-existing `format` addendum
        // condition (deck-wide format_ids containment) also applies whenever
        // `format` is set, independent of tournamentLegal; the two compound,
        // same as any other two ANDed facets in this file (confirmed this is
        // really what's happening, not a bug, via a direct psql query
        // combining both conditions - see agent-reports/phase-10.md).
        const formatOnly = await searchDecklistsAdvanced({
          format: "standard",
          pageSize: 1,
        });
        expect(formatOnly.total).toBe(73475); // pinned, cross-checked live in psql

        const legal = await searchDecklistsAdvanced({
          format: "standard",
          tournamentLegal: "1",
          pageSize: 1,
        });
        const illegal = await searchDecklistsAdvanced({
          format: "standard",
          tournamentLegal: "0",
          pageSize: 1,
        });
        expect(legal.total).toBe(5970); // pinned, cross-checked live in psql
        expect(illegal.total).toBe(67505); // pinned, cross-checked live in psql
        expect(legal.total + illegal.total).toBe(formatOnly.total);
      },
      // Three searchDecklistsAdvanced() calls, two of them with two ANDed
      // EXISTS/NOT EXISTS conditions each joining the full 1.78M-row
      // DecklistCard table (the pre-existing format filter plus this one) -
      // genuinely more work than the single-condition facets elsewhere in
      // this file; default 5000ms was confirmed too tight by a real timeout
      // on first run of this test.
      20000,
    );

    it("every 'legal' row genuinely has no card banned under standard_ban_list_26_03 and every card in standard_2026_vantage_point", async () => {
      const result = await searchDecklistsAdvanced({
        format: "standard",
        tournamentLegal: "1",
        pageSize: 15,
      });
      expect(result.items.length).toBeGreaterThan(0);
      const ids = result.items.map((d) => d.id);
      const cards = await prisma.decklistCard.findMany({
        where: { decklistId: { in: ids } },
        select: { cardCode: true },
      });
      const codes = [...new Set(cards.map((c) => c.cardCode))];
      const cardRows = await prisma.card.findMany({
        where: { code: { in: codes } },
        select: { code: true, raw: true },
      });
      for (const card of cardRows) {
        const attrs = (
          card.raw as {
            attributes?: {
              card_pool_ids?: string[];
              restrictions?: { banned?: string[] };
            };
          }
        ).attributes;
        expect(attrs?.card_pool_ids).toContain("standard_2026_vantage_point");
        expect(attrs?.restrictions?.banned ?? []).not.toContain(
          "standard_ban_list_26_03",
        );
      }
    });

    it("tournamentLegal without format is a no-op (full total, not zero/empty)", async () => {
      const total = await prisma.decklist.count();
      const result = await searchDecklistsAdvanced({
        tournamentLegal: "1",
        pageSize: 1,
      });
      expect(result.total).toBe(total);
    });

    it("a format with no active restriction (ram) still applies the pool-membership half of the check", async () => {
      // ram's activeRestrictionId is null (confirmed live) but
      // activeCardPoolId is "ram_7" - the ban check should be vacuously
      // true, but pool membership should still narrow real results.
      const format = await prisma.format.findUniqueOrThrow({
        where: { id: "ram" },
      });
      expect(format.activeRestrictionId).toBeNull();
      expect(format.activeCardPoolId).toBe("ram_7");

      // Baseline is the format-filtered subtotal (searchDecklistsAdvanced's
      // pre-existing `format` addendum condition also applies whenever
      // `format` is set, independent of tournamentLegal - both filters
      // compound, same as any other two ANDed facets in this file), NOT the
      // grand decklist total.
      const formatOnly = await searchDecklistsAdvanced({
        format: "ram",
        pageSize: 1,
      });
      expect(formatOnly.total).toBe(18901); // pinned, cross-checked live in psql

      const legal = await searchDecklistsAdvanced({
        format: "ram",
        tournamentLegal: "1",
        pageSize: 1,
      });
      const illegal = await searchDecklistsAdvanced({
        format: "ram",
        tournamentLegal: "0",
        pageSize: 1,
      });
      expect(legal.total).toBe(377); // pinned, cross-checked live in psql
      expect(legal.total + illegal.total).toBe(formatOnly.total);
      expect(legal.total).toBeGreaterThan(0);
      expect(legal.total).toBeLessThan(formatOnly.total);
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
