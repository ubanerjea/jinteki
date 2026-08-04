"use client";

// Multi-value facet picker for /cards/advanced's Type / Faction / Subtype /
// Pack rows (PHASE_7_PLAN.md item 3, ADVANCED_CARD_SEARCH_PLAN.md "The facet
// picker"). Click to open, type to narrow, click again to add another;
// chosen values sit as removable chips inside the box.
//
// This is a deliberate, contained exception to the note carried since
// Phase 4 that "URL searchParams are the entire source of truth - no client
// component, no local state":
//
//   - Its only output is a set of <input type="hidden" name={name}> elements
//     inside the surrounding plain <form method="get">. The URL stays the
//     source of truth; the picker only helps compose it. No fetching, no
//     client-side routing, no state that outlives submit.
//   - Options are passed in by the server component that already queries
//     them. The picker performs no data access of its own.
//   - Progressive enhancement, not a JS requirement: until it has mounted it
//     renders a plain <select multiple name={name}>, which is exactly what a
//     client with JS disabled receives and submits. That beats a <noscript>
//     fallback, whose values would double up with hidden inputs inside a
//     CSS-hidden container (hidden inputs still submit).
//
// Keyboard support is required, not optional: arrow keys move the highlight,
// Enter selects, Backspace on an empty input removes the last chip, Escape
// closes.

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

export interface FacetOption {
  value: string;
  label: string;
}

// "Have we hydrated yet?" without a setState-in-effect (which React's
// compiler lint rejects, and which costs an extra render pass):
// useSyncExternalStore returns the server snapshot during SSR *and* during
// hydration, then the client snapshot once hydration finishes. The store
// never actually changes, so `subscribe` is a stable no-op.
const NEVER_CHANGES = () => () => {};
const CLIENT_SNAPSHOT = () => true;
const SERVER_SNAPSHOT = () => false;

function useHasMounted(): boolean {
  return useSyncExternalStore(NEVER_CHANGES, CLIENT_SNAPSHOT, SERVER_SNAPSHOT);
}

// Highlights the typed substring inside an option's label, so it's visible
// why each remaining option is listed. Case-insensitive, first occurrence
// only (labels here are short - faction/type/subtype/pack names).
function HighlightedLabel({ label, query }: { label: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{label}</>;
  const index = label.toLowerCase().indexOf(q.toLowerCase());
  if (index === -1) return <>{label}</>;
  return (
    <>
      {label.slice(0, index)}
      <mark className="bg-yellow-200 text-inherit dark:bg-yellow-500/40">
        {label.slice(index, index + q.length)}
      </mark>
      {label.slice(index + q.length)}
    </>
  );
}

export function FacetPicker({
  name,
  label,
  options,
  selected,
  placeholder,
}: {
  name: string;
  label: string;
  options: FacetOption[];
  selected: string[];
  placeholder?: string;
}) {
  const mounted = useHasMounted();
  const [chosen, setChosen] = useState<string[]>(selected);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const labelByValue = useMemo(
    () => new Map(options.map((o) => [o.value, o.label])),
    [options],
  );

  // Already-selected options stay in the list (marked with a tick) rather
  // than disappearing, so the list doesn't reflow under the pointer.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  // The highlight is reset by whatever changes the list (typing, opening,
  // choosing) rather than by an effect watching for it. Clamped here anyway
  // so a stale index can never point past a list the filter just shortened.
  const activeIndex =
    visible.length === 0 ? 0 : Math.min(highlight, visible.length - 1);

  function openList() {
    setOpen(true);
    setHighlight(0);
  }

  // Click-outside-to-close, same hand-rolled approach as
  // src/components/card-reference.tsx's popover - no menu library.
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  function toggle(value: string) {
    setChosen((current) =>
      current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value],
    );
    setQuery("");
    setHighlight(0);
    // Stays open so several values can be picked in a row.
    inputRef.current?.focus();
  }

  function remove(value: string) {
    setChosen((current) => current.filter((v) => v !== value));
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setHighlight(
        visible.length === 0 ? 0 : (activeIndex + 1) % visible.length,
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setHighlight(
        visible.length === 0
          ? 0
          : (activeIndex - 1 + visible.length) % visible.length,
      );
    } else if (event.key === "Enter") {
      // Never let Enter submit the surrounding form while the list is open -
      // the user is choosing a value, not searching yet.
      event.preventDefault();
      if (!open) {
        openList();
        return;
      }
      const option = visible[activeIndex];
      if (option) toggle(option.value);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === "Backspace" && query === "" && chosen.length > 0) {
      event.preventDefault();
      remove(chosen[chosen.length - 1]);
    }
  }

  // Pre-mount (and with JS off): a real, fully-populated <select multiple>
  // carrying the same `name`, so the plain GET form still works.
  if (!mounted) {
    return (
      <select
        multiple
        name={name}
        aria-label={label}
        defaultValue={selected}
        size={Math.min(options.length, 6)}
        className="w-full rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      {chosen.map((value) => (
        <input key={value} type="hidden" name={name} value={value} />
      ))}

      <div
        className="flex w-full flex-wrap items-center gap-1 rounded border border-zinc-300 px-2 py-1 focus-within:ring-2 focus-within:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-900"
        onClick={() => {
          openList();
          inputRef.current?.focus();
        }}
      >
        {chosen.map((value) => (
          <span
            key={value}
            className="flex items-center gap-1 rounded bg-zinc-200 px-1.5 py-0.5 text-xs dark:bg-zinc-800"
          >
            {labelByValue.get(value) ?? value}
            <button
              type="button"
              aria-label={`Remove ${labelByValue.get(value) ?? value}`}
              onClick={(event) => {
                event.stopPropagation();
                remove(value);
              }}
              className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              &times;
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-label={label}
          autoComplete="off"
          value={query}
          placeholder={chosen.length === 0 ? placeholder : ""}
          onChange={(event) => {
            setQuery(event.target.value);
            openList();
          }}
          onFocus={openList}
          onKeyDown={handleKeyDown}
          className="min-w-24 flex-1 bg-transparent py-0.5 text-sm outline-none"
        />
      </div>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-multiselectable
          className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded border border-zinc-300 bg-white text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        >
          {visible.map((option, index) => {
            const isChosen = chosen.includes(option.value);
            return (
              <li key={option.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isChosen}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => toggle(option.value)}
                  className={`flex w-full items-center justify-between px-2 py-1 text-left ${
                    index === activeIndex
                      ? "bg-zinc-100 dark:bg-zinc-800"
                      : "bg-transparent"
                  }`}
                >
                  <span>
                    <HighlightedLabel label={option.label} query={query} />
                  </span>
                  {isChosen && <span aria-hidden="true">&#10003;</span>}
                </button>
              </li>
            );
          })}
          {visible.length === 0 && (
            <li className="px-2 py-1 text-zinc-500">No matches.</li>
          )}
        </ul>
      )}
    </div>
  );
}
