import { describe, expect, it } from "vitest";

import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  pageOffset,
  parsePage,
  parsePageSize,
  toPagedResult,
} from "./pagination";

describe("parsePage", () => {
  it("defaults to 1 when missing", () => {
    expect(parsePage(undefined)).toBe(1);
  });

  it("parses a valid numeric string", () => {
    expect(parsePage("3")).toBe(3);
  });

  it("accepts a plain number", () => {
    expect(parsePage(5)).toBe(5);
  });

  it("floors fractional input", () => {
    expect(parsePage("2.9")).toBe(2);
  });

  it("falls back to 1 for zero", () => {
    expect(parsePage("0")).toBe(1);
  });

  it("falls back to 1 for negative input", () => {
    expect(parsePage("-5")).toBe(1);
  });

  it("falls back to 1 for non-numeric garbage (malformed/bookmarked URL)", () => {
    expect(parsePage("not-a-number")).toBe(1);
  });
});

describe("parsePageSize", () => {
  it("defaults to DEFAULT_PAGE_SIZE when missing", () => {
    expect(parsePageSize(undefined)).toBe(DEFAULT_PAGE_SIZE);
  });

  it("parses a valid numeric string", () => {
    expect(parsePageSize("10")).toBe(10);
  });

  it("clamps to MAX_PAGE_SIZE for absurdly large requests", () => {
    expect(parsePageSize("999999")).toBe(MAX_PAGE_SIZE);
  });

  it("falls back to default for zero/negative", () => {
    expect(parsePageSize("0")).toBe(DEFAULT_PAGE_SIZE);
    expect(parsePageSize("-1")).toBe(DEFAULT_PAGE_SIZE);
  });

  it("falls back to default for non-numeric garbage", () => {
    expect(parsePageSize("abc")).toBe(DEFAULT_PAGE_SIZE);
  });
});

describe("pageOffset", () => {
  it("is 0 for page 1", () => {
    expect(pageOffset(1, 30)).toBe(0);
  });

  it("computes the correct offset for later pages", () => {
    expect(pageOffset(3, 30)).toBe(60);
  });
});

describe("toPagedResult", () => {
  it("computes totalPages via ceiling division", () => {
    const result = toPagedResult(["a", "b"], 65, 1, 30);
    expect(result).toEqual({
      items: ["a", "b"],
      total: 65,
      page: 1,
      pageSize: 30,
      totalPages: 3,
    });
  });

  it("reports totalPages 1 (not 0) for an empty result set", () => {
    const result = toPagedResult([], 0, 1, 30);
    expect(result.totalPages).toBe(1);
    expect(result.items).toEqual([]);
  });

  it("computes the exact remainder on the last page", () => {
    // 65 rows at page size 30: page 3 has 5 rows.
    const result = toPagedResult(["x", "y", "z", "w", "v"], 65, 3, 30);
    expect(result.totalPages).toBe(3);
    expect(result.items).toHaveLength(5);
  });
});
