import { describe, expect, it } from "vitest";

import {
  addDecklistSlot,
  removeDecklistSlot,
  setDecklistSlotQuantity,
  type DecklistSlotRow,
} from "./decklist-edit-slots";

const sure: DecklistSlotRow = {
  cardCode: "sure_gamble",
  quantity: 3,
  card: {
    title: "Sure Gamble",
    typeCode: "event",
    factionCode: "neutral_runner",
    sideCode: "runner",
    packCode: "core_set",
    raw: {},
  },
};

const diesel: DecklistSlotRow = {
  cardCode: "diesel",
  quantity: 2,
  card: {
    title: "Diesel",
    typeCode: "event",
    factionCode: "neutral_runner",
    sideCode: "runner",
    packCode: "core_set",
    raw: {},
  },
};

describe("addDecklistSlot", () => {
  it("appends a new card", () => {
    const result = addDecklistSlot([sure], diesel);
    expect(result).toHaveLength(2);
    expect(result[1]).toEqual(diesel);
    expect(result[0]).toEqual(sure);
  });

  it("bumps quantity when the card is already in the list", () => {
    const result = addDecklistSlot([sure], { ...sure, quantity: 1 });
    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(4);
  });
});

describe("removeDecklistSlot", () => {
  it("drops the matching card and leaves others", () => {
    expect(removeDecklistSlot([sure, diesel], "sure_gamble")).toEqual([diesel]);
  });
});

describe("setDecklistSlotQuantity", () => {
  it("updates one row's quantity", () => {
    const result = setDecklistSlotQuantity([sure, diesel], "diesel", 5);
    expect(result[1].quantity).toBe(5);
    expect(result[0].quantity).toBe(3);
  });

  it("clamps quantity to at least 1", () => {
    expect(setDecklistSlotQuantity([sure], "sure_gamble", 0)[0].quantity).toBe(
      1,
    );
  });
});
