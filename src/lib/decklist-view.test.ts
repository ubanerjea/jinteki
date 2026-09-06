import { describe, expect, it } from "vitest";

import {
  cardInfluenceUsed,
  deckAgendaPoints,
  deckInfluenceUsed,
  formatInfluenceLabel,
  groupDecklistCards,
  influenceLimit,
  influencePips,
  sectionTitle,
} from "./decklist-view";

const seamlessLaunch = {
  factionCode: "haas_bioroid",
  raw: { attributes: { influence_cost: 2 } },
};

const hedgeFund = {
  factionCode: "neutral_corp",
  raw: { attributes: { influence_cost: 0 } },
};

const nbnRealityPlus = {
  attributes: { influence_limit: 15, minimum_deck_size: 45 },
};

describe("cardInfluenceUsed", () => {
  it("in-faction Seamless Launch pays 0 even though influence_cost is 2", () => {
    expect(cardInfluenceUsed(seamlessLaunch, "haas_bioroid", 3)).toBe(0);
  });

  it("out-of-faction Seamless Launch in NBN is 2 pips per copy", () => {
    expect(cardInfluenceUsed(seamlessLaunch, "nbn", 3)).toBe(6);
  });

  it("Hedge Fund is 0 (neutral influence_cost)", () => {
    expect(cardInfluenceUsed(hedgeFund, "haas_bioroid", 3)).toBe(0);
    expect(cardInfluenceUsed(hedgeFund, "nbn", 1)).toBe(0);
  });
});

describe("deckInfluenceUsed / influenceLimit", () => {
  it("sums out-of-faction copies and reads influence_limit 15", () => {
    const cards = [
      { quantity: 3, card: seamlessLaunch },
      { quantity: 3, card: hedgeFund },
    ];
    expect(deckInfluenceUsed(cards, "nbn")).toBe(6);
    expect(deckInfluenceUsed(cards, "haas_bioroid")).toBe(0);
    expect(influenceLimit(nbnRealityPlus)).toBe(15);
    expect(influenceLimit({ attributes: { influence_limit: null } })).toBeNull();
  });
});

describe("deckAgendaPoints", () => {
  it("sums agenda_points * quantity", () => {
    const cards = [
      { quantity: 3, card: { raw: { attributes: { agenda_points: 2 } } } },
      { quantity: 1, card: { raw: { attributes: { agenda_points: 3 } } } },
      { quantity: 3, card: { raw: { attributes: { influence_cost: 0 } } } },
    ];
    expect(deckAgendaPoints(cards)).toBe(9);
  });
});

describe("influencePips", () => {
  it("repeats ● for used influence, empty at 0", () => {
    expect(influencePips(4)).toBe("●●●●");
    expect(influencePips(0)).toBe("");
  });
});

describe("formatInfluenceLabel", () => {
  it("includes pips, used, and limit when a limit is known", () => {
    expect(formatInfluenceLabel(4, 15)).toBe("Influence: ●●●● 4/15");
  });

  it("omits the limit when it is null and has no extra space at 0", () => {
    expect(formatInfluenceLabel(0, null)).toBe("Influence: 0");
  });
});

describe("groupDecklistCards", () => {
  it("quantity-sum headings, groups already-sorted cards", () => {
    const cards = [
      { quantity: 3, typeCode: "agenda", title: "Project Beale" },
      { quantity: 1, typeCode: "agenda", title: "NAPD Cordon" },
      { quantity: 2, typeCode: "operation", title: "Hedge Fund" },
    ];
    const groups = groupDecklistCards(
      cards,
      (c) => c.typeCode,
      (c) => c.typeCode,
    );
    expect(groups.map((g) => sectionTitle(g.heading, g.quantitySum))).toEqual([
      "agenda (4)",
      "operation (2)",
    ]);
    expect(groups[0].cards.map((c) => c.title)).toEqual([
      "Project Beale",
      "NAPD Cordon",
    ]);
  });
});
