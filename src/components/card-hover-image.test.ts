import { describe, expect, it } from "vitest";

import { computeHoverPosition } from "./card-hover-image";

const SIZE = { width: 300, height: 419 };

describe("computeHoverPosition", () => {
  it("places the image to the right when there is room", () => {
    const pos = computeHoverPosition(
      { top: 100, right: 200, bottom: 120, left: 80 },
      { width: 1000, height: 800 },
      SIZE,
      8,
    );
    expect(pos.left).toBe(208);
    expect(pos.top).toBe(100);
  });

  it("flips to the left when the right side would overflow", () => {
    const pos = computeHoverPosition(
      { top: 100, right: 900, bottom: 120, left: 800 },
      { width: 1000, height: 800 },
      SIZE,
      8,
    );
    expect(pos.left).toBe(800 - 8 - 300);
    expect(pos.top).toBe(100);
  });

  it("clamps vertically near the bottom of the viewport", () => {
    const pos = computeHoverPosition(
      { top: 700, right: 200, bottom: 720, left: 80 },
      { width: 1000, height: 800 },
      SIZE,
      8,
    );
    expect(pos.top).toBe(800 - 419);
    expect(pos.top + SIZE.height).toBeLessThanOrEqual(800);
  });

  it("does not go negative near the top of the viewport", () => {
    const pos = computeHoverPosition(
      { top: 4, right: 200, bottom: 24, left: 80 },
      { width: 1000, height: 800 },
      SIZE,
      8,
    );
    expect(pos.top).toBeGreaterThanOrEqual(0);
    expect(pos.top).toBe(4);
  });
});
