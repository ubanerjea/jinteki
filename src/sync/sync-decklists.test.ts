import { describe, expect, it } from "vitest";

import decklist from "./__fixtures__/decklist.json";
import decklistEmptySlots from "./__fixtures__/decklist-empty-slots.json";
import { mapDecklist, mapDecklistCards } from "./sync-decklists";
import type { DecklistResource } from "@/lib/nrdb/types";

describe("mapDecklist", () => {
  it("maps a decklist's identity/name/id", () => {
    const result = mapDecklist(decklist as DecklistResource);
    expect(result.id).toBe("91383315-750e-49e5-91a6-6e280bf02fc0");
    expect(result.name).toBe("Reduce, Reuse, Recycle");
    expect(result.identityCode).toBe("hoshiko_shiro_untold_protagonist");
    expect(result.raw).toMatchObject({ type: "decklists" });
  });

  it("is idempotent", () => {
    const first = mapDecklist(decklist as DecklistResource);
    const second = mapDecklist(decklist as DecklistResource);
    expect(first).toEqual(second);
  });
});

describe("mapDecklistCards", () => {
  it("expands card_slots into one row per card, including the identity card if present in slots", () => {
    const result = mapDecklistCards(decklist as DecklistResource);
    expect(result).toEqual(
      expect.arrayContaining([
        {
          decklistId: "91383315-750e-49e5-91a6-6e280bf02fc0",
          cardCode: "archives_interface",
          quantity: 2,
        },
        {
          decklistId: "91383315-750e-49e5-91a6-6e280bf02fc0",
          cardCode: "sure_gamble",
          quantity: 3,
        },
        {
          decklistId: "91383315-750e-49e5-91a6-6e280bf02fc0",
          cardCode: "hoshiko_shiro_untold_protagonist",
          quantity: 1,
        },
      ]),
    );
    expect(result).toHaveLength(5);
  });

  it("returns an empty array for a decklist with no card_slots", () => {
    const result = mapDecklistCards(decklistEmptySlots as DecklistResource);
    expect(result).toEqual([]);
  });

  it("is idempotent", () => {
    const first = mapDecklistCards(decklist as DecklistResource);
    const second = mapDecklistCards(decklist as DecklistResource);
    expect(first).toEqual(second);
  });
});
