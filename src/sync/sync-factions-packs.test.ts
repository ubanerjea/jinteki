import { describe, expect, it } from "vitest";

import faction from "./__fixtures__/faction.json";
import factionMinifaction from "./__fixtures__/faction-minifaction-empty-description.json";
import factionNullDescription from "./__fixtures__/faction-null-description.json";
import cardSet from "./__fixtures__/card-set.json";
import { mapFaction, mapPack } from "./sync-factions-packs";
import type { CardSetResource, FactionResource } from "@/lib/nrdb/types";

describe("mapFaction", () => {
  it("maps a faction with a flavor-text description", () => {
    const result = mapFaction(faction as FactionResource);
    expect(result).toEqual({
      code: "anarch",
      description:
        "It doesn't have to be this way.\nAfter centuries of corporate control...",
    });
  });

  it("falls back to name when description is an empty string (mini-factions)", () => {
    const result = mapFaction(factionMinifaction as FactionResource);
    expect(result).toEqual({ code: "adam", description: "Adam" });
  });

  it("falls back to name when description is null (neutrals)", () => {
    const result = mapFaction(factionNullDescription as FactionResource);
    expect(result).toEqual({ code: "neutral_corp", description: "Neutral" });
  });

  it("is idempotent: mapping the same fixture twice yields identical upsert values", () => {
    const first = mapFaction(faction as FactionResource);
    const second = mapFaction(faction as FactionResource);
    expect(first).toEqual(second);
  });
});

describe("mapPack", () => {
  it("maps a card_set to a Pack row", () => {
    const result = mapPack(cardSet as CardSetResource);
    expect(result).toEqual({ code: "double_time", name: "Double Time" });
  });

  it("is idempotent", () => {
    const first = mapPack(cardSet as CardSetResource);
    const second = mapPack(cardSet as CardSetResource);
    expect(first).toEqual(second);
  });
});
