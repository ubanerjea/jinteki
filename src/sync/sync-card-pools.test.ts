import { describe, expect, it } from "vitest";

import cardPoolActive from "./__fixtures__/card-pool-active.json";
import cardPoolNonRotation from "./__fixtures__/card-pool-non-rotation.json";
import cardPoolRotation from "./__fixtures__/card-pool-rotation.json";
import {
  buildRotationLookup,
  mapCardPool,
  type RotationJsonEntry,
} from "./sync-card-pools";
import type { CardPoolResource } from "@/lib/nrdb/types";

// A trimmed real rotations.json fixture (full 7-entry shape confirmed live
// 2026-09-04 against netrunner-cards-json's rotations.json - see
// agent-reports/nrdb-rotation-and-tournament-legal-research.md). Deliberately
// includes the 2019 -> 2021 gap (no "rotation-2020" entry at all) - the real
// source data's own non-sequential-year gap, not a fixture simplification.
const rotationsFixture: RotationJsonEntry[] = [
  { code: "rotation-2017", date_start: "2017-10-01", name: "First Rotation", rotated: ["core"] },
  { code: "rotation-2018", date_start: "2018-12-21", name: "Second Rotation", rotated: ["core"] },
  { code: "rotation-2019", date_start: "2019-12-27", name: "Third Rotation", rotated: ["core"] },
  { code: "rotation-2021", date_start: "2021-04-09", name: "Fourth Rotation", rotated: ["core"] },
  { code: "rotation-2022", date_start: "2022-08-05", name: "Fifth Rotation", rotated: ["core"] },
  { code: "rotation-2023", date_start: "2023-08-11", name: "Sixth Rotation", rotated: ["core"] },
  { code: "rotation-2025", date_start: "2025-04-24", name: "Seventh Rotation", rotated: ["core"] },
];

describe("buildRotationLookup", () => {
  it("transforms dash-separated codes into underscore card_pools ids, keyed by 1-based chronological ordinal", () => {
    const lookup = buildRotationLookup(rotationsFixture);
    expect(lookup.get("rotation_2017")).toEqual({ ordinal: 1, dateStart: "2017-10-01" });
    expect(lookup.get("rotation_2025")).toEqual({ ordinal: 7, dateStart: "2025-04-24" });
  });

  it("has no entry for rotation_2020 - the real gap between the 3rd and 4th numbered rotations", () => {
    const lookup = buildRotationLookup(rotationsFixture);
    expect(lookup.has("rotation_2020")).toBe(false);
  });
});

describe("mapCardPool", () => {
  it("maps a numbered rotation's id/name/formatId/cardCycleIds, and looks up its ordinal/date", () => {
    const lookup = buildRotationLookup(rotationsFixture);
    const result = mapCardPool(cardPoolRotation as CardPoolResource, lookup);
    expect(result.id).toBe("rotation_2017");
    expect(result.name).toBe("First Rotation");
    expect(result.formatId).toBe("standard");
    expect(result.cardCycleIds).toContain("lunar");
    expect(result.rotationOrdinal).toBe(1);
    expect(result.rotationDateStart).toEqual(new Date("2017-10-01"));
    expect(result.raw).toMatchObject({ type: "card_pools" });
  });

  // The real, confirmed-live non-sequential-name hazard the plan calls out
  // explicitly: rotation_2020 ("Salvaged Memories") looks like it could
  // naively sort/count as "the 4th rotation" by id or name pattern, but it
  // genuinely isn't one - rotations.json has no entry for it at all (jumps
  // 2019 straight to 2021). mapCardPool must NOT invent an ordinal for it.
  it("leaves rotationOrdinal/rotationDateStart null for a pool with no rotations.json match (rotation_2020 / Salvaged Memories)", () => {
    const lookup = buildRotationLookup(rotationsFixture);
    const result = mapCardPool(cardPoolNonRotation as CardPoolResource, lookup);
    expect(result.id).toBe("rotation_2020");
    expect(result.name).toBe("Salvaged Memories");
    expect(result.rotationOrdinal).toBeNull();
    expect(result.rotationDateStart).toBeNull();
  });

  it("leaves rotationOrdinal/rotationDateStart null for the currently-active pool (it isn't itself a numbered rotation)", () => {
    const lookup = buildRotationLookup(rotationsFixture);
    const result = mapCardPool(cardPoolActive as CardPoolResource, lookup);
    expect(result.id).toBe("standard_2026_vantage_point");
    expect(result.rotationOrdinal).toBeNull();
    expect(result.rotationDateStart).toBeNull();
  });

  it("is idempotent", () => {
    const lookup = buildRotationLookup(rotationsFixture);
    const first = mapCardPool(cardPoolRotation as CardPoolResource, lookup);
    const second = mapCardPool(cardPoolRotation as CardPoolResource, lookup);
    expect(first).toEqual(second);
  });

  it("with an empty rotation lookup, every pool maps to a null ordinal/date", () => {
    const result = mapCardPool(cardPoolRotation as CardPoolResource, new Map());
    expect(result.rotationOrdinal).toBeNull();
    expect(result.rotationDateStart).toBeNull();
  });
});
