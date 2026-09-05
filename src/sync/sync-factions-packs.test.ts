import { describe, expect, it } from "vitest";

import faction from "./__fixtures__/faction.json";
import factionMinifaction from "./__fixtures__/faction-minifaction-empty-description.json";
import factionNullDescription from "./__fixtures__/faction-null-description.json";
import cardSet from "./__fixtures__/card-set.json";
import cardSetParhelion from "./__fixtures__/card-set-parhelion.json";
import cardSetNullDate from "./__fixtures__/card-set-null-date.json";
import cycleBorealis from "./__fixtures__/cycle-borealis.json";
import cycleVantagePoint from "./__fixtures__/cycle-vantage-point.json";
import { mapCycle, mapFaction, mapPack } from "./sync-factions-packs";
import type {
  CardSetResource,
  CycleResource,
  FactionResource,
} from "@/lib/nrdb/types";

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

describe("mapCycle", () => {
  it("maps Borealis, a multi-set cycle", () => {
    const result = mapCycle(cycleBorealis as CycleResource);
    expect(result.id).toBe("borealis");
    expect(result.name).toBe("Borealis");
    expect(result.dateRelease).toEqual(new Date("2022-07-22"));
    expect(result.position).toBe(32);
    expect(result.raw).toEqual(cycleBorealis);
  });

  it("maps Vantage Point, a single-set cycle", () => {
    const result = mapCycle(cycleVantagePoint as CycleResource);
    expect(result.id).toBe("vantage_point");
    expect(result.name).toBe("Vantage Point");
    expect(result.dateRelease).toEqual(new Date("2026-03-02"));
    expect(result.position).toBe(35);
  });

  it("is idempotent", () => {
    const first = mapCycle(cycleBorealis as CycleResource);
    const second = mapCycle(cycleBorealis as CycleResource);
    expect(first).toEqual(second);
  });
});

describe("mapPack", () => {
  it("maps a card_set to a Pack row", () => {
    const result = mapPack(cardSet as CardSetResource);
    expect(result.code).toBe("double_time");
    expect(result.name).toBe("Double Time");
    expect(result.dateRelease).toEqual(new Date("2014-03-28"));
    expect(result.size).toBe(20);
    expect(result.cardCycleId).toBe("spin");
    expect(result.cardSetTypeId).toBe("data_pack");
    expect(result.position).toBeNull();
    expect(result.raw).toEqual(cardSet);
  });

  it("maps Parhelion with cycle position and size", () => {
    const result = mapPack(cardSetParhelion as CardSetResource);
    expect(result).toMatchObject({
      code: "parhelion",
      name: "Parhelion",
      size: 63,
      cardCycleId: "borealis",
      cardSetTypeId: "data_pack",
      position: 3,
    });
    expect(result.dateRelease).toEqual(new Date("2022-12-09"));
  });

  it("keeps a null date_release (draft / unreleased)", () => {
    const result = mapPack(cardSetNullDate as CardSetResource);
    expect(result.code).toBe("unreleased_draft");
    expect(result.dateRelease).toBeNull();
    expect(result.size).toBeNull();
  });

  it("is idempotent", () => {
    const first = mapPack(cardSet as CardSetResource);
    const second = mapPack(cardSet as CardSetResource);
    expect(first).toEqual(second);
  });
});
