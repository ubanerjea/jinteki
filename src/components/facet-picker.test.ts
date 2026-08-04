// The picker's no-JS path (PHASE_7_PLAN.md item 3 / its Testing section).
//
// Server-rendering the component is exactly what a client with JavaScript
// disabled receives, so renderToStaticMarkup() is the right lens here - no
// jsdom, no testing-library, no new dependency. The chip UI only exists
// after hydration and is deliberately not covered: it needs a real browser,
// same documented limitation as src/components/card-reference.tsx.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FacetPicker } from "./facet-picker";

const OPTIONS = [
  { value: "event", label: "Event" },
  { value: "program", label: "Program" },
  { value: "ice", label: "Ice" },
];

function render(selected: string[] = []): string {
  return renderToStaticMarkup(
    createElement(FacetPicker, {
      name: "type",
      label: "Type",
      options: OPTIONS,
      selected,
      placeholder: "Any type",
    }),
  );
}

describe("FacetPicker pre-mount fallback", () => {
  it("renders a real <select multiple> carrying the param name", () => {
    const html = render();
    expect(html).toContain("<select");
    expect(html).toContain("multiple");
    expect(html).toContain('name="type"');
  });

  it("renders every option, with its value and label", () => {
    const html = render();
    for (const option of OPTIONS) {
      expect(html).toContain(`value="${option.value}"`);
      expect(html).toContain(`>${option.label}</option>`);
    }
  });

  it("marks the currently-selected values as selected", () => {
    const html = render(["event", "ice"]);
    expect(html).toMatch(/<option[^>]*value="event"[^>]*selected/);
    expect(html).toMatch(/<option[^>]*value="ice"[^>]*selected/);
    expect(html).not.toMatch(/<option[^>]*value="program"[^>]*selected/);
  });

  it("renders no chip UI and no hidden inputs before hydration", () => {
    // Hidden inputs alongside the <select> would double up every value on
    // submit - the reason this is a swap, not a CSS-hidden fallback.
    const html = render(["event"]);
    expect(html).not.toContain('type="hidden"');
    expect(html).not.toContain('role="combobox"');
  });

  it("is labelled for assistive tech even without a wrapping <label>", () => {
    expect(render()).toContain('aria-label="Type"');
  });
});
