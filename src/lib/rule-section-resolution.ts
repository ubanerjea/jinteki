// Pure "which RuleSection(s) does this card link to" logic, kept separate
// from any DB access so it can be unit-tested with plain fixtures (per
// PHASE_5_PLAN.md's Testing section: "a good candidate for a pure,
// fixture-driven test rather than needing the full Server Action wired
// up"). The Server Action in src/app/actions/card-reference.ts is the thin
// DB-backed wrapper around this.
//
// Resolution rule (confirmed against the real synced data at build time -
// see agent-reports/phase-5.md): a card's relevant sections come from
// RuleMapping rows whose `key` matches either the card's `typeCode` or any
// of its `keywords` - both use the exact same lowercase/underscore
// vocabulary (verified: every distinct real `Card.typeCode` value appears
// verbatim as a `RuleMapping.key`), so no translation layer is needed. A
// card can match multiple RuleMapping rows (its type plus one or more
// keywords, and a single key like "condition" can itself map to more than
// one section) - dedupe by RuleSection id before returning, since a type
// and a keyword (or two different keywords) could resolve to the same
// section.

export interface RuleMappingRow {
  key: string;
  ruleSectionId: string;
}

export interface CardTypeAndKeywords {
  typeCode: string;
  keywords: string[];
}

// Returns the deduped, order-preserving (first-seen) list of RuleSection
// ids this card's type/keywords resolve to, given the full set of
// RuleMapping rows to match against.
export function resolveRuleSectionIds(
  card: CardTypeAndKeywords,
  mappings: RuleMappingRow[],
): string[] {
  const keys = new Set([card.typeCode, ...card.keywords]);
  const seen = new Set<string>();
  const ids: string[] = [];

  for (const mapping of mappings) {
    if (!keys.has(mapping.key)) continue;
    if (seen.has(mapping.ruleSectionId)) continue;
    seen.add(mapping.ruleSectionId);
    ids.push(mapping.ruleSectionId);
  }

  return ids;
}
