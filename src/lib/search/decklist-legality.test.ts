import { describe, expect, it } from "vitest";

import {
  isCardInPool,
  isDecklistRotationLegal,
  isDecklistTournamentLegal,
} from "./decklist-legality";

describe("isCardInPool", () => {
  it("true when the pool id is in the card's card_pool_ids", () => {
    expect(isCardInPool(["eternal", "rotation_2025"], "rotation_2025")).toBe(true);
  });

  it("false when it isn't", () => {
    expect(isCardInPool(["eternal", "rotation_2017"], "rotation_2025")).toBe(false);
  });

  it("false (not a throw) when cardPoolIds is undefined", () => {
    expect(isCardInPool(undefined, "rotation_2025")).toBe(false);
  });
});

describe("isDecklistRotationLegal", () => {
  it("true when every card has ever been a member of the target pool", () => {
    const cards = [
      { cardPoolIds: ["pre_rotation", "rotation_2017", "rotation_2025"] },
      { cardPoolIds: ["rotation_2025", "eternal"] },
    ];
    expect(isDecklistRotationLegal(cards, "rotation_2025")).toBe(true);
  });

  it("false when even one card has never been a member of the target pool", () => {
    const cards = [
      { cardPoolIds: ["pre_rotation", "rotation_2017"] }, // rotated out before rotation_2025
      { cardPoolIds: ["rotation_2025", "eternal"] },
    ];
    expect(isDecklistRotationLegal(cards, "rotation_2025")).toBe(false);
  });

  it("a card with no card_pool_ids at all fails (real-data reason to fail closed, not throw)", () => {
    const cards = [{ cardPoolIds: undefined }];
    expect(isDecklistRotationLegal(cards, "rotation_2025")).toBe(false);
  });

  it("an empty decklist is vacuously rotation-legal for any pool", () => {
    expect(isDecklistRotationLegal([], "rotation_2025")).toBe(true);
  });
});

describe("isDecklistTournamentLegal", () => {
  const legalCard = {
    cardPoolIds: ["eternal", "standard_2026_vantage_point"],
    bannedRestrictionIds: [],
  };

  it("true when every card is pool-member and not banned under the active restriction", () => {
    const cards = [legalCard, { ...legalCard, bannedRestrictionIds: ["standard_ban_list_20_06"] }];
    expect(
      isDecklistTournamentLegal(cards, "standard_2026_vantage_point", "standard_ban_list_26_03"),
    ).toBe(true);
  });

  it("false when a card is banned under the currently active restriction", () => {
    const bannedNow = {
      cardPoolIds: ["eternal", "standard_2026_vantage_point"],
      bannedRestrictionIds: ["standard_ban_list_26_03"],
    };
    expect(
      isDecklistTournamentLegal([legalCard, bannedNow], "standard_2026_vantage_point", "standard_ban_list_26_03"),
    ).toBe(false);
  });

  it("banned under an old (no-longer-active) restriction id does NOT count as currently banned", () => {
    const oldBan = {
      cardPoolIds: ["eternal", "standard_2026_vantage_point"],
      bannedRestrictionIds: ["standard_ban_list_20_06"],
    };
    expect(
      isDecklistTournamentLegal([oldBan], "standard_2026_vantage_point", "standard_ban_list_26_03"),
    ).toBe(true);
  });

  it("false when a card isn't a member of the currently active card pool (rotated out)", () => {
    const rotatedOut = {
      cardPoolIds: ["pre_rotation", "rotation_2017"],
      bannedRestrictionIds: [],
    };
    expect(
      isDecklistTournamentLegal([rotatedOut], "standard_2026_vantage_point", "standard_ban_list_26_03"),
    ).toBe(false);
  });

  it("null activeRestrictionId skips the ban check (e.g. ram/system_gateway)", () => {
    const bannedElsewhereOnly = {
      cardPoolIds: ["ram_7"],
      bannedRestrictionIds: ["standard_ban_list_26_03"],
    };
    expect(isDecklistTournamentLegal([bannedElsewhereOnly], "ram_7", null)).toBe(true);
  });

  it("null activeCardPoolId skips the pool check", () => {
    const card = { cardPoolIds: [], bannedRestrictionIds: [] };
    expect(isDecklistTournamentLegal([card], null, "standard_ban_list_26_03")).toBe(true);
  });

  it("both null -> vacuously legal (nothing to check against)", () => {
    const card = { cardPoolIds: [], bannedRestrictionIds: ["anything"] };
    expect(isDecklistTournamentLegal([card], null, null)).toBe(true);
  });

  it("an empty decklist is vacuously tournament-legal", () => {
    expect(isDecklistTournamentLegal([], "standard_2026_vantage_point", "standard_ban_list_26_03")).toBe(true);
  });
});
