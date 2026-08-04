// The simple search box's no-JS / pre-hydration path.
//
// Server-rendering the component is exactly what a client with JavaScript
// disabled receives, so renderToStaticMarkup() is the right lens - no jsdom,
// no testing-library, no new dependency. Same approach and same documented
// limitation as facet-picker.test.ts: the hydrated dropdown, its keyboard
// handling and the accept-a-suggestion splice need a real browser and are
// deliberately not covered here.
//
// What matters most in this file: the baseline really is an ordinary text
// input carrying the right `name` and `defaultValue`. The type-ahead is
// enhancement; if it never mounts, the box still submits the same GET form
// it always did, and the f:/t:/s:/d: syntax still works - you just have to
// type the code yourself.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  findPrefixToken,
  spliceCompletion,
  SimpleSearchBox,
  type PrefixOptionMap,
} from "./simple-search-box";

const OPTIONS: PrefixOptionMap = {
  faction: [
    { value: "anarch", label: "Anarch" },
    { value: "haas_bioroid", label: "Haas Bioroid" },
  ],
  type: [{ value: "event", label: "Event" }],
  keyword: [{ value: "virus", label: "Virus" }],
  side: [
    { value: "corp", label: "Corp" },
    { value: "runner", label: "Runner" },
  ],
};

function render(props: Partial<Parameters<typeof SimpleSearchBox>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(SimpleSearchBox, {
      ariaLabel: "Search cards",
      options: OPTIONS,
      ...props,
    }),
  );
}

describe("SimpleSearchBox pre-mount baseline", () => {
  it("renders a real text input carrying the query param name", () => {
    const html = render();
    expect(html).toContain('type="text"');
    expect(html).toContain('name="q"');
  });

  it("carries the current query as the input's value", () => {
    expect(render({ defaultValue: "f:anarch virus" })).toContain(
      'value="f:anarch virus"',
    );
  });

  it("honours an explicit param name", () => {
    expect(render({ name: "title" })).toContain('name="title"');
  });

  it("renders no dropdown, listbox or option markup before hydration", () => {
    const html = render({ defaultValue: "f:" });
    expect(html).not.toContain('role="listbox"');
    expect(html).not.toContain('role="option"');
    expect(html).not.toContain('role="combobox"');
    // The option lists must not leak into the no-JS markup either - they are
    // the type-ahead's data, not part of the form.
    expect(html).not.toContain("haas_bioroid");
  });

  it("is labelled for assistive tech and keeps its placeholder", () => {
    const html = render({ placeholder: "e.g. Sure Gamble" });
    expect(html).toContain('aria-label="Search cards"');
    expect(html).toContain('placeholder="e.g. Sure Gamble"');
  });

  it("passes an id through for a surrounding <label htmlFor>", () => {
    expect(render({ inputId: "adv-simple-q" })).toContain('id="adv-simple-q"');
  });
});

// The offset arithmetic behind the type-ahead, which is the only part of the
// hydrated behaviour that can be tested without a browser - and the part
// most worth testing, since it is what keeps the rest of the box intact.
describe("findPrefixToken", () => {
  it("finds the token the caret is inside, at the end of the string", () => {
    // "f:ana", caret at 5 (end)
    expect(findPrefixToken("f:ana", 5)).toEqual({
      field: "faction",
      valueStart: 2,
      end: 5,
      typed: "ana",
    });
  });

  it("opens on the bare colon, with nothing typed yet", () => {
    expect(findPrefixToken("f:", 2)).toEqual({
      field: "faction",
      valueStart: 2,
      end: 2,
      typed: "",
    });
  });

  it("maps each prefix letter to its option list, ignoring letter case", () => {
    expect(findPrefixToken("t:", 2)?.field).toBe("type");
    expect(findPrefixToken("s:", 2)?.field).toBe("keyword");
    expect(findPrefixToken("d:", 2)?.field).toBe("side");
    expect(findPrefixToken("F:an", 4)?.field).toBe("faction");
  });

  it("finds a token in the middle of other words", () => {
    const value = "rootkit s:vir trash";
    expect(findPrefixToken(value, 13)).toEqual({
      field: "keyword",
      valueStart: 10,
      end: 13,
      typed: "vir",
    });
  });

  it("scans forward as well as backward, so a mid-token caret still finds it", () => {
    // Caret sits between "s:v" and "irus"; the token still runs to offset 15.
    expect(findPrefixToken("rootkit s:virus", 11)).toEqual({
      field: "keyword",
      valueStart: 10,
      end: 15,
      typed: "virus",
    });
  });

  it("returns null for ordinary words and unrecognised prefixes", () => {
    expect(findPrefixToken("bioroid", 7)).toBeNull();
    expect(findPrefixToken("x:foo", 5)).toBeNull();
    expect(findPrefixToken("", 0)).toBeNull();
    // Colon required - a lone letter is not a trigger.
    expect(findPrefixToken("f", 1)).toBeNull();
  });

  it("returns null when the caret has moved off the token", () => {
    // Caret parked on "virus", not on "f:anarch".
    expect(findPrefixToken("f:anarch virus", 14)).toBeNull();
  });
});

describe("spliceCompletion", () => {
  it("replaces only the part after the colon, and adds a trailing space", () => {
    const token = findPrefixToken("f:ana", 5)!;
    expect(spliceCompletion("f:ana", token, "anarch")).toEqual({
      value: "f:anarch ",
      caret: 9,
    });
  });

  it("preserves the user's casing of the prefix letter", () => {
    const token = findPrefixToken("F:ana", 5)!;
    expect(spliceCompletion("F:ana", token, "anarch").value).toBe("F:anarch ");
  });

  it("leaves everything before and after the token untouched", () => {
    // The trailing space is always inserted, so completing a token that
    // already had a space after it leaves two. Deliberate: the caret lands
    // between them, ready for the next word, and the alternative - looking
    // ahead and conditionally omitting it - would make the caret position
    // depend on what follows. Trailing/doubled whitespace is irrelevant to
    // the parser (extractOperators splits on /\s+/).
    const value = "rootkit s:vir trash";
    const token = findPrefixToken(value, 13)!;
    expect(spliceCompletion(value, token, "virus")).toEqual({
      value: "rootkit s:virus  trash",
      caret: 16,
    });
    // Everything on either side of the token survives verbatim.
    expect(spliceCompletion(value, token, "virus").value.startsWith("rootkit ")).toBe(
      true,
    );
    expect(spliceCompletion(value, token, "virus").value.endsWith(" trash")).toBe(
      true,
    );
  });

  it("does not collapse runs of spaces elsewhere in the box", () => {
    // The whole reason this is a splice by offset and not a split/join.
    const value = "a  b   f:ana  c   d";
    const token = findPrefixToken(value, 12)!;
    expect(spliceCompletion(value, token, "anarch").value).toBe(
      "a  b   f:anarch   c   d",
    );
  });

  it("puts the caret just past the inserted space", () => {
    const token = findPrefixToken("f:", 2)!;
    const { value, caret } = spliceCompletion("f:", token, "nbn");
    expect(value).toBe("f:nbn ");
    expect(caret).toBe(6);
    expect(value.slice(0, caret)).toBe("f:nbn ");
  });
});
