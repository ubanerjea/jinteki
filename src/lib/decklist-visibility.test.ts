import { describe, expect, it } from "vitest";

import { canViewDecklist } from "./decklist-visibility";

describe("canViewDecklist", () => {
  const owner = "user-owner";

  it("public lists are viewable by anyone", () => {
    expect(canViewDecklist({ isPublic: true, ownerId: null }, null)).toBe(true);
    expect(canViewDecklist({ isPublic: true, ownerId: owner }, null)).toBe(true);
    expect(canViewDecklist({ isPublic: true, ownerId: owner }, "other")).toBe(
      true,
    );
  });

  it("private lists are viewable by the matching owner", () => {
    expect(canViewDecklist({ isPublic: false, ownerId: owner }, owner)).toBe(
      true,
    );
  });

  it("private lists are hidden from other and unsigned users", () => {
    expect(canViewDecklist({ isPublic: false, ownerId: owner }, "other")).toBe(
      false,
    );
    expect(canViewDecklist({ isPublic: false, ownerId: owner }, null)).toBe(
      false,
    );
    expect(canViewDecklist({ isPublic: false, ownerId: owner }, undefined)).toBe(
      false,
    );
  });
});
