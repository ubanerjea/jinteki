// Integration tests against the real, already-synced Postgres database
// (119 RuleSection rows) - same real-DB approach as cards.test.ts/
// decklists.test.ts, since this is testing real trigram ranking + the
// natural (numeric) section-id ordering, per PHASE_5_PLAN.md's Testing
// section.

import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import {
  parseRuleSectionSearchParams,
  searchRuleSections,
} from "./rule-sections";

afterAll(async () => {
  await prisma.$disconnect();
});

describe("parseRuleSectionSearchParams", () => {
  it("trims and drops blank q to undefined", () => {
    expect(parseRuleSectionSearchParams({ q: "  sabotage  " }).q).toBe(
      "sabotage",
    );
    expect(parseRuleSectionSearchParams({ q: "   " }).q).toBeUndefined();
  });

  it("defaults page to 1 and pageSize to the default when absent", () => {
    const result = parseRuleSectionSearchParams({});
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(30);
  });
});

describe("searchRuleSections (real DB)", () => {
  it("an empty query lists results rather than erroring or returning nothing", async () => {
    const result = await searchRuleSections({});
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.total).toBeGreaterThanOrEqual(119); // 119 sections synced
  });

  it("with no query, sections are ordered numerically (1.1, 1.2, ..., 1.10, ..., 2.1, ...), not lexicographically", async () => {
    const result = await searchRuleSections({ pageSize: 100 });
    const ids = result.items.map((s) => s.id);
    // Lexicographic order would sort "1.10" before "1.2" - assert that
    // didn't happen for the real ids returned.
    const idx110 = ids.indexOf("1.10");
    const idx12 = ids.indexOf("1.2");
    if (idx110 !== -1 && idx12 !== -1) {
      expect(idx12).toBeLessThan(idx110);
    }
    // And chapter 10 sections must sort after chapter 2 sections, not
    // before (as they would under plain string comparison).
    const idx101 = ids.indexOf("10.1");
    const idx21 = ids.indexOf("2.1");
    if (idx101 !== -1 && idx21 !== -1) {
      expect(idx21).toBeLessThan(idx101);
    }
  });

  it('searching "sabotage" returns the Sabotage section', async () => {
    const result = await searchRuleSections({ q: "sabotage" });
    expect(result.items.map((s) => s.title)).toContain("Sabotage");
  });

  it("a typo'd search still returns something reasonable", async () => {
    const result = await searchRuleSections({ q: "Operatons" });
    expect(result.items.map((s) => s.title)).toContain("Operations");
  });

  // plans/SEARCH_MATCHING.md: the old `%`-only implementation found only
  // "Trashing"/"Trash Cost"/"Traces" for q="trash" (with "Traces" being a
  // spurious trigram-overlap match, not a real "trash" hit), and none of
  // those results were unambiguous - `word_similarity`/`<%` now correctly
  // surfaces both sections a user typing "trash" is actually looking for.
  // Pinned so a future regression to whole-string-only matching is caught.
  it('"trash" finds both "Trashing" (1.19) and "Trash Cost" (2.6)', async () => {
    const result = await searchRuleSections({ q: "trash", pageSize: 100 });
    const titles = result.items.map((s) => s.title);
    expect(titles).toContain("Trashing");
    expect(titles).toContain("Trash Cost");
  });

  // Guards GREATEST(word_similarity(title,...), word_similarity(bodyText,
  // ...)) ordering, not just the filter. plans/SEARCH_MATCHING.md flags that
  // literal substring mentions all hit the same 1.0 word_similarity ceiling
  // regardless of whether the mention is topical or incidental (an accepted
  // gap, not fixed here) - but q="trash cost" still gives a genuine,
  // non-tied spread on the real dataset: "Trash Cost" (2.6) is a clean
  // title match (word_similarity = 1), while "Ownership and Control" (1.14)
  // only mentions "trash cost" once in passing, in bodyText, scoring lower
  // (word_similarity = 0.727, confirmed directly via psql) - so the title
  // match must rank strictly above it.
  it("a title-level match outranks a body-level incidental mention for the same query", async () => {
    const result = await searchRuleSections({ q: "trash cost", pageSize: 50 });
    const titles = result.items.map((s) => s.title);
    const titleMatchIndex = titles.indexOf("Trash Cost");
    const bodyOnlyMatchIndex = titles.indexOf("Ownership and Control");
    expect(titleMatchIndex).toBeGreaterThanOrEqual(0);
    expect(bodyOnlyMatchIndex).toBeGreaterThanOrEqual(0);
    expect(titleMatchIndex).toBeLessThan(bodyOnlyMatchIndex);
  });

  it("total-count matches a direct SELECT count(*)", async () => {
    const directCount = await prisma.ruleSection.count();
    const result = await searchRuleSections({ pageSize: 1 });
    expect(result.total).toBe(directCount);
  });

  it("paginates correctly: page 2 continues where page 1 left off, no overlap", async () => {
    const pageSize = 10;
    const page1 = await searchRuleSections({ page: 1, pageSize });
    const page2 = await searchRuleSections({ page: 2, pageSize });
    expect(page1.items).toHaveLength(pageSize);
    expect(page2.items.length).toBeGreaterThan(0);
    const page1Ids = new Set(page1.items.map((s) => s.id));
    const overlap = page2.items.filter((s) => page1Ids.has(s.id));
    expect(overlap).toHaveLength(0);
  });
});
