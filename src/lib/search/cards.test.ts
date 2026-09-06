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
import { searchCardsAdvanced } from "./cards-advanced";
import { getFormatCardStatus } from "./format-cards";

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

  // Postgres rejects 0x00 in UTF-8 text, so `/cards?q=a%00b` used to 500.
  it("strips NUL bytes out of every text-ish param", () => {
    const result = parseCardSearchParams({
      q: "a\0b",
      faction: "an\0arch",
      pack: "core\0_set",
    });
    expect(result.q).toBe("ab");
    expect(result.faction).toBe("anarch");
    expect(result.pack).toBe("core_set");
  });

  it("treats a NUL-only q as blank rather than filtering on it", () => {
    expect(parseCardSearchParams({ q: "\0" }).q).toBeUndefined();
  });

  // `order in ORDER_COLUMNS` walked the prototype chain, so these all passed
  // validation and then bound a JS function as a query parameter.
  it("rejects inherited Object.prototype keys as order values", () => {
    for (const order of [
      "constructor",
      "toString",
      "valueOf",
      "hasOwnProperty",
      "__proto__",
      "isPrototypeOf",
    ]) {
      expect(parseCardSearchParams({ order }).order).toBeUndefined();
    }
    // The three real columns still pass.
    expect(parseCardSearchParams({ order: "title" }).order).toBe("title");
    expect(parseCardSearchParams({ order: "faction" }).order).toBe("faction");
    expect(parseCardSearchParams({ order: "type" }).order).toBe("type");
  });

  // The "Per page" control offers 30/60/100 only; anything else used to be
  // honoured behind a control that could not display it.
  it("restricts pageSize to the set the control offers", () => {
    expect(parseCardSearchParams({ pageSize: "60" }).pageSize).toBe(60);
    expect(parseCardSearchParams({ pageSize: "100" }).pageSize).toBe(100);
    expect(parseCardSearchParams({ pageSize: "45" }).pageSize).toBe(30);
    expect(parseCardSearchParams({ pageSize: "7" }).pageSize).toBe(30);
    // Still clamped first, so an absurd value lands on 100 (in the set).
    expect(parseCardSearchParams({ pageSize: "999999" }).pageSize).toBe(100);
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

    // `order=title` used to be special-cased away on the reasoning that it
    // matched the default anyway - which stopped being true as soon as a `q`
    // was present, since the default there is relevance ranking. The Sort
    // control rendered Title as active while the rows came back by
    // relevance. See the ORDER BY comment in cards.ts.
    // "net damage" is chosen deliberately: most `q` values can't detect this
    // bug at all. Every literal substring match scores a flat 1.0, so
    // relevance falls through to its `title ASC` tie-break and the two
    // orderings coincide (the ranking ceiling documented in
    // plans/SEARCH_MATCHING.md - confirmed in psql that q="virus", "bioroid"
    // and even the typo "efficency" each yield exactly one distinct score).
    // "net damage" spans two score tiers, so title order and relevance order
    // genuinely differ and the assertion has something to catch.
    it("order=title sorts by title even when a q makes relevance the default", async () => {
      const params = { q: "net damage", pageSize: 100 };
      const byTitle = await searchCards({ ...params, order: "title" });
      const titles = byTitle.items.map((c) => c.title);

      // Sorted per *Postgres's* collation, not JS localeCompare - the two
      // disagree on punctuation ("Bio-Modeled Network" vs "Biometric
      // Spoofing"), and the DB's ordering is what searchCards() promises.
      // Same reasoning as the default-order test above.
      const direct = await prisma.card.findMany({
        where: { code: { in: byTitle.items.map((c) => c.code) } },
        orderBy: { title: "asc" },
        select: { title: true },
      });
      expect(titles).toEqual(direct.map((c) => c.title));

      // Same rows, different order - so the assertion above can't pass by
      // coincidence, and order=title is provably not being ignored.
      const byRelevance = await searchCards(params);
      expect(byTitle.total).toBe(byRelevance.total);
      expect(titles).not.toEqual(byRelevance.items.map((c) => c.title));
    });
  });

  // LIKE metacharacters are escaped, so `q` is the literal substring the
  // UI promises. Cross-checked in psql: `title ILIKE '%\%%' ESCAPE '\'` ->
  // 0 rows, and no card title or text contains a literal % or _ at all.
  // Before the fix both of these returned all 2054 cards.
  describe("LIKE metacharacters in q", () => {
    it("`%` matches literally, not as a wildcard", async () => {
      const result = await searchCards({ q: "%" });
      expect(result.total).toBe(0);
    });

    it("`_` matches literally, not as a single-character wildcard", async () => {
      const result = await searchCards({ q: "_" });
      expect(result.total).toBe(0);
    });

    it("a backslash does not escape the pattern's own delimiters", async () => {
      const result = await searchCards({ q: "\\" });
      expect(result.total).toBe(0);
    });

    it("ordinary queries are unaffected by the escaping", async () => {
      const result = await searchCards({ q: "bioroid", pageSize: 100 });
      expect(result.total).toBe(23);
    });
  });

  // `order in ORDER_COLUMNS` matched inherited keys, so `order=constructor`
  // bound a JS function as a query parameter and silently sorted by NULL.
  it("an inherited Object.prototype key as `order` falls back to the default sort", async () => {
    const defaultResult = await searchCards({ pageSize: 20 });
    for (const order of ["constructor", "__proto__", "toString"]) {
      const result = await searchCards({ order, pageSize: 20 });
      expect(result.items.map((c) => c.code)).toEqual(
        defaultResult.items.map((c) => c.code),
      );
    }
  });

  // Phase 6 item 1 / Phase 11: pack filter matches any printing via
  // card_set_ids, not original-printing packCode.
  describe("pack filter", () => {
    it("matches a direct count using card_set_ids containment", async () => {
      const directCount = await prisma.$queryRaw<{ count: bigint }[]>(
        Prisma.sql`SELECT count(*)::bigint AS count FROM "Card" WHERE (raw->'attributes'->'card_set_ids') @> to_jsonb('core_set'::text)`,
      );
      const expected = Number(directCount[0].count);
      const result = await searchCards({ pack: "core_set", pageSize: 200 });
      expect(result.total).toBe(expected);
      expect(result.total).toBeGreaterThan(0);
    });

    it("pack=system_gateway includes reprints, not just original printings", async () => {
      const bySetIds = await prisma.$queryRaw<{ count: bigint }[]>(
        Prisma.sql`SELECT count(*)::bigint AS count FROM "Card" WHERE (raw->'attributes'->'card_set_ids') @> to_jsonb('system_gateway'::text)`,
      );
      const byPackCode = await prisma.card.count({
        where: { packCode: "system_gateway" },
      });
      const expected = Number(bySetIds[0].count);
      expect(expected).toBe(77);
      expect(byPackCode).toBe(75);

      const result = await searchCards({ pack: "system_gateway", pageSize: 100 });
      expect(result.total).toBe(expected);
    });

    it("combines with faction filter", async () => {
      const directCount = await prisma.$queryRaw<{ count: bigint }[]>(
        Prisma.sql`SELECT count(*)::bigint AS count FROM "Card" WHERE (raw->'attributes'->'card_set_ids') @> to_jsonb('core_set'::text) AND "factionCode" = 'anarch'`,
      );
      const result = await searchCards({
        pack: "core_set",
        faction: "anarch",
        pageSize: 200,
      });
      expect(result.total).toBe(Number(directCount[0].count));
    });
  });

  // Current-pool membership (Format.activeCardPoolId in card_pool_ids).
  describe("format filter", () => {
    it("matches a direct count using the format's active card pool (77 for system_gateway)", async () => {
      const directCount = await prisma.$queryRaw<{ count: bigint }[]>(
        Prisma.sql`
          SELECT count(*)::bigint AS count FROM "Card"
          WHERE (raw->'attributes'->'card_pool_ids') @> to_jsonb(
            (SELECT "activeCardPoolId" FROM "Format" WHERE id = 'system_gateway')
          )
        `,
      );
      const expected = Number(directCount[0].count);
      expect(expected).toBe(77);

      const result = await searchCards({ format: "system_gateway", pageSize: 100 });
      expect(result.total).toBe(expected);
    });

    it("every row returned is in the format's active card pool", async () => {
      const result = await searchCards({ format: "system_gateway", pageSize: 100 });
      const codes = result.items.map((c) => c.code);
      const rows = await prisma.$queryRaw<{ code: string }[]>(
        Prisma.sql`
          SELECT code FROM "Card"
          WHERE code = ANY(${codes})
            AND (raw->'attributes'->'card_pool_ids') @> to_jsonb(
              (SELECT "activeCardPoolId" FROM "Format" WHERE id = 'system_gateway')
            )
        `,
      );
      expect(rows.length).toBe(codes.length);
    });

    it("combines with faction filter (AND semantics)", async () => {
      const directCount = await prisma.$queryRaw<{ count: bigint }[]>(
        Prisma.sql`
          SELECT count(*)::bigint AS count FROM "Card"
          WHERE (raw->'attributes'->'card_pool_ids') @> to_jsonb(
            (SELECT "activeCardPoolId" FROM "Format" WHERE id = 'eternal')
          )
          AND "factionCode" = 'anarch'
        `,
      );
      const expected = Number(directCount[0].count);

      const result = await searchCards({
        format: "eternal",
        faction: "anarch",
        pageSize: 200,
      });
      expect(result.total).toBe(expected);
    });

    it("format=standard is the current pool, not historical format_ids", async () => {
      const pool = await prisma.$queryRaw<{ count: bigint }[]>(
        Prisma.sql`
          SELECT count(*)::bigint AS count FROM "Card"
          WHERE (raw->'attributes'->'card_pool_ids') @> to_jsonb(
            (SELECT "activeCardPoolId" FROM "Format" WHERE id = 'standard')
          )
        `,
      );
      const expected = Number(pool[0].count);
      expect(expected).toBe(613);

      const result = await searchCards({ format: "standard", pageSize: 1 });
      expect(result.total).toBe(expected);
    });

    it("spot-checks current-pool counts against a direct join on activeCardPoolId", async () => {
      const counts = await prisma.$queryRaw<{ id: string; count: bigint }[]>(
        Prisma.sql`
          SELECT f.id, count(c.code)::bigint AS count
          FROM "Format" f
          LEFT JOIN "Card" c
            ON f."activeCardPoolId" IS NOT NULL
           AND (c.raw->'attributes'->'card_pool_ids') @> to_jsonb(f."activeCardPoolId")
          WHERE f.id IN ('eternal', 'standard', 'snapshot')
          GROUP BY f.id
        `,
      );
      const byId = Object.fromEntries(counts.map((r) => [r.id, Number(r.count)]));
      expect(byId.eternal).toBe(2017);
      expect(byId.standard).toBe(613);
      expect(byId.snapshot).toBe(1181);
    });

    it("an unknown format id matches nothing", async () => {
      const result = await searchCards({ format: "not_a_format", pageSize: 1 });
      expect(result.total).toBe(0);
    });
  });

  // Prefix syntax in q is compiled from the AST, not folded into facet
  // fields. Counts below are re-queried, not copied from a plan.
  describe("operator syntax in q (real DB)", () => {
    it('q: "f:anarch s:virus" matches an equivalent direct query', async () => {
      const params = parseCardSearchParams({ q: "f:anarch s:virus" });
      expect(params.q).toBe("f:anarch s:virus");
      expect(params.faction).toBeUndefined();
      expect(params.keyword).toBeUndefined();

      const directCount = await prisma.card.count({
        where: { factionCode: "anarch", keywords: { has: "virus" } },
      });
      const result = await searchCards(params);
      expect(result.total).toBe(directCount);
      expect(result.total).toBeGreaterThan(0);
      expect(result.items.every((c) => c.factionCode === "anarch")).toBe(true);
    });

    it("q=format:standard equals ?format=standard (current pool)", async () => {
      const byUrl = await searchCards({ format: "standard", pageSize: 1 });
      const byQ = await searchCards({ q: "format:standard", pageSize: 1 });
      expect(byQ.total).toBe(byUrl.total);
      expect(byQ.total).toBeGreaterThan(0);
    });

    it("q=format:standard banned:yes equals advanced banned=1 and getFormatCardStatus", async () => {
      const standard = await prisma.format.findUniqueOrThrow({
        where: { id: "standard" },
        select: { activeRestrictionId: true },
      });
      const status = await getFormatCardStatus(standard.activeRestrictionId);
      const byQ = await searchCards({
        q: "format:standard banned:yes",
        pageSize: 100,
      });
      const byAdv = await searchCardsAdvanced({
        format: "standard",
        banned: "1",
        pageSize: 100,
      });
      expect(byQ.total).toBe(status.banned.length);
      expect(byAdv.total).toBe(status.banned.length);
      expect(byQ.items.map((c) => c.code).sort()).toEqual(
        status.banned.map((c) => c.code).sort(),
      );
    });

    it("q=format:standard banned:no equals pool minus banned", async () => {
      const pool = await searchCards({ format: "standard", pageSize: 1 });
      const banned = await searchCards({
        q: "format:standard banned:yes",
        pageSize: 1,
      });
      const notBanned = await searchCards({
        q: "format:standard banned:no",
        pageSize: 1,
      });
      expect(notBanned.total).toBe(pool.total - banned.total);
    });

    it("q=f:anarch t:program and q=f:anarch virus match direct counts", async () => {
      const programDirect = await prisma.card.count({
        where: { factionCode: "anarch", typeCode: "program" },
      });
      const program = await searchCards({
        q: "f:anarch t:program",
        pageSize: 1,
      });
      expect(program.total).toBe(programDirect);

      const virusDirect = await prisma.$queryRaw<{ count: bigint }[]>(
        Prisma.sql`
          SELECT count(*)::bigint AS count FROM "Card"
          WHERE "factionCode" = 'anarch'
            AND (
              'virus' <% title OR title ILIKE '%virus%'
              OR 'virus' <% text OR text ILIKE '%virus%'
            )
        `,
      );
      const virus = await searchCards({ q: "f:anarch virus", pageSize: 1 });
      expect(virus.total).toBe(Number(virusDirect[0].count));
    });

    it("q=faction:anarch equals q=f:anarch", async () => {
      const short = await searchCards({ q: "f:anarch", pageSize: 1 });
      const long = await searchCards({ q: "faction:anarch", pageSize: 1 });
      expect(long.total).toBe(short.total);
      const direct = await prisma.card.count({ where: { factionCode: "anarch" } });
      expect(short.total).toBe(direct);
    });

    it("q=!f:anarch equals total minus Anarch", async () => {
      const total = await prisma.card.count();
      const anarch = await prisma.card.count({ where: { factionCode: "anarch" } });
      const result = await searchCards({ q: "!f:anarch", pageSize: 1 });
      expect(result.total).toBe(total - anarch);
    });

    it("q=f:anarch | f:criminal equals the union of each alone", async () => {
      const anarch = await prisma.card.count({ where: { factionCode: "anarch" } });
      const criminal = await prisma.card.count({
        where: { factionCode: "criminal" },
      });
      const both = await prisma.card.count({
        where: { factionCode: { in: ["anarch", "criminal"] } },
      });
      const result = await searchCards({
        q: "f:anarch | f:criminal",
        pageSize: 1,
      });
      expect(result.total).toBe(both);
      expect(result.total).toBe(anarch + criminal);
    });

    it("q=i:virus vs q=x:virus vs residual virus", async () => {
      const titleDirect = await prisma.$queryRaw<{ count: bigint }[]>(
        Prisma.sql`
          SELECT count(*)::bigint AS count FROM "Card"
          WHERE ('virus' <% title OR title ILIKE '%virus%')
        `,
      );
      const textDirect = await prisma.$queryRaw<{ count: bigint }[]>(
        Prisma.sql`
          SELECT count(*)::bigint AS count FROM "Card"
          WHERE ('virus' <% text OR text ILIKE '%virus%')
        `,
      );
      const residualDirect = await prisma.$queryRaw<{ count: bigint }[]>(
        Prisma.sql`
          SELECT count(*)::bigint AS count FROM "Card"
          WHERE (
            'virus' <% title OR title ILIKE '%virus%'
            OR 'virus' <% text OR text ILIKE '%virus%'
          )
        `,
      );
      const title = await searchCards({ q: "i:virus", pageSize: 1 });
      const textOnly = await searchCards({ q: "x:virus", pageSize: 1 });
      const residual = await searchCards({ q: "virus", pageSize: 1 });
      expect(title.total).toBe(Number(titleDirect[0].count));
      expect(textOnly.total).toBe(Number(textDirect[0].count));
      expect(residual.total).toBe(Number(residualDirect[0].count));
      expect(residual.total).toBeGreaterThan(title.total);
      expect(residual.total).toBeGreaterThanOrEqual(textOnly.total);
    });

    it("q=e:kala_ghoda and e:kala ghoda equal ?pack=kala_ghoda", async () => {
      const byUrl = await searchCards({ pack: "kala_ghoda", pageSize: 1 });
      const byCode = await searchCards({ q: "e:kala_ghoda", pageSize: 1 });
      const byName = await searchCards({ q: "e:kala ghoda", pageSize: 1 });
      expect(byCode.total).toBe(byUrl.total);
      expect(byName.total).toBe(byUrl.total);
      expect(byUrl.total).toBeGreaterThan(0);
    });

    it("q=cy:mumbad and cy:10 equal Mumbad pack containment", async () => {
      const packs = await prisma.pack.findMany({
        where: { cardCycleId: "mumbad" },
        select: { code: true },
      });
      const codes = packs.map((p) => p.code);
      const direct = await prisma.$queryRaw<{ count: bigint }[]>(
        Prisma.sql`
          SELECT count(*)::bigint AS count FROM "Card" c
          WHERE EXISTS (
            SELECT 1 FROM "Pack" p
            WHERE p."cardCycleId" = 'mumbad'
              AND (c.raw->'attributes'->'card_set_ids') @> to_jsonb(p.code)
          )
        `,
      );
      const expected = Number(direct[0].count);
      expect(codes.length).toBeGreaterThan(0);
      const byId = await searchCards({ q: "cy:mumbad", pageSize: 1 });
      const byPos = await searchCards({ q: "cy:10", pageSize: 1 });
      expect(byId.total).toBe(expected);
      expect(byPos.total).toBe(expected);
    });

    it("URL faction wins over f: in q", async () => {
      const nbn = await prisma.card.count({ where: { factionCode: "nbn" } });
      const result = await searchCards({
        q: "f:anarch",
        faction: "nbn",
        pageSize: 1,
      });
      expect(result.total).toBe(nbn);
    });

    it("URL banned=1 with format=standard works on simple search", async () => {
      const result = await searchCards({
        format: "standard",
        banned: "1",
        pageSize: 1,
      });
      const banned = await searchCards({
        q: "format:standard banned:yes",
        pageSize: 1,
      });
      expect(result.total).toBe(banned.total);
      expect(result.total).toBeGreaterThan(0);
    });
  });
});

describe("parseCardSearchParams - operator syntax", () => {
  it("keeps the raw q string rather than folding prefixes into facets", () => {
    const result = parseCardSearchParams({ q: "f:anarch" });
    expect(result.q).toBe("f:anarch");
    expect(result.faction).toBeUndefined();
  });

  it("keeps t:/s:/d: in q too", () => {
    expect(parseCardSearchParams({ q: "t:ice" }).type).toBeUndefined();
    expect(parseCardSearchParams({ q: "s:virus" }).keyword).toBeUndefined();
    expect(parseCardSearchParams({ q: "d:runner" }).side).toBeUndefined();
    expect(parseCardSearchParams({ q: "t:ice" }).q).toBe("t:ice");
  });

  it("does not fold mixed operators; q stays the full string", () => {
    const result = parseCardSearchParams({ q: "f:anarch s:virus rootkit" });
    expect(result.faction).toBeUndefined();
    expect(result.keyword).toBeUndefined();
    expect(result.q).toBe("f:anarch s:virus rootkit");
  });

  it("keeps x:foo bar as the raw q (AST compilation treats x: as text)", () => {
    const result = parseCardSearchParams({ q: "x:foo bar" });
    expect(result.faction).toBeUndefined();
    expect(result.q).toBe("x:foo bar");
  });

  it("reads URL facets independently of q", () => {
    const result = parseCardSearchParams({ q: "f:anarch", faction: "nbn" });
    expect(result.faction).toBe("nbn");
    expect(result.q).toBe("f:anarch");
  });

  it("reads URL banned as 1/0", () => {
    expect(parseCardSearchParams({ banned: "1" }).banned).toBe("1");
    expect(parseCardSearchParams({ banned: "0" }).banned).toBe("0");
    expect(parseCardSearchParams({ banned: "yes" }).banned).toBeUndefined();
  });

  it("an explicit dropdown param for a different field is kept alongside q", () => {
    const result = parseCardSearchParams({
      q: "f:anarch s:virus",
      side: "runner",
    });
    expect(result.q).toBe("f:anarch s:virus");
    expect(result.side).toBe("runner");
    expect(result.faction).toBeUndefined();
  });
});
