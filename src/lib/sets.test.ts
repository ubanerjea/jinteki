import { describe, expect, it } from "vitest";

import {
  formatReleaseDate,
  groupSetsByCycle,
  packSearchHref,
  type CycleLike,
  type PackLike,
} from "./sets";

const cycles: CycleLike[] = [
  { id: "borealis", name: "Borealis" },
  { id: "vantage_point", name: "Vantage Point" },
  { id: "elevation", name: "Elevation" },
];

const borealisPacks: PackLike[] = [
  {
    code: "midnight_sun_booster_pack",
    name: "Midnight Sun Booster Pack",
    size: 7,
    dateRelease: new Date("2022-03-18"),
    cardCycleId: "borealis",
  },
  {
    code: "midnight_sun",
    name: "Midnight Sun",
    size: 65,
    dateRelease: new Date("2022-07-22"),
    cardCycleId: "borealis",
  },
  {
    code: "parhelion",
    name: "Parhelion",
    size: 63,
    dateRelease: new Date("2022-12-09"),
    cardCycleId: "borealis",
  },
];

const vantagePoint: PackLike = {
  code: "vantage_point",
  name: "Vantage Point",
  size: 66,
  dateRelease: new Date("2026-03-02"),
  cardCycleId: "vantage_point",
};

const elevation: PackLike = {
  code: "elevation",
  name: "Elevation",
  size: 55,
  dateRelease: new Date("2025-04-24"),
  cardCycleId: "elevation",
};

describe("groupSetsByCycle", () => {
  it("Borealis is a cycle header dated Parhelion, size 135, children newest first", () => {
    const grouped = groupSetsByCycle(borealisPacks, cycles);
    expect(grouped).toHaveLength(1);
    const row = grouped[0];
    expect(row.kind).toBe("cycle");
    if (row.kind !== "cycle") return;
    expect(row.name).toBe("Borealis");
    expect(row.size).toBe(135);
    expect(row.dateRelease).toEqual(new Date("2022-12-09"));
    expect(row.packs.map((p) => p.code)).toEqual([
      "parhelion",
      "midnight_sun",
      "midnight_sun_booster_pack",
    ]);
  });

  it("a single-set cycle (Vantage Point) is a pack row, no cycle header", () => {
    const grouped = groupSetsByCycle([vantagePoint], cycles);
    expect(grouped).toEqual([{ kind: "pack", pack: vantagePoint }]);
  });

  it("a single-set cycle (Elevation) is a pack row, no cycle header", () => {
    const grouped = groupSetsByCycle([elevation], cycles);
    expect(grouped).toEqual([{ kind: "pack", pack: elevation }]);
  });

  it("sorts groups by latest child date, newest first", () => {
    const grouped = groupSetsByCycle(
      [...borealisPacks, vantagePoint, elevation],
      cycles,
    );
    expect(grouped.map((row) => (row.kind === "cycle" ? row.name : row.pack.name))).toEqual([
      "Vantage Point",
      "Elevation",
      "Borealis",
    ]);
  });

  it("a null-date pack sorts last", () => {
    const draft: PackLike = {
      code: "draft",
      name: "Draft",
      size: 1,
      dateRelease: null,
      cardCycleId: null,
    };
    const grouped = groupSetsByCycle([draft, vantagePoint], cycles);
    expect(grouped.map((row) => (row.kind === "pack" ? row.pack.code : row.id))).toEqual([
      "vantage_point",
      "draft",
    ]);
  });
});

describe("packSearchHref", () => {
  it("emits one pack= per code, OR-within-facet", () => {
    expect(packSearchHref(["parhelion"])).toBe(
      "/cards/advanced/results?pack=parhelion&pageSize=30",
    );
    expect(packSearchHref(["parhelion", "midnight_sun", "midnight_sun_booster_pack"])).toBe(
      "/cards/advanced/results?pack=parhelion&pack=midnight_sun&pack=midnight_sun_booster_pack&pageSize=30",
    );
  });
});

describe("formatReleaseDate", () => {
  it("renders ISO date or blank", () => {
    expect(formatReleaseDate(new Date("2022-12-09"))).toBe("2022-12-09");
    expect(formatReleaseDate(null)).toBe("");
  });
});
