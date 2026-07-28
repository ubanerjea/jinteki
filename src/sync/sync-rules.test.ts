import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseRuleSections } from "./sync-rules";

const fixtureHtml = readFileSync(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "__fixtures__",
    "rules-page-snippet.html",
  ),
  "utf-8",
);

// The fixture is a real, recorded excerpt of rules.nullsignal.games (fetched
// live 2026-07-28): chapter 3 ("Card Types")'s header plus four of its real
// sections - 3.1 Identities, 3.2 Agendas, 3.5 Operations, 3.6 Upgrades -
// chosen specifically to exercise: multiple sections in one chapter, a
// section with only numbered clauses (Agendas), a section with lettered
// sub-clauses tied to card subtypes (Operations' condition/current/lockdown),
// and a section containing a folded-in "sub-section" (3.6.5 Regions, which is
// a plain <li class="Rule"> with a SubSection span, not its own heading -
// this is the case PHASE_3_PLAN.md calls out as needing confirmation that
// sub-clauses stay folded into their parent section's row).
describe("parseRuleSections", () => {
  const sections = parseRuleSections(fixtureHtml);

  it("parses one row per h2.Section, not per h1.Chapter or per clause", () => {
    // The fixture's <main> has 1 h1.Chapter and 4 h2.Section elements.
    expect(sections).toHaveLength(4);
  });

  it("extracts id/title/anchor from the section heading text", () => {
    expect(sections.map((s) => ({ id: s.id, title: s.title, anchor: s.anchor }))).toEqual([
      { id: "3.1", title: "Identities", anchor: "sec_identities" },
      { id: "3.2", title: "Agendas", anchor: "sec_agendas" },
      { id: "3.5", title: "Operations", anchor: "sec_operations" },
      { id: "3.6", title: "Upgrades", anchor: "sec_upgrades" },
    ]);
  });

  it("inserts a space between adjacent inline elements with no whitespace in the source HTML", () => {
    const identities = sections.find((s) => s.id === "3.1")!;
    // Source HTML has `<a class="RuleLink">3.1.1.</a><span class="RuleText">Each player...`
    // with zero whitespace between the tags - a naive .text() would read
    // "3.1.1.Each player starts...".
    expect(identities.bodyText).toContain("3.1.1. Each player starts the game");
    expect(identities.bodyText).not.toContain("3.1.1.Each");
  });

  it("folds numbered clauses AND lettered sub-clauses into the section's bodyText", () => {
    const operations = sections.find((s) => s.id === "3.5")!;
    // 3.5.1 (a top-level Rule) and 3.5.1a/b/c (lettered SubRules under it)
    // should all be present in the same row's bodyText.
    expect(operations.bodyText).toContain(
      "Operations are the only Corp cards that are played",
    );
    expect(operations.bodyText).toContain("subtype condition");
    expect(operations.bodyText).toContain("subtype current");
    expect(operations.bodyText).toContain("subtype lockdown");
  });

  it("folds a 'sub-section' item (e.g. 3.6.5 Regions) into its parent section's row rather than creating a separate row", () => {
    const upgrades = sections.find((s) => s.id === "3.6")!;
    expect(upgrades.bodyText).toContain("Regions");
    expect(upgrades.bodyText).toContain(
      'have the text "Limit 1 region per server."',
    );
    // Confirms it's genuinely folded in, not a separate top-level section.
    expect(sections.some((s) => s.id === "3.6.5")).toBe(false);
    expect(sections.some((s) => s.anchor === "subsec_regions")).toBe(false);
  });

  it("is idempotent: parsing the same fixture twice yields identical output", () => {
    const again = parseRuleSections(fixtureHtml);
    expect(again).toEqual(sections);
  });

  it("throws if the page has no <main> element (structure changed)", () => {
    expect(() => parseRuleSections("<html><body>no main here</body></html>")).toThrow(
      /no <main> element/,
    );
  });
});
