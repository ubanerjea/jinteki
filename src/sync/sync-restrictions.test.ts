import { describe, expect, it } from "vitest";

import format from "./__fixtures__/format.json";
import formatNoActiveRestriction from "./__fixtures__/format-no-active-restriction.json";
import restriction from "./__fixtures__/restriction.json";
import restrictionNoDate from "./__fixtures__/restriction-no-date.json";
import { mapFormat, mapRestriction } from "./sync-restrictions";
import type { FormatResource, RestrictionResource } from "@/lib/nrdb/types";

describe("mapFormat", () => {
  it("maps a format with an active restriction", () => {
    const result = mapFormat(format as FormatResource);
    expect(result.id).toBe("standard");
    expect(result.name).toBe("Standard");
    expect(result.activeRestrictionId).toBe("standard_ban_list_26_03");
    expect(result.raw).toMatchObject({ type: "formats" });
  });

  it("maps a null active_restriction_id to null (unrestricted format)", () => {
    const result = mapFormat(formatNoActiveRestriction as FormatResource);
    expect(result.id).toBe("ram");
    expect(result.activeRestrictionId).toBeNull();
  });

  it("is idempotent", () => {
    const first = mapFormat(format as FormatResource);
    const second = mapFormat(format as FormatResource);
    expect(first).toEqual(second);
  });
});

describe("mapRestriction", () => {
  it("maps a restriction's name/format/date", () => {
    const result = mapRestriction(restriction as RestrictionResource);
    expect(result.id).toBe("standard_ban_list_26_03");
    expect(result.name).toBe("Standard Ban List 26.03");
    expect(result.formatId).toBe("standard");
    expect(result.dateStart).toEqual(new Date("2026-03-13"));
    expect(result.raw).toMatchObject({ type: "restrictions" });
  });

  it("maps a null date_start to null", () => {
    const result = mapRestriction(restrictionNoDate as RestrictionResource);
    expect(result.dateStart).toBeNull();
  });

  it("is idempotent", () => {
    const first = mapRestriction(restriction as RestrictionResource);
    const second = mapRestriction(restriction as RestrictionResource);
    expect(first).toEqual(second);
  });
});
