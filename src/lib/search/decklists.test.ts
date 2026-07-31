// Integration tests against the real, already-synced Postgres database
// (~74k decklists). See cards.test.ts's header comment for why this needs a
// real DB connection rather than fixtures.

import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { parseDecklistSearchParams, searchDecklists } from "./decklists";

afterAll(async () => {
  await prisma.$disconnect();
});

describe("parseDecklistSearchParams", () => {
  it("trims and drops blank values to undefined", () => {
    const result = parseDecklistSearchParams({
      q: "  NBN Rush  ",
      identity: "",
    });
    expect(result.q).toBe("NBN Rush");
    expect(result.identity).toBeUndefined();
  });

  it("defaults page to 1 and pageSize to the default when absent", () => {
    const result = parseDecklistSearchParams({});
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(30);
  });
});

describe("searchDecklists (real DB)", () => {
  it("an empty query lists results rather than erroring or returning nothing", async () => {
    const result = await searchDecklists({});
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.total).toBeGreaterThan(70000); // ~74k decklists synced
  });

  it('searching "NBN Rush" returns a decklist literally named that', async () => {
    const result = await searchDecklists({ q: "NBN Rush", pageSize: 50 });
    expect(result.items.map((d) => d.name)).toContain("NBN Rush");
  });

  it("a typo'd search still returns something reasonable", async () => {
    const result = await searchDecklists({ q: "NBN Rsh", pageSize: 50 });
    expect(result.items.length).toBeGreaterThan(0);
    expect(
      result.items.some((d) => d.name.toLowerCase().includes("rush")),
    ).toBe(true);
  });

  // plans/SEARCH_MATCHING.md: word_similarity('rush', 'Crushed Fingers') =
  // 0.4, below the 0.6 word_similarity_threshold, so this specific case only
  // matches via the ILIKE substring fallback, not `<%` alone - pinning it
  // guards that fallback, not just the primary word_similarity path. Note
  // this is deliberately *not* the "rsh" typo case: "rush" here is a clean
  // substring of a longer word, which is the documented gap `%`-only
  // matching used to miss; "rsh" (a dropped-letter typo) is a separate,
  // accepted gap that no substring technique here is meant to solve.
  it('a whole word matches as a substring of a longer word ("rush" -> "Crushed Fingers")', async () => {
    // Plain q="rush" alone returns 673 matches on the real dataset (per
    // plans/SEARCH_MATCHING.md) with "Crushed Fingers" scoring only 0.4
    // (below the word_similarity threshold, an ILIKE-only match) - it ranks
    // deep in that list, past MAX_PAGE_SIZE. Narrow with the identity filter
    // (same pattern as the other identity-filter tests above) so the
    // pinned row is reachable within a single page without asserting
    // anything about its rank.
    const result = await searchDecklists({
      q: "rush",
      identity: "pravdivost_consulting_political_solutions",
      pageSize: 50,
    });
    expect(result.items.map((d) => d.name)).toContain("Crushed Fingers");
  });

  it("identity filter matches a direct count and every row has that identity", async () => {
    const directCount = await prisma.decklist.count({
      where: { identityCode: "nbn_the_world_is_yours" },
    });
    const result = await searchDecklists({
      identity: "nbn_the_world_is_yours",
      pageSize: 100,
    });
    expect(result.total).toBe(directCount);
    expect(
      result.items.every((d) => d.identityCode === "nbn_the_world_is_yours"),
    ).toBe(true);
  });

  it("each result includes the joined identity title", async () => {
    const result = await searchDecklists({
      identity: "nbn_the_world_is_yours",
      pageSize: 1,
    });
    expect(result.items[0]?.identityTitle).toBeTruthy();
  });

  it("paginates correctly: page 2 continues where page 1 left off, no overlap", async () => {
    const pageSize = 25;
    const page1 = await searchDecklists({ page: 1, pageSize });
    const page2 = await searchDecklists({ page: 2, pageSize });
    expect(page1.items).toHaveLength(pageSize);
    expect(page2.items).toHaveLength(pageSize);
    const page1Ids = new Set(page1.items.map((d) => d.id));
    const overlap = page2.items.filter((d) => page1Ids.has(d.id));
    expect(overlap).toHaveLength(0);
  });

  it("total-count matches a direct SELECT count(*) with the same filter", async () => {
    const directCount = await prisma.decklist.count({
      where: { identityCode: "whizzard_master_gamer" },
    });
    const result = await searchDecklists({
      identity: "whizzard_master_gamer",
      pageSize: 1,
    });
    expect(result.total).toBe(directCount);
  });

  it("the last page has the correct remainder", async () => {
    const pageSize = 40;
    const directCount = await prisma.decklist.count({
      where: { identityCode: "nbn_the_world_is_yours" },
    });
    const lastPage = Math.ceil(directCount / pageSize);
    const expectedRemainder = directCount - (lastPage - 1) * pageSize;
    const result = await searchDecklists({
      identity: "nbn_the_world_is_yours",
      page: lastPage,
      pageSize,
    });
    expect(result.items).toHaveLength(expectedRemainder);
    expect(result.totalPages).toBe(lastPage);
  });

  // PHASE_4_PLAN.md verification requirement: confirm the planner actually
  // uses the pg_trgm GIN index (Decklist_name_trgm_idx) at this row count,
  // rather than a sequential scan over ~74k rows. Encoded as a real,
  // automated regression test (not just a one-off manual `psql EXPLAIN`,
  // though that was also run - see agent-reports/phase-4.md) so a future
  // change that accidentally defeats the index (e.g. wrapping `name` in a
  // function) gets caught by `pnpm test`.
  //
  // Query shape updated for plans/SEARCH_MATCHING.md's `<%`/ILIKE change
  // (this test previously pinned the pre-change `%`/similarity() query,
  // which searchDecklists() no longer issues - a stale EXPLAIN target
  // wouldn't have caught a real regression in the actual query path).
  // Confirmed directly via psql that both conditions still hit the same
  // index via a BitmapOr (`Decklist_name_trgm_idx` scanned once for the
  // `%>` word-similarity condition, once for the `ILIKE` condition).
  it("the name-search query plan uses the trigram GIN index, not a sequential scan", async () => {
    const rows = await prisma.$queryRaw<{ "QUERY PLAN": string }[]>`
      EXPLAIN SELECT d.id, d.name, d."identityCode" AS "identityCode", c.title AS "identityTitle"
      FROM "Decklist" d
      JOIN "Card" c ON c.code = d."identityCode"
      WHERE ('NBN Rush' <% d.name OR d.name ILIKE '%NBN Rush%')
      ORDER BY word_similarity('NBN Rush', d.name) DESC, d.name ASC
      LIMIT 30 OFFSET 0
    `;
    const planText = rows.map((r) => r["QUERY PLAN"]).join("\n");
    expect(planText).toContain("Decklist_name_trgm_idx");
    expect(planText).not.toContain('Seq Scan on "Decklist"');
  });
});
