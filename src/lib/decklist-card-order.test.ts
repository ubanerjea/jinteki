import { describe, expect, it } from "vitest";

import {
  compareByFaction,
  compareByName,
  compareByType,
} from "./decklist-card-order";

const cards = [
  { card: { typeCode: "ice", title: "Ansel 1.0", factionCode: "haas_bioroid" } },
  { card: { typeCode: "program", title: "Aumakua", factionCode: "anarch" } },
  { card: { typeCode: "ice", title: "Anansi", factionCode: "haas_bioroid" } },
  { card: { typeCode: "hardware", title: "Zamba", factionCode: "shaper" } },
];

describe("compareByType", () => {
  it("groups by typeCode first, then alphabetically by title within a type", () => {
    const sorted = [...cards].sort(compareByType);
    expect(sorted.map((c) => c.card.title)).toEqual([
      "Zamba",
      "Anansi",
      "Ansel 1.0",
      "Aumakua",
    ]);
  });
});

describe("compareByFaction", () => {
  it("groups by factionCode first, then alphabetically by title within a faction", () => {
    const sorted = [...cards].sort(compareByFaction);
    expect(sorted.map((c) => c.card.title)).toEqual([
      "Aumakua",
      "Anansi",
      "Ansel 1.0",
      "Zamba",
    ]);
  });
});

describe("compareByName", () => {
  it("sorts purely alphabetically by title, ignoring type/faction", () => {
    const sorted = [...cards].sort(compareByName);
    expect(sorted.map((c) => c.card.title)).toEqual([
      "Anansi",
      "Ansel 1.0",
      "Aumakua",
      "Zamba",
    ]);
  });
});
