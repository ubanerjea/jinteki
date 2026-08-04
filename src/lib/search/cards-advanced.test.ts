// Tests for the advanced card search engine (PHASE_7_PLAN.md item 4).
//
// The parsing block needs no database. The "real DB" block runs against the
// same already-synced Postgres (2054 cards) as cards.test.ts - see that
// file's header for the setup this assumes.

import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import {
  parseAdvancedCardSearchParams,
  searchCardsAdvanced,
} from "./cards-advanced";

afterAll(async () => {
  await prisma.$disconnect();
});

describe("parseAdvancedCardSearchParams", () => {
  it("collects repeated facet params into arrays", () => {
    const result = parseAdvancedCardSearchParams({
      faction: ["anarch", "criminal"],
      type: ["event", "program"],
      keyword: ["virus"],
      pack: ["core_set", "revised_core_set"],
    });
    expect(result.faction).toEqual(["anarch", "criminal"]);
    expect(result.type).toEqual(["event", "program"]);
    expect(result.keyword).toEqual(["virus"]);
    expect(result.pack).toEqual(["core_set", "revised_core_set"]);
  });

  it("defaults every facet to an empty array and fuzzy to false", () => {
    const result = parseAdvancedCardSearchParams({});
    expect(result.faction).toEqual([]);
    expect(result.type).toEqual([]);
    expect(result.keyword).toEqual([]);
    expect(result.pack).toEqual([]);
    expect(result.fuzzy).toBe(false);
    expect(result.title).toBeUndefined();
    expect(result.text).toBeUndefined();
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(30);
  });

  describe("fuzzy", () => {
    it("is true only for exactly '1'", () => {
      expect(parseAdvancedCardSearchParams({ fuzzy: "1" }).fuzzy).toBe(true);
    });

    it("is false when absent", () => {
      expect(parseAdvancedCardSearchParams({}).fuzzy).toBe(false);
    });

    it("is false for other truthy-looking values", () => {
      expect(parseAdvancedCardSearchParams({ fuzzy: "on" }).fuzzy).toBe(false);
      expect(parseAdvancedCardSearchParams({ fuzzy: "true" }).fuzzy).toBe(false);
      expect(parseAdvancedCardSearchParams({ fuzzy: "0" }).fuzzy).toBe(false);
    });
  });

  describe("prefix tokens", () => {
    it("recognizes each prefix in `title` alone", () => {
      expect(parseAdvancedCardSearchParams({ title: "f:anarch" }).faction).toEqual([
        "anarch",
      ]);
      expect(parseAdvancedCardSearchParams({ title: "t:ice" }).type).toEqual([
        "ice",
      ]);
      expect(parseAdvancedCardSearchParams({ title: "s:virus" }).keyword).toEqual([
        "virus",
      ]);
      expect(parseAdvancedCardSearchParams({ title: "d:runner" }).side).toBe(
        "runner",
      );
    });

    it("recognizes each prefix in `text` alone", () => {
      expect(parseAdvancedCardSearchParams({ text: "f:anarch" }).faction).toEqual([
        "anarch",
      ]);
      expect(parseAdvancedCardSearchParams({ text: "t:ice" }).type).toEqual([
        "ice",
      ]);
      expect(parseAdvancedCardSearchParams({ text: "s:virus" }).keyword).toEqual([
        "virus",
      ]);
      expect(parseAdvancedCardSearchParams({ text: "d:runner" }).side).toBe(
        "runner",
      );
    });

    it("folds tokens from both boxes when they target different fields", () => {
      const result = parseAdvancedCardSearchParams({
        title: "f:anarch rootkit",
        text: "s:virus trash",
      });
      expect(result.faction).toEqual(["anarch"]);
      expect(result.keyword).toEqual(["virus"]);
      expect(result.title).toBe("rootkit");
      expect(result.text).toBe("trash");
    });

    it("is case-insensitive on the prefix letter", () => {
      expect(parseAdvancedCardSearchParams({ title: "F:anarch" }).faction).toEqual(
        ["anarch"],
      );
      expect(parseAdvancedCardSearchParams({ text: "S:virus" }).keyword).toEqual([
        "virus",
      ]);
    });

    it("strips the token from the residual text, leaving the rest", () => {
      const result = parseAdvancedCardSearchParams({
        title: "f:anarch s:virus rootkit",
      });
      expect(result.title).toBe("rootkit");
    });

    it("leaves an unrecognized prefix as literal text", () => {
      const result = parseAdvancedCardSearchParams({ title: "x:foo bar" });
      expect(result.faction).toEqual([]);
      expect(result.title).toBe("x:foo bar");
    });

    it("returns undefined text when a box held nothing but tokens", () => {
      const result = parseAdvancedCardSearchParams({ title: "f:anarch" });
      expect(result.title).toBeUndefined();
    });
  });

  describe("precedence", () => {
    it("an explicit picker value beats a same-field token in `title`", () => {
      const result = parseAdvancedCardSearchParams({
        title: "f:anarch",
        faction: "nbn",
      });
      expect(result.faction).toEqual(["nbn"]);
      // The token is still consumed, not left behind as literal text.
      expect(result.title).toBeUndefined();
    });

    it("an explicit picker value beats a same-field token in `text`", () => {
      const result = parseAdvancedCardSearchParams({
        text: "f:anarch",
        faction: "nbn",
      });
      expect(result.faction).toEqual(["nbn"]);
      expect(result.text).toBeUndefined();
    });

    it("an explicit multi-value picker beats a token too", () => {
      const result = parseAdvancedCardSearchParams({
        title: "t:ice",
        type: ["event", "program"],
      });
      expect(result.type).toEqual(["event", "program"]);
    });

    it("`title`'s token wins when both boxes carry one for the same field", () => {
      const result = parseAdvancedCardSearchParams({
        title: "f:anarch",
        text: "f:nbn",
      });
      expect(result.faction).toEqual(["anarch"]);
      // Both tokens are consumed as operators either way.
      expect(result.title).toBeUndefined();
      expect(result.text).toBeUndefined();
    });

    it("an explicit value for one field doesn't block a token for another", () => {
      const result = parseAdvancedCardSearchParams({
        title: "f:anarch s:virus",
        side: "runner",
      });
      expect(result.faction).toEqual(["anarch"]);
      expect(result.keyword).toEqual(["virus"]);
      expect(result.side).toBe("runner");
    });
  });

  it("ignores an unrecognized order value", () => {
    expect(parseAdvancedCardSearchParams({ order: "nope" }).order).toBeUndefined();
    expect(parseAdvancedCardSearchParams({ order: "faction" }).order).toBe(
      "faction",
    );
  });

  // `order in ORDER_COLUMNS` matched inherited keys, so these passed
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
      expect(parseAdvancedCardSearchParams({ order }).order).toBeUndefined();
    }
    expect(parseAdvancedCardSearchParams({ order: "type" }).order).toBe("type");
  });

  // Postgres rejects 0x00 in UTF-8 text, so
  // `/cards/advanced/results?title=a%00b` used to 500.
  describe("NUL bytes", () => {
    it("strips them from the text fields", () => {
      const result = parseAdvancedCardSearchParams({
        title: "a\0b",
        text: "c\0d",
      });
      expect(result.title).toBe("ab");
      expect(result.text).toBe("cd");
    });

    it("strips them from multi-value facets", () => {
      const result = parseAdvancedCardSearchParams({
        faction: ["an\0arch", "crim\0inal"],
      });
      expect(result.faction).toEqual(["anarch", "criminal"]);
    });

    it("treats a NUL-only field as blank", () => {
      expect(parseAdvancedCardSearchParams({ title: "\0" }).title).toBeUndefined();
      expect(parseAdvancedCardSearchParams({ faction: "\0" }).faction).toEqual(
        [],
      );
    });
  });

  // The "Cards per page" <select> offers 30/60/100 only. `?pageSize=45` used
  // to render 45 rows while the form's select fell back to displaying 30, so
  // re-submitting silently discarded the 45.
  it("restricts pageSize to the set the form offers", () => {
    expect(parseAdvancedCardSearchParams({ pageSize: "60" }).pageSize).toBe(60);
    expect(parseAdvancedCardSearchParams({ pageSize: "45" }).pageSize).toBe(30);
    expect(parseAdvancedCardSearchParams({ pageSize: "999999" }).pageSize).toBe(
      100,
    );
  });
});

describe("searchCardsAdvanced (real DB)", () => {
  // The whole point of the advanced page: fuzziness is opt-in, and the
  // default really is a plain substring match. Cross-checked against psql:
  // `title ILIKE '%efficency%'` -> 0 rows;
  // `title ILIKE '%efficency%' OR 'efficency' <% title` -> 3 rows.
  describe("the opt-out default actually holds", () => {
    it("fuzzy off: a misspelt title returns 0 rows", async () => {
      const result = await searchCardsAdvanced({ title: "efficency" });
      expect(result.total).toBe(0);
      expect(result.items).toHaveLength(0);
    });

    it("fuzzy on: the same misspelt title returns the 3 real matches", async () => {
      const result = await searchCardsAdvanced({
        title: "efficency",
        fuzzy: true,
      });
      expect(result.total).toBe(3);
      expect(result.items.map((c) => c.title).sort()).toEqual([
        "Bioroid Efficiency Research",
        "Efficiency Committee",
        "Peak Efficiency",
      ]);
    });

    it("fuzzy defaults to off when the flag is simply absent", async () => {
      const result = await searchCardsAdvanced({ title: "efficency" });
      const parsed = parseAdvancedCardSearchParams({ title: "efficency" });
      const viaParser = await searchCardsAdvanced(parsed);
      expect(result.total).toBe(0);
      expect(viaParser.total).toBe(0);
    });
  });

  describe("title and text are ANDed, not ORed", () => {
    it("both fields together returns the intersection of each alone", async () => {
      // `title` matches 3 cards and `text` matches 78 (cross-checked in
      // psql), so the title side fits in one page and can be compared row
      // by row; the text side is compared by total against a direct count
      // rather than by paging all of it in.
      const titleOnly = await searchCardsAdvanced({
        title: "virus",
        pageSize: 100,
      });
      const textOnly = await searchCardsAdvanced({ text: "trash", pageSize: 1 });
      const both = await searchCardsAdvanced({
        title: "virus",
        text: "trash",
        pageSize: 100,
      });

      const directBoth = await prisma.card.count({
        where: {
          title: { contains: "virus", mode: "insensitive" },
          text: { contains: "trash", mode: "insensitive" },
        },
      });
      expect(both.total).toBe(directBoth);
      expect(both.total).toBeGreaterThan(0);

      // AND, not OR: strictly narrower than either field on its own...
      expect(both.total).toBeLessThan(titleOnly.total);
      expect(both.total).toBeLessThan(textOnly.total);
      // ...and every row it returns is a row the title-only query returned.
      const titleCodes = new Set(titleOnly.items.map((c) => c.code));
      expect(both.items.every((c) => titleCodes.has(c.code))).toBe(true);
      // Each returned row really satisfies both conditions.
      expect(
        both.items.every((c) => c.title.toLowerCase().includes("virus")),
      ).toBe(true);
    });
  });

  describe("multi-value facets: OR within, AND across", () => {
    it("type=[event,program] equals the union of each alone", async () => {
      const events = await searchCardsAdvanced({ type: ["event"], pageSize: 1 });
      const programs = await searchCardsAdvanced({
        type: ["program"],
        pageSize: 1,
      });
      const both = await searchCardsAdvanced({
        type: ["event", "program"],
        pageSize: 1,
      });
      expect(both.total).toBe(events.total + programs.total);

      const direct = await prisma.card.count({
        where: { typeCode: { in: ["event", "program"] } },
      });
      expect(both.total).toBe(direct);
    });

    it("faction+type+keyword combined matches a direct prisma count (34)", async () => {
      const direct = await prisma.card.count({
        where: {
          factionCode: { in: ["anarch", "criminal"] },
          typeCode: { in: ["event", "program"] },
          keywords: { has: "virus" },
        },
      });
      expect(direct).toBe(34);

      const result = await searchCardsAdvanced({
        faction: ["anarch", "criminal"],
        type: ["event", "program"],
        keyword: ["virus"],
        pageSize: 100,
      });
      expect(result.total).toBe(direct);
      expect(
        result.items.every(
          (c) =>
            ["anarch", "criminal"].includes(c.factionCode) &&
            ["event", "program"].includes(c.typeCode),
        ),
      ).toBe(true);
    });

    it("a single-value array behaves exactly like the scalar searchCards path", async () => {
      const direct = await prisma.card.count({ where: { factionCode: "anarch" } });
      const result = await searchCardsAdvanced({
        faction: ["anarch"],
        pageSize: 1,
      });
      expect(result.total).toBe(direct);
      expect(result.total).toBe(253);
    });
  });

  describe("multi-value keyword uses overlap, not equality", () => {
    it("a card carrying either of two requested subtypes matches", async () => {
      const direct = await prisma.card.count({
        where: { keywords: { hasSome: ["virus", "icebreaker"] } },
      });
      const result = await searchCardsAdvanced({
        keyword: ["virus", "icebreaker"],
        pageSize: 100,
      });
      expect(result.total).toBe(direct);

      const virusOnly = await searchCardsAdvanced({
        keyword: ["virus"],
        pageSize: 1,
      });
      const breakerOnly = await searchCardsAdvanced({
        keyword: ["icebreaker"],
        pageSize: 1,
      });
      // Overlap, so strictly more than either alone but no more than their
      // sum (cards can carry both subtypes).
      expect(result.total).toBeGreaterThan(virusOnly.total);
      expect(result.total).toBeGreaterThan(breakerOnly.total);
      expect(result.total).toBeLessThanOrEqual(
        virusOnly.total + breakerOnly.total,
      );

      // Every returned row really does carry at least one of them.
      const codes = result.items.map((c) => c.code);
      const rows = await prisma.card.findMany({
        where: { code: { in: codes } },
        select: { keywords: true },
      });
      expect(
        rows.every(
          (r) => r.keywords.includes("virus") || r.keywords.includes("icebreaker"),
        ),
      ).toBe(true);
    });
  });

  describe("ordering", () => {
    it("defaults to title ASC with fuzzy off", async () => {
      const result = await searchCardsAdvanced({ type: ["event"], pageSize: 20 });
      const direct = await prisma.card.findMany({
        where: { typeCode: "event" },
        orderBy: { title: "asc" },
        take: 20,
        select: { title: true },
      });
      expect(result.items.map((c) => c.title)).toEqual(
        direct.map((c) => c.title),
      );
    });

    it("an explicit order column wins over relevance ranking", async () => {
      const result = await searchCardsAdvanced({
        title: "efficency",
        fuzzy: true,
        order: "faction",
        pageSize: 10,
      });
      const factions = result.items.map((c) => c.factionCode);
      expect(factions).toEqual([...factions].sort((a, b) => a.localeCompare(b)));
    });
  });

  // /cards/syntax promises "plain, case-insensitive substring matches", so
  // LIKE's own metacharacters must be escaped. Cross-checked in psql: no
  // card title contains a literal % or _; `title ILIKE '%e_ficiency%'`
  // matches 3 rows as a wildcard and 0 as a literal.
  describe("LIKE metacharacters are matched literally", () => {
    it("`%` no longer matches every card", async () => {
      const result = await searchCardsAdvanced({ title: "%" });
      expect(result.total).toBe(0);
    });

    it("`_` no longer matches every card", async () => {
      const result = await searchCardsAdvanced({ title: "_" });
      expect(result.total).toBe(0);
    });

    it("`_` inside a word is not a single-character wildcard", async () => {
      // Wildcard-interpreted, "e_ficiency" would find the 3 Efficiency
      // cards; as a literal it finds nothing.
      const wildcard = await searchCardsAdvanced({ title: "efficiency" });
      expect(wildcard.total).toBe(3);
      const literal = await searchCardsAdvanced({ title: "e_ficiency" });
      expect(literal.total).toBe(0);
    });

    it("applies to the text field too", async () => {
      const result = await searchCardsAdvanced({ text: "%" });
      expect(result.total).toBe(0);
    });

    it("a trailing backslash does not escape the pattern's delimiter", async () => {
      const result = await searchCardsAdvanced({ title: "\\" });
      expect(result.total).toBe(0);
    });

    it("ordinary terms are unaffected by the escaping", async () => {
      const result = await searchCardsAdvanced({ title: "virus", pageSize: 100 });
      expect(result.total).toBe(3);
    });
  });

  it("an inherited Object.prototype key as `order` falls back to title ASC", async () => {
    const defaultResult = await searchCardsAdvanced({
      type: ["event"],
      pageSize: 20,
    });
    for (const order of ["constructor", "__proto__"]) {
      const result = await searchCardsAdvanced({
        type: ["event"],
        order,
        pageSize: 20,
      });
      expect(result.items.map((c) => c.code)).toEqual(
        defaultResult.items.map((c) => c.code),
      );
    }
  });

  it("no criteria at all lists every card", async () => {
    const result = await searchCardsAdvanced({});
    expect(result.total).toBe(2054);
    expect(result.items).toHaveLength(30);
  });
});
