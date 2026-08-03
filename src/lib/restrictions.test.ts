import { describe, expect, it } from "vitest";

import { computeCardLegality, summarizeLegality } from "./restrictions";

const formats = [
  { id: "standard", name: "Standard", activeRestrictionId: "standard_ban_list_26_03" },
  { id: "startup", name: "Startup", activeRestrictionId: "startup_balance_update_26_03" },
  { id: "eternal", name: "Eternal", activeRestrictionId: "eternal_points_list_26_03" },
  { id: "ram", name: "Random Access Memories", activeRestrictionId: null },
];

describe("computeCardLegality", () => {
  it("a card with no restrictions history is legal in every format it's a member of", () => {
    const result = computeCardLegality(
      ["standard", "eternal"],
      undefined,
      formats,
    );
    expect(result).toEqual([
      { formatId: "standard", formatName: "Standard", status: "legal" },
      { formatId: "eternal", formatName: "Eternal", status: "legal" },
    ]);
  });

  it("omits formats the card isn't a member of at all", () => {
    const result = computeCardLegality(["standard"], undefined, formats);
    expect(result).toHaveLength(1);
    expect(result[0].formatId).toBe("standard");
  });

  it("a format with no active restriction is always legal (e.g. ram)", () => {
    const result = computeCardLegality(["ram"], undefined, formats);
    expect(result).toEqual([
      { formatId: "ram", formatName: "Random Access Memories", status: "legal" },
    ]);
  });

  it("banned: the card's restrictions.banned includes the format's active restriction id", () => {
    const result = computeCardLegality(
      ["standard"],
      { banned: ["standard_ban_list_26_03"], restricted: [], points: {}, universal_faction_cost: {}, global_penalty: [] },
      formats,
    );
    expect(result).toEqual([
      { formatId: "standard", formatName: "Standard", status: "banned" },
    ]);
  });

  it("banned in an old (no-longer-active) restriction id does NOT count as currently banned", () => {
    const result = computeCardLegality(
      ["standard"],
      { banned: ["standard_ban_list_20_06"], restricted: [], points: {}, universal_faction_cost: {}, global_penalty: [] },
      formats,
    );
    expect(result).toEqual([
      { formatId: "standard", formatName: "Standard", status: "legal" },
    ]);
  });

  it("restricted: matches the active restriction id in restrictions.restricted", () => {
    const result = computeCardLegality(
      ["startup"],
      { banned: [], restricted: ["startup_balance_update_26_03"], points: {}, universal_faction_cost: {}, global_penalty: [] },
      formats,
    );
    expect(result).toEqual([
      { formatId: "startup", formatName: "Startup", status: "restricted" },
    ]);
  });

  it("points: matches the active restriction id as a key in restrictions.points", () => {
    const result = computeCardLegality(
      ["eternal"],
      { banned: [], restricted: [], points: { eternal_points_list_26_03: 2 }, universal_faction_cost: {}, global_penalty: [] },
      formats,
    );
    expect(result).toEqual([
      { formatId: "eternal", formatName: "Eternal", status: "points", points: 2 },
    ]);
  });

  it("influence: matches the active restriction id as a key in universal_faction_cost", () => {
    const result = computeCardLegality(
      ["eternal"],
      { banned: [], restricted: [], points: {}, universal_faction_cost: { eternal_points_list_26_03: 3 }, global_penalty: [] },
      formats,
    );
    expect(result).toEqual([
      { formatId: "eternal", formatName: "Eternal", status: "influence", influenceCost: 3 },
    ]);
  });

  it("real-data regression: sifr in eternal (2 points, active list) and standard (unbanned by the active list)", () => {
    // Confirmed live against GET /cards/sifr (agent-reports/phase-6.md) -
    // sifr costs 2 points in every eternal points list including the current
    // one, but its standard-format bans stop at standard_ban_list_23_03 (not
    // present for later/active lists), so it should read "legal" in
    // standard, not "banned".
    const sifrRestrictions = {
      banned: [
        "napd_mwl_2_0",
        "napd_mwl_2_1",
        "napd_mwl_2_2",
        "snapshot_ban_list_1_0",
        "standard_ban_list_20_06",
        "standard_ban_list_23_03",
      ],
      restricted: [],
      points: { eternal_points_list_26_03: 2 },
      universal_faction_cost: { napd_mwl_1_2: 3 },
      global_penalty: [],
    };
    const result = computeCardLegality(
      ["standard", "eternal"],
      sifrRestrictions,
      formats,
    );
    expect(result).toEqual([
      { formatId: "standard", formatName: "Standard", status: "legal" },
      { formatId: "eternal", formatName: "Eternal", status: "points", points: 2 },
    ]);
  });
});

describe("summarizeLegality", () => {
  it("groups into one line per status, omitting empty groups", () => {
    const lines = summarizeLegality([
      { formatId: "standard", formatName: "Standard", status: "legal" },
      { formatId: "startup", formatName: "Startup", status: "legal" },
      { formatId: "eternal", formatName: "Eternal", status: "banned" },
    ]);
    expect(lines).toEqual([
      {
        label: "Legal in",
        entries: [
          { formatId: "standard", formatName: "Standard" },
          { formatId: "startup", formatName: "Startup" },
        ],
      },
      {
        label: "Banned in",
        entries: [{ formatId: "eternal", formatName: "Eternal" }],
      },
    ]);
  });

  it("renders points and influence lines with their values", () => {
    const lines = summarizeLegality([
      { formatId: "eternal", formatName: "Eternal", status: "points", points: 2 },
    ]);
    expect(lines).toEqual([
      {
        label: "2 pts in",
        entries: [{ formatId: "eternal", formatName: "Eternal" }],
      },
    ]);
  });

  it("singular 'pt' when points is exactly 1", () => {
    const lines = summarizeLegality([
      { formatId: "eternal", formatName: "Eternal", status: "points", points: 1 },
    ]);
    expect(lines).toEqual([
      {
        label: "1 pt in",
        entries: [{ formatId: "eternal", formatName: "Eternal" }],
      },
    ]);
  });

  it("returns an empty array when there are no entries", () => {
    expect(summarizeLegality([])).toEqual([]);
  });
});
