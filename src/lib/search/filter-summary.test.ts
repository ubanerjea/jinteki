// Pure rendering-logic tests for /cards' read-only "filtered by" note and
// /cards/advanced/results' query summary (PHASE_7_PLAN.md items 6 and 8).
// No DB connection - the note deliberately costs no query.

import { describe, expect, it } from "vitest";

import {
  clearFacetsHref,
  describeFacets,
  editInAdvancedHref,
  formatFacetSummary,
  hasActiveFacets,
} from "./filter-summary";

describe("describeFacets", () => {
  it("renders nothing when no facet param is present", () => {
    expect(describeFacets({})).toEqual([]);
    expect(describeFacets({ q: "bioroid" })).toEqual([]);
    expect(describeFacets({ q: "bioroid", view: "grid", page: "2" })).toEqual([]);
    expect(hasActiveFacets({ q: "bioroid" })).toBe(false);
  });

  it("renders a single facet with a human label", () => {
    expect(describeFacets({ faction: "anarch" })).toEqual([
      { key: "faction", label: "Faction", values: ["Anarch"] },
    ]);
    expect(hasActiveFacets({ faction: "anarch" })).toBe(true);
  });

  it("labels keyword as Subtype, matching the advanced form's row", () => {
    expect(describeFacets({ keyword: "virus" })[0].label).toBe("Subtype");
  });

  it("collects repeated values for one facet", () => {
    expect(describeFacets({ type: ["event", "program"] })).toEqual([
      { key: "type", label: "Type", values: ["Event", "Program"] },
    ]);
  });

  it("reports facets in a fixed order regardless of URL order", () => {
    const described = describeFacets({
      format: "standard",
      keyword: "virus",
      faction: "anarch",
    });
    expect(described.map((f) => f.label)).toEqual([
      "Faction",
      "Subtype",
      "Format",
    ]);
  });

  it("ignores blank facet values", () => {
    expect(describeFacets({ faction: "", type: "  " })).toEqual([]);
  });

  it("applies formatCode's overrides to the values", () => {
    expect(describeFacets({ faction: "nbn" })[0].values).toEqual(["NBN"]);
    expect(describeFacets({ keyword: "ap" })[0].values).toEqual(["AP"]);
    expect(describeFacets({ pack: "core_set" })[0].values).toEqual(["Core Set"]);
  });
});

describe("formatFacetSummary", () => {
  it("joins facets with a middot and values with commas", () => {
    const summary = formatFacetSummary(
      describeFacets({
        type: ["event", "program"],
        faction: ["anarch", "criminal"],
        keyword: "virus",
      }),
    );
    expect(summary).toBe(
      "Faction Anarch, Criminal · Type Event, Program · Subtype Virus",
    );
  });

  it("is empty for no facets", () => {
    expect(formatFacetSummary(describeFacets({}))).toBe("");
  });

  // SIMPLE_CARD_SEARCH_PLAN.md's "filtered by" note reads "Filtered by
  // **Faction: Anarch**"; the advanced results summary keeps the colon-less
  // form ADVANCED_CARD_SEARCH_PLAN.md specifies.
  it("takes an optional label separator for /cards' note", () => {
    const described = describeFacets({ faction: "anarch", type: "event" });
    expect(formatFacetSummary(described, ": ")).toBe(
      "Faction: Anarch · Type: Event",
    );
    expect(formatFacetSummary(described)).toBe("Faction Anarch · Type Event");
  });
});

describe("clearFacetsHref", () => {
  it("preserves q and view while dropping the facets", () => {
    const href = clearFacetsHref("/cards", {
      q: "bioroid",
      view: "grid",
      faction: "anarch",
      keyword: "virus",
    });
    expect(href).toBe("/cards?q=bioroid&view=grid");
  });

  it("preserves order and pageSize too", () => {
    const href = clearFacetsHref("/cards", {
      q: "x",
      order: "faction",
      pageSize: "60",
      pack: "core_set",
    });
    expect(href).toBe("/cards?q=x&order=faction&pageSize=60");
  });

  it("drops page - widening the results invalidates the page number", () => {
    const href = clearFacetsHref("/cards", { faction: "anarch", page: "4" });
    expect(href).toBe("/cards");
  });

  it("returns the bare path when nothing survives", () => {
    expect(clearFacetsHref("/cards", { faction: "anarch" })).toBe("/cards");
  });
});

describe("editInAdvancedHref", () => {
  it("hands the facets to the advanced form", () => {
    const href = editInAdvancedHref({ faction: "anarch", keyword: "virus" });
    expect(href).toBe("/cards/advanced?faction=anarch&keyword=virus");
  });

  it("carries repeated facet values through as repeated params", () => {
    expect(editInAdvancedHref({ type: ["event", "program"] })).toBe(
      "/cards/advanced?type=event&type=program",
    );
  });

  it("carries q into the advanced form's title box", () => {
    expect(editInAdvancedHref({ q: "bioroid", faction: "anarch" })).toBe(
      "/cards/advanced?faction=anarch&title=bioroid",
    );
  });

  it("drops page, which means nothing on a form", () => {
    expect(editInAdvancedHref({ faction: "anarch", page: "3" })).toBe(
      "/cards/advanced?faction=anarch",
    );
  });
});
