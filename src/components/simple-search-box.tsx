"use client";

// Type-ahead completion for the `f:`/`t:`/`s:`/`d:` prefix syntax, for the
// **simple search box** - the single free-text `q` field on the home page,
// on /cards, and at the top of /cards/advanced.
//
// Why a separate component from facet-picker.tsx rather than a reuse of it:
// the interaction is fundamentally different. The facet picker owns a
// discrete array of chosen values and emits one hidden input per value; this
// box owns *one arbitrary string* that may contain zero or more
// `prefix:value` tokens mixed in with ordinary words. There is nothing to
// chip, nothing to tick, and no hidden inputs - the text field itself is the
// value that gets submitted. The two do share the small pieces that are
// genuinely the same: the `FacetOption` shape and the <mark>-based substring
// highlighting, both imported from facet-picker.tsx rather than copied.
//
// Why it exists at all: a prefix value must be the exact underlying code
// (`f:haas_bioroid`, never "Haas-Bioroid", never `f:HAAS_BIOROID`, never a
// partial). /cards/syntax documents that, but documentation is not a fix for
// "you have to already know the code" - this is.
//
// Progressive enhancement is trivial here, unlike the facet picker: before
// hydration (and with JS off) this renders an ordinary
// <input type="text" name="q">, which is exactly what the box has always
// been and exactly what a no-JS user needs. The dropdown layers on top once
// mounted. No fallback path of its own, and no fetching, no client-side
// routing - the surrounding plain <form method="get"> and the URL remain the
// entire source of truth, same discipline as facet-picker.tsx.

import { useEffect, useId, useMemo, useRef, useState } from "react";

import {
  HighlightedLabel,
  useHasMounted,
  type FacetOption,
} from "./facet-picker";

export interface PrefixOptionMap {
  faction: FacetOption[];
  type: FacetOption[];
  keyword: FacetOption[];
  side: FacetOption[];
}

// The same four letters extractOperators() recognizes in cards.ts, mapped to
// the option list each completes from.
const PREFIX_FIELD: Record<string, keyof PrefixOptionMap> = {
  f: "faction",
  t: "type",
  s: "keyword",
  d: "side",
};

// Deliberately looser than cards.ts's OPERATOR_TOKEN, which requires at
// least one character after the colon: here the dropdown should appear the
// instant the colon is typed, listing everything, so `\S*` not `\S+`.
const PREFIX_TOKEN = /^(f|t|s|d):(\S*)$/i;

const MAX_SUGGESTIONS = 8;

export interface PrefixToken {
  field: keyof PrefixOptionMap;
  // Offset of the first character *after* the prefix letter and colon, i.e.
  // tokenStart + 2. Everything before it is left exactly as typed.
  valueStart: number;
  // Offset of the end of the current whitespace-delimited token.
  end: number;
  // value.slice(valueStart, end) - what has been typed after the colon.
  typed: string;
}

// Locates the whitespace-delimited token the caret sits in, and reports it
// if it is a prefix token. Scans backward from the caret to the nearest
// whitespace or start-of-string, and forward to the nearest whitespace or
// end-of-string - so it finds the token the caret is *inside*, wherever that
// is in a box that may hold several tokens and ordinary words.
//
// Pure, and exported, because this offset arithmetic and the splice below
// are the whole substance of the interaction; everything around them is
// React plumbing that this repo has no jsdom to exercise.
export function findPrefixToken(
  value: string,
  caret: number,
): PrefixToken | null {
  let start = caret;
  while (start > 0 && !/\s/.test(value[start - 1])) start -= 1;
  let end = caret;
  while (end < value.length && !/\s/.test(value[end])) end += 1;

  const match = value.slice(start, end).match(PREFIX_TOKEN);
  if (!match) return null;
  return {
    field: PREFIX_FIELD[match[1].toLowerCase()],
    valueStart: start + 2,
    end,
    typed: match[2],
  };
}

// Replaces **only** value.slice(valueStart, end) - the part after the colon -
// with the code plus a trailing space, and reports where the caret should
// land (just past that space, ready to keep typing).
//
// The prefix letter and colon keep the user's own casing (`F:` is never
// rewritten to `f:`), and every character before valueStart and after end is
// untouched. A naive split(" ")/join(" ") would collapse runs of spaces
// elsewhere in the box and reorder nothing correctly; splicing by offset
// cannot.
export function spliceCompletion(
  value: string,
  token: PrefixToken,
  code: string,
): { value: string; caret: number } {
  return {
    value: value.slice(0, token.valueStart) + code + " " + value.slice(token.end),
    caret: token.valueStart + code.length + 1,
  };
}

export function SimpleSearchBox({
  name = "q",
  defaultValue = "",
  placeholder,
  ariaLabel,
  options,
  className,
  containerClassName,
  inputId,
}: {
  name?: string;
  defaultValue?: string;
  placeholder?: string;
  ariaLabel: string;
  options: PrefixOptionMap;
  // For a surrounding <label htmlFor>. `ariaLabel` is still required, since
  // two of the three uses have no visible label at all.
  inputId?: string;
  // Applied to the <input> itself, so each page keeps its own field styling.
  className?: string;
  // Applied to the positioning wrapper, which is rendered pre- and
  // post-mount alike so the surrounding flex layout never shifts on
  // hydration.
  containerClassName?: string;
}) {
  const mounted = useHasMounted();
  const [menu, setMenu] = useState<PrefixToken | null>(null);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  // The input is left **uncontrolled**. Accepting a suggestion is a splice at
  // exact character offsets followed by a caret move, which is far simpler
  // (and can't drop a caret position across a render) done directly on the
  // DOM node than round-tripped through React state. Nothing else on the page
  // reads this value except the form on submit.
  //
  // Opens the dropdown when the caret sits inside a prefix token, closes it
  // otherwise. Called from onChange (typing) *and* onSelect (the caret moving
  // with no value change - arrow keys, a click, a drag-select), because
  // either can move the caret into or out of a prefix token.
  function syncFromCaret() {
    const el = inputRef.current;
    if (!el) return;
    const token = findPrefixToken(el.value, el.selectionStart ?? el.value.length);
    setMenu(token);
    if (token) setHighlight(0);
  }

  // Matches on the code as well as the label, since the code is what the
  // user is actually typing (`haas_b` should find Haas Bioroid).
  const visible = useMemo(() => {
    if (!menu) return [];
    const list = options[menu.field];
    const typed = menu.typed.toLowerCase();
    const matches = typed
      ? list.filter(
          (o) =>
            o.label.toLowerCase().includes(typed) ||
            o.value.toLowerCase().includes(typed),
        )
      : list;
    return matches.slice(0, MAX_SUGGESTIONS);
  }, [menu, options]);

  const activeIndex =
    visible.length === 0 ? 0 : Math.min(highlight, visible.length - 1);

  function accept(option: FacetOption) {
    const el = inputRef.current;
    if (!el || !menu) return;
    const { value, caret } = spliceCompletion(el.value, menu, option.value);
    el.value = value;
    el.setSelectionRange(caret, caret);
    setMenu(null);
    el.focus();
  }

  // Click-outside-to-close, the same hand-rolled `mousedown` listener
  // facet-picker.tsx uses - no menu library.
  useEffect(() => {
    if (!menu) return;
    function handlePointerDown(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setMenu(null);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [menu]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!menu || visible.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((activeIndex + 1) % visible.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((activeIndex - 1 + visible.length) % visible.length);
    } else if (event.key === "Enter" || event.key === "Tab") {
      // Enter must never submit the surrounding form while the dropdown is
      // open - the user is completing a value, not searching yet. Tab
      // completes rather than leaving the field, the usual type-ahead
      // gesture; Escape first, then Tab, moves on as normal.
      event.preventDefault();
      accept(visible[activeIndex]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setMenu(null);
    }
  }

  const open = mounted && menu !== null && visible.length > 0;

  return (
    <div
      ref={containerRef}
      // `relative` is always applied: the dropdown below is positioned
      // against this wrapper, so it can't be left to a caller to remember.
      className={containerClassName ? `relative ${containerClassName}` : "relative"}
    >
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={className}
        // Everything below only matters once mounted; pre-mount the element
        // above is already the plain text input a no-JS client needs.
        {...(mounted
          ? {
              autoComplete: "off" as const,
              role: "combobox" as const,
              "aria-autocomplete": "list" as const,
              "aria-expanded": open,
              "aria-controls": listId,
              onChange: syncFromCaret,
              onSelect: syncFromCaret,
              onKeyDown: handleKeyDown,
            }
          : {})}
      />

      {open && (
        // Positioned under the whole input rather than at the caret -
        // per-character caret positioning would be a lot of machinery for no
        // real gain at this list size.
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded border border-zinc-300 bg-white text-left text-sm text-foreground shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        >
          {visible.map((option, index) => (
            <li key={option.value}>
              <button
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => accept(option)}
                className={`flex w-full items-center justify-between gap-2 px-2 py-1 text-left ${
                  index === activeIndex
                    ? "bg-zinc-100 dark:bg-zinc-800"
                    : "bg-transparent"
                }`}
              >
                <span>
                  <HighlightedLabel label={option.label} query={menu.typed} />
                </span>
                <code className="text-xs text-zinc-500">{option.value}</code>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
