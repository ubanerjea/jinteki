// Pure unit tests - no DB connection needed (unlike cards.test.ts et al).

import { describe, expect, it } from "vitest";

import { allParams, firstParam } from "./types";

describe("allParams", () => {
  it("returns [] for an absent key", () => {
    expect(allParams({}, "faction")).toEqual([]);
    expect(allParams({ q: "x" }, "faction")).toEqual([]);
  });

  it("wraps a single string value in an array", () => {
    expect(allParams({ faction: "anarch" }, "faction")).toEqual(["anarch"]);
  });

  it("collects a repeated param into an array, order preserved", () => {
    expect(allParams({ type: ["event", "program"] }, "type")).toEqual([
      "event",
      "program",
    ]);
  });

  it("trims values", () => {
    expect(allParams({ faction: ["  anarch  ", "criminal"] }, "faction")).toEqual([
      "anarch",
      "criminal",
    ]);
  });

  it("drops blank and whitespace-only values", () => {
    // An untouched <select>'s empty option, or a stray `&faction=` in a
    // hand-edited URL, must not become a filter on the empty string.
    expect(allParams({ faction: "" }, "faction")).toEqual([]);
    expect(allParams({ faction: "   " }, "faction")).toEqual([]);
    expect(allParams({ faction: ["", "anarch", "  "] }, "faction")).toEqual([
      "anarch",
    ]);
  });

  it("agrees with firstParam on the first surviving value", () => {
    const input = { faction: ["anarch", "criminal"] };
    expect(allParams(input, "faction")[0]).toBe(firstParam(input, "faction"));
  });
});

// Postgres rejects 0x00 in UTF-8 text, so a crafted `?q=a%00b` used to 500
// every search page with `invalid byte sequence for encoding "UTF8": 0x00`.
// Stripped here rather than rejected - a NUL is never meaningful input.
describe("NUL stripping", () => {
  it("firstParam strips NUL bytes", () => {
    expect(firstParam({ q: "a\0b" }, "q")).toBe("ab");
    expect(firstParam({ q: ["a\0b", "c"] }, "q")).toBe("ab");
    expect(firstParam({ q: "\0" }, "q")).toBe("");
  });

  it("firstParam leaves ordinary values untouched", () => {
    expect(firstParam({ q: "sure gamble" }, "q")).toBe("sure gamble");
    expect(firstParam({}, "q")).toBeUndefined();
  });

  it("allParams strips NUL bytes from every value", () => {
    expect(allParams({ faction: ["an\0arch", "crim\0inal"] }, "faction")).toEqual(
      ["anarch", "criminal"],
    );
  });

  it("allParams drops a value that was nothing but NULs", () => {
    expect(allParams({ faction: ["\0", "anarch"] }, "faction")).toEqual([
      "anarch",
    ]);
  });
});
