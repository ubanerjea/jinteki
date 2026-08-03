// Integration tests against the real, already-synced Postgres database
// (2054 cards) - not fixture-based like Phase 2/3's mapper tests. Per
// PHASE_4_PLAN.md: "Decide during the build whether these need a real
// Postgres connection ... likely yes, since the thing being tested is
// actual trigram ranking behavior." Requires `docker compose up -d` and a
// synced DB (see agent-reports/phase-2.md); vitest.config.ts loads
// DATABASE_URL from .env so these run the same way `pnpm test` always has.

import { Prisma } from "@prisma/client";
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

  it("a dropped-letter typo of a longer word still matches (eficiency -> Efficiency)", async () => {
    // plans/SEARCH_MATCHING.md's "eficiency" case: single dropped letter,
    // still within word_similarity's reach (unlike the "rsh"->"Rush" case,
    // which is a documented, accepted gap - not guarded here).
    const result = await searchCards({ q: "eficiency" });
    expect(result.items.map((c) => c.title)).toContain(
      "Bioroid Efficiency Research",
    );
  });

  // plans/SEARCH_MATCHING.md: pg_trgm's `%`/similarity() (whole-string
  // comparison) diluted "bioroid" below its 0.3 threshold against the full
  // title "Bioroid Efficiency Research", silently dropping it. Pinned here
  // so a future refactor back to whole-string-only matching regresses
  // loudly instead of silently.
  it('a short word matches as a substring of a longer title ("bioroid" -> "Bioroid Efficiency Research")', async () => {
    const result = await searchCards({ q: "bioroid", pageSize: 50 });
    expect(result.items.map((c) => c.title)).toContain(
      "Bioroid Efficiency Research",
    );
  });

  // Guards GREATEST(word_similarity(title,...), word_similarity(text,...))
  // ordering, not just the filter: for q="haas bioroid", confirmed directly
  // against the real dataset that "Haas-Bioroid: Precision Design" (a title
  // match, word_similarity = 1) and "Sensor Net Activation" (an incidental
  // text-only mention, word_similarity = 0.615) both pass the filter, but
  // at different scores - the title match must rank strictly above the
  // text-only one, not just happen to sort near it.
  it("a title-level match outranks a text-level incidental mention for the same query", async () => {
    const result = await searchCards({ q: "haas bioroid", pageSize: 50 });
    const titles = result.items.map((c) => c.title);
    const titleMatchIndex = titles.indexOf("Haas-Bioroid: Precision Design");
    const textOnlyMatchIndex = titles.indexOf("Sensor Net Activation");
    expect(titleMatchIndex).toBeGreaterThanOrEqual(0);
    expect(textOnlyMatchIndex).toBeGreaterThanOrEqual(0);
    expect(titleMatchIndex).toBeLessThan(textOnlyMatchIndex);
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

  // Phase 5: keyword filter (array-containment on Card.keywords).
  describe("keyword filter", () => {
    it("matches a direct count using array `has`", async () => {
      const directCount = await prisma.card.count({
        where: { keywords: { has: "virus" } },
      });
      const result = await searchCards({ keyword: "virus", pageSize: 100 });
      expect(result.total).toBe(directCount);
      expect(result.total).toBeGreaterThan(0);
    });

    it("every row returned actually has the keyword", async () => {
      const result = await searchCards({ keyword: "icebreaker", pageSize: 50 });
      const codes = result.items.map((c) => c.code);
      const rows = await prisma.card.findMany({
        where: { code: { in: codes } },
        select: { code: true, keywords: true },
      });
      expect(rows.length).toBe(codes.length);
      expect(rows.every((r) => r.keywords.includes("icebreaker"))).toBe(true);
    });

    it("combines keyword with faction/side/type filters", async () => {
      const directCount = await prisma.card.count({
        where: { keywords: { has: "icebreaker" }, sideCode: "runner" },
      });
      const result = await searchCards({
        keyword: "icebreaker",
        side: "runner",
        pageSize: 100,
      });
      expect(result.total).toBe(directCount);
    });
  });

  // Phase 5: explicit sort control.
  describe("order param", () => {
    it("defaults to alphabetical-by-title when order is absent (unchanged behavior)", async () => {
      const result = await searchCards({ pageSize: 20 });
      const titles = result.items.map((c) => c.title);
      // Compare against Postgres's own ORDER BY title ASC (via Prisma's
      // query builder) rather than JS `localeCompare` - the DB's default
      // collation doesn't always agree with JS string sort (e.g. "Ad
      // Blitz" vs "Adam: ..."), and it's the DB's ordering searchCards()
      // actually promises, not JS's.
      const direct = await prisma.card.findMany({
        orderBy: { title: "asc" },
        take: 20,
        select: { title: true },
      });
      expect(titles).toEqual(direct.map((c) => c.title));
    });

    it("order=faction actually changes result order to group by faction", async () => {
      const result = await searchCards({ order: "faction", pageSize: 100 });
      const factions = result.items.map((c) => c.factionCode);
      const sorted = [...factions].sort((a, b) => a.localeCompare(b));
      expect(factions).toEqual(sorted);
      // Confirm it's not incidentally identical to plain title order too.
      const titleOrderResult = await searchCards({ pageSize: 100 });
      expect(result.items.map((c) => c.code)).not.toEqual(
        titleOrderResult.items.map((c) => c.code),
      );
    });

    it("order=type groups results by typeCode", async () => {
      const result = await searchCards({ order: "type", pageSize: 100 });
      const types = result.items.map((c) => c.typeCode);
      const sorted = [...types].sort((a, b) => a.localeCompare(b));
      expect(types).toEqual(sorted);
    });

    it("an unrecognized order value is ignored (falls back to default behavior)", async () => {
      const result = await searchCards({
        order: "not-a-real-column",
        pageSize: 20,
      });
      const defaultResult = await searchCards({ pageSize: 20 });
      expect(result.items.map((c) => c.code)).toEqual(
        defaultResult.items.map((c) => c.code),
      );
    });
  });

  // Phase 6 item 1: pack filter.
  describe("pack filter", () => {
    it("matches a direct count using packCode equality", async () => {
      const directCount = await prisma.card.count({
        where: { packCode: "core_set" },
      });
      const result = await searchCards({ pack: "core_set", pageSize: 200 });
      expect(result.total).toBe(directCount);
      expect(result.total).toBeGreaterThan(0);
      expect(result.items.every((c) => c.packCode === "core_set")).toBe(true);
    });

    it("combines with faction filter", async () => {
      const directCount = await prisma.card.count({
        where: { packCode: "core_set", factionCode: "anarch" },
      });
      const result = await searchCards({
        pack: "core_set",
        faction: "anarch",
        pageSize: 200,
      });
      expect(result.total).toBe(directCount);
    });
  });

  // format-descriptions-links-and-search-plan.md §5, Option A: format
  // membership filter (JSONB containment on Card.raw.attributes.format_ids).
  describe("format filter", () => {
    it("matches a direct count using JSONB containment (77 for system_gateway, per the plan's §2b measurement)", async () => {
      const directCount = await prisma.$queryRaw<{ count: bigint }[]>(
        Prisma.sql`SELECT count(*)::bigint AS count FROM "Card" WHERE raw->'attributes'->'format_ids' @> '"system_gateway"'::jsonb`,
      );
      const expected = Number(directCount[0].count);
      expect(expected).toBe(77);

      const result = await searchCards({ format: "system_gateway", pageSize: 100 });
      expect(result.total).toBe(expected);
    });

    it("every row returned actually has the format in its format_ids", async () => {
      const result = await searchCards({ format: "system_gateway", pageSize: 100 });
      const codes = result.items.map((c) => c.code);
      const rows = await prisma.$queryRaw<{ code: string }[]>(
        Prisma.sql`SELECT code FROM "Card" WHERE code = ANY(${codes}) AND raw->'attributes'->'format_ids' @> '"system_gateway"'::jsonb`,
      );
      expect(rows.length).toBe(codes.length);
    });

    it("combines with faction filter (AND semantics)", async () => {
      const directCount = await prisma.$queryRaw<{ count: bigint }[]>(
        Prisma.sql`SELECT count(*)::bigint AS count FROM "Card" WHERE raw->'attributes'->'format_ids' @> '"eternal"'::jsonb AND "factionCode" = 'anarch'`,
      );
      const expected = Number(directCount[0].count);

      const result = await searchCards({
        format: "eternal",
        faction: "anarch",
        pageSize: 200,
      });
      expect(result.total).toBe(expected);
    });

    it("spot-checks the other formats' membership counts against the plan's §2b measurements", async () => {
      const counts = await prisma.$queryRaw<{ id: string; count: bigint }[]>(
        Prisma.sql`
          SELECT f.id, count(c.code)::bigint AS count
          FROM "Format" f
          LEFT JOIN "Card" c ON (c.raw->'attributes'->'format_ids') @> to_jsonb(f.id)
          WHERE f.id IN ('eternal', 'standard', 'snapshot')
          GROUP BY f.id
        `,
      );
      const byId = Object.fromEntries(counts.map((r) => [r.id, Number(r.count)]));
      expect(byId.eternal).toBe(2017);
      expect(byId.standard).toBe(2016);
      expect(byId.snapshot).toBe(1181);
    });
  });

  // Phase 6 item 6: field:value operator syntax, real-DB integration case
  // (unit tests for parseCardSearchParams's parsing logic itself are below,
  // no DB needed for those).
  describe("operator syntax in q (real DB)", () => {
    it('q: "f:anarch s:virus" (no residual text) matches an equivalent direct query', async () => {
      const params = parseCardSearchParams({ q: "f:anarch s:virus" });
      expect(params.faction).toBe("anarch");
      expect(params.keyword).toBe("virus");
      expect(params.q).toBeUndefined();

      const directCount = await prisma.card.count({
        where: { factionCode: "anarch", keywords: { has: "virus" } },
      });
      const result = await searchCards(params);
      expect(result.total).toBe(directCount);
      expect(result.total).toBeGreaterThan(0);
      expect(result.items.every((c) => c.factionCode === "anarch")).toBe(true);
    });
  });
});

describe("parseCardSearchParams - operator syntax (item 6)", () => {
  it("recognizes f: as a faction filter", () => {
    const result = parseCardSearchParams({ q: "f:anarch" });
    expect(result.faction).toBe("anarch");
    expect(result.q).toBeUndefined();
  });

  it("recognizes t: as a type filter", () => {
    const result = parseCardSearchParams({ q: "t:ice" });
    expect(result.type).toBe("ice");
    expect(result.q).toBeUndefined();
  });

  it("recognizes s: as a keyword (subtype) filter", () => {
    const result = parseCardSearchParams({ q: "s:virus" });
    expect(result.keyword).toBe("virus");
    expect(result.q).toBeUndefined();
  });

  it("recognizes d: as a side filter", () => {
    const result = parseCardSearchParams({ q: "d:runner" });
    expect(result.side).toBe("runner");
    expect(result.q).toBeUndefined();
  });

  it("is case-insensitive on the prefix letter (F:anarch == f:anarch)", () => {
    const result = parseCardSearchParams({ q: "F:anarch" });
    expect(result.faction).toBe("anarch");
  });

  it("folds multiple operators and leaves residual text as q", () => {
    const result = parseCardSearchParams({ q: "f:anarch s:virus rootkit" });
    expect(result.faction).toBe("anarch");
    expect(result.keyword).toBe("virus");
    expect(result.q).toBe("rootkit");
  });

  it("leaves an unrecognized prefix as literal text, not stripped", () => {
    const result = parseCardSearchParams({ q: "x:foo bar" });
    expect(result.faction).toBeUndefined();
    expect(result.q).toBe("x:foo bar");
  });

  it("an explicit dropdown param wins over a matching operator token in q", () => {
    const result = parseCardSearchParams({ q: "f:anarch", faction: "nbn" });
    expect(result.faction).toBe("nbn");
    // The f: token is still stripped out of q even though its value lost -
    // it was recognized as an operator, not left as literal text.
    expect(result.q).toBeUndefined();
  });

  it("an explicit dropdown param for a different field doesn't block an operator for another field", () => {
    const result = parseCardSearchParams({
      q: "f:anarch s:virus",
      side: "runner",
    });
    expect(result.faction).toBe("anarch");
    expect(result.keyword).toBe("virus");
    expect(result.side).toBe("runner");
  });
});
