import { describe, expect, it } from "vitest";

import cardSinglePrinting from "./__fixtures__/card-single-printing.json";
import cardMultiPrinting from "./__fixtures__/card-multi-printing.json";
import cardWithSubtypes from "./__fixtures__/card-with-subtypes.json";
import { mapCard } from "./sync-cards";
import type { CardResource } from "@/lib/nrdb/types";

describe("mapCard", () => {
  it("maps a single-printing card, using its sole card_set as packCode", () => {
    const result = mapCard(cardSinglePrinting as CardResource);
    expect(result.code).toBe("15_minutes");
    expect(result.title).toBe("15 Minutes");
    expect(result.typeCode).toBe("agenda");
    expect(result.factionCode).toBe("nbn");
    expect(result.sideCode).toBe("corp");
    expect(result.packCode).toBe("data_and_destiny");
    expect(result.keywords).toEqual([]);
    expect(result.raw).toBeTruthy();
  });

  it("picks the last (oldest / original release) card_set as packCode for a reprinted card", () => {
    const result = mapCard(cardMultiPrinting as CardResource);
    // card_set_ids on the fixture: [system_gateway, system_core_2019, revised_core_set, core_set]
    // core_set (the true 2012 original release) is last - that's the heuristic under test.
    expect(result.packCode).toBe("core_set");
  });

  it("maps card_subtype_ids to the keywords column", () => {
    const result = mapCard(cardWithSubtypes as CardResource);
    expect(result.keywords).toEqual(["icebreaker", "killer"]);
  });

  it("stores the full resource in raw", () => {
    const result = mapCard(cardSinglePrinting as CardResource);
    expect(result.raw).toMatchObject({ id: "15_minutes", type: "cards" });
  });

  it("handles a card with zero card_set_ids by leaving packCode null", () => {
    const noSets: CardResource = {
      ...(cardSinglePrinting as CardResource),
      attributes: {
        ...(cardSinglePrinting as CardResource).attributes,
        card_set_ids: [],
      },
    };
    const result = mapCard(noSets);
    expect(result.packCode).toBeNull();
  });

  it("is idempotent: mapping the same fixture twice yields identical upsert values", () => {
    const first = mapCard(cardMultiPrinting as CardResource);
    const second = mapCard(cardMultiPrinting as CardResource);
    expect(first).toEqual(second);
  });
});
