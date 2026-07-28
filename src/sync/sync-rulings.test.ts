import { describe, expect, it } from "vitest";

import ruling from "./__fixtures__/ruling.json";
import rulingVerified from "./__fixtures__/ruling-nsg-verified.json";
import { mapRuling } from "./sync-rulings";
import type { RulingResource } from "@/lib/nrdb/types";

describe("mapRuling", () => {
  it("maps a question/answer style ruling and converts the string NRDB id to a number", () => {
    const result = mapRuling(ruling as RulingResource);
    expect(result.nrdbId).toBe(62907);
    expect(result.cardCode).toBe("419_amoral_scammer");
    expect(result.question).toContain("After the Corp installs");
    expect(result.answer).toContain("A. The Runner chooses");
    expect(result.textRuling).toBeNull();
    expect(result.nsgRulesTeamVerified).toBe(false);
  });

  it("maps a text_ruling style, NSG-verified ruling", () => {
    const result = mapRuling(rulingVerified as RulingResource);
    expect(result.nrdbId).toBe(70001);
    expect(result.question).toBeNull();
    expect(result.answer).toBeNull();
    expect(result.textRuling).toContain("Hoshiko's ability");
    expect(result.nsgRulesTeamVerified).toBe(true);
  });

  it("is idempotent: mapping the same fixture twice yields identical upsert values (same nrdbId upsert key)", () => {
    const first = mapRuling(ruling as RulingResource);
    const second = mapRuling(ruling as RulingResource);
    expect(first).toEqual(second);
  });
});
