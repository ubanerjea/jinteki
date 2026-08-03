import { describe, expect, it } from "vitest";

import { plainTextFromNotes } from "./decklist-notes";

describe("plainTextFromNotes", () => {
  it("strips a single paragraph tag down to plain text", () => {
    expect(plainTextFromNotes("<p>A kill deck. Still working on it.</p>")).toBe(
      "A kill deck. Still working on it.",
    );
  });

  it("turns multiple paragraphs into blank-line-separated text", () => {
    const html = "<p>First para.</p><p>Second para.</p>";
    expect(plainTextFromNotes(html)).toBe("First para.\n\nSecond para.");
  });

  it("strips links down to their visible text, dropping the href", () => {
    const html = '<p><a href="/en/card/22009">Hot pursuit</a> is good.</p>';
    expect(plainTextFromNotes(html)).toBe("Hot pursuit is good.");
  });

  it("strips img tags entirely (no visible text/alt content kept)", () => {
    const html = '<p><img data-src="https://example.com/x.gif" alt="hot pursuit" /></p>';
    expect(plainTextFromNotes(html)).toBe("");
  });

  it("converts headings into blank-line breaks and <br> into single line breaks", () => {
    const html = "<h2>Intro</h2><p>Line one<br>Line two</p>";
    expect(plainTextFromNotes(html)).toBe("Intro\n\nLine one\nLine two");
  });

  it("decodes common HTML entities", () => {
    expect(plainTextFromNotes("<p>Noise &amp; Hemorrhage &gt; R&amp;D</p>")).toBe(
      "Noise & Hemorrhage > R&D",
    );
  });

  it("collapses 3+ blank lines down to one blank line", () => {
    const html = "<p>A</p><p></p><p></p><p>B</p>";
    expect(plainTextFromNotes(html)).toBe("A\n\nB");
  });

  it("returns an empty string for whitespace-only input", () => {
    expect(plainTextFromNotes("   \n  ")).toBe("");
  });
});
