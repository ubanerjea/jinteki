import { describe, expect, it } from "vitest";

import { ruleMappingData } from "../../prisma/rule-mapping-data";

import { resolveRuleSectionIds } from "./rule-section-resolution";

describe("resolveRuleSectionIds", () => {
  const fixtureMappings = [
    { key: "operation", ruleSectionId: "3.5" },
    { key: "condition", ruleSectionId: "3.5" },
    { key: "condition", ruleSectionId: "3.7" },
    { key: "current", ruleSectionId: "3.5" },
    { key: "current", ruleSectionId: "3.7" },
    { key: "virus", ruleSectionId: "1.9" },
    { key: "ice", ruleSectionId: "3.4" },
  ];

  it("matches on typeCode alone", () => {
    const result = resolveRuleSectionIds(
      { typeCode: "operation", keywords: [] },
      fixtureMappings,
    );
    expect(result).toEqual(["3.5"]);
  });

  it("matches on a keyword alone", () => {
    const result = resolveRuleSectionIds(
      { typeCode: "program", keywords: ["virus"] },
      fixtureMappings,
    );
    expect(result).toEqual(["1.9"]);
  });

  it("combines type + multiple keywords, deduping shared sections", () => {
    // An Operation with both the condition and current subtypes: type ->
    // 3.5, condition -> {3.5, 3.7}, current -> {3.5, 3.7}. 3.5 appears three
    // times across those matches but must only appear once in the result.
    const result = resolveRuleSectionIds(
      { typeCode: "operation", keywords: ["condition", "current"] },
      fixtureMappings,
    );
    expect(result).toEqual(["3.5", "3.7"]);
    expect(new Set(result).size).toBe(result.length);
  });

  it("returns an empty array when nothing matches", () => {
    const result = resolveRuleSectionIds(
      { typeCode: "asset", keywords: ["trap", "ambush"] },
      fixtureMappings,
    );
    expect(result).toEqual([]);
  });

  it("ignores mappings whose key matches neither typeCode nor any keyword", () => {
    const result = resolveRuleSectionIds(
      { typeCode: "ice", keywords: ["barrier"] },
      fixtureMappings,
    );
    expect(result).toEqual(["3.4"]);
  });

  describe("against the real curated mapping data (prisma/rule-mapping-data.ts)", () => {
    it("an Operation card resolves to section 3.5, per Phase 3's curated mapping", () => {
      const result = resolveRuleSectionIds(
        { typeCode: "operation", keywords: [] },
        ruleMappingData,
      );
      expect(result).toContain("3.5");
    });

    it("a virus program resolves to both 3.9 (Programs) and 1.9 (Counters and Tokens)", () => {
      const result = resolveRuleSectionIds(
        { typeCode: "program", keywords: ["virus"] },
        ruleMappingData,
      );
      expect(result).toEqual(expect.arrayContaining(["3.9", "1.9"]));
    });

    it("an unmapped flavor keyword contributes nothing beyond the type match", () => {
      const result = resolveRuleSectionIds(
        { typeCode: "ice", keywords: ["bioroid", "barrier"] },
        ruleMappingData,
      );
      expect(result).toEqual(["3.4"]);
    });
  });
});
