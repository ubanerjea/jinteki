// Sort comparators for /decklists/[id]'s card list (PHASE_6_PLAN.md item 7).
// Extracted into their own pure, DB-free module - like
// rule-section-resolution.ts - specifically so each is independently
// unit-testable, per the plan's own suggestion ("could add a small pure unit
// test for the comparator function if it's extracted to its own named
// function rather than an inline arrow").

export type DeckCardLike = {
  card: { typeCode: string; title: string; factionCode: string };
};

// Original/default behavior (unchanged from before item 7): group by type,
// then alphabetically by title within a type.
export function compareByType(a: DeckCardLike, b: DeckCardLike): number {
  if (a.card.typeCode !== b.card.typeCode) {
    return a.card.typeCode.localeCompare(b.card.typeCode);
  }
  return a.card.title.localeCompare(b.card.title);
}

export function compareByFaction(a: DeckCardLike, b: DeckCardLike): number {
  if (a.card.factionCode !== b.card.factionCode) {
    return a.card.factionCode.localeCompare(b.card.factionCode);
  }
  return a.card.title.localeCompare(b.card.title);
}

export function compareByName(a: DeckCardLike, b: DeckCardLike): number {
  return a.card.title.localeCompare(b.card.title);
}

// Keyed by the `order` URL param's value - matching /cards' `order` param
// exactly, per item 7/8's naming-consistency principle. Anything absent or
// unrecognized should fall back to `compareByType` at the call site
// (additive, not breaking).
export const ORDER_COMPARATORS: Record<
  string,
  (a: DeckCardLike, b: DeckCardLike) => number
> = {
  type: compareByType,
  faction: compareByFaction,
  name: compareByName,
};
