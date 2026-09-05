// Sort comparators for /decklists/[id]'s card list (PHASE_6_PLAN.md item 7).
// Extracted into their own pure, DB-free module - like
// rule-section-resolution.ts - specifically so each is independently
// unit-testable, per the plan's own suggestion ("could add a small pure unit
// test for the comparator function if it's extracted to its own named
// function rather than an inline arrow").

export type DeckCardLike = {
  card: {
    typeCode: string;
    title: string;
    factionCode: string;
    packCode?: string | null;
  };
};

export type PackSortMeta = {
  dateRelease: Date | null;
  name: string;
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

export function compareBySet(
  packMeta: Map<string, PackSortMeta>,
): (a: DeckCardLike, b: DeckCardLike) => number {
  return (a, b) => {
    const packA = a.card.packCode ? packMeta.get(a.card.packCode) : undefined;
    const packB = b.card.packCode ? packMeta.get(b.card.packCode) : undefined;
    const dateA = packA?.dateRelease ?? null;
    const dateB = packB?.dateRelease ?? null;
    if (dateA && dateB) {
      const byDate = dateB.getTime() - dateA.getTime();
      if (byDate !== 0) return byDate;
    } else if (dateA) {
      return -1;
    } else if (dateB) {
      return 1;
    }
    const byName = (packA?.name ?? a.card.packCode ?? "").localeCompare(
      packB?.name ?? b.card.packCode ?? "",
    );
    if (byName !== 0) return byName;
    return a.card.title.localeCompare(b.card.title);
  };
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
