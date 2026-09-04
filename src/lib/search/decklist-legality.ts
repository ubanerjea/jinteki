// Pure "is this decklist rotation-legal / tournament-legal" computation
// logic, backing /decklists/advanced's Rotation and Tournament Legal filters
// (PHASE_10_PLAN.md §3). Kept separate from decklists-advanced.ts's SQL
// implementation - which achieves the same semantics via a NOT EXISTS/EXISTS
// query over DecklistCard/Card for real performance across 74k+ decklists,
// not by calling into this file - so the underlying *logic* is unit-testable
// without a DB connection, per the plan's Testing subsection. Agreement
// between the two is checked by decklists-advanced.test.ts's real-DB tests
// (independently-derived oracle queries), not by shared code - a raw-SQL
// NOT EXISTS and a JS .every() can't literally share an implementation.
//
// Deliberate deviation from PHASE_10_PLAN.md's literal wording, flagged here
// and in agent-reports/phase-10.md: the plan describes the rotation filter as
// using CardPool.cardCycleIds (matching a decklist's cards against a target
// pool's card_cycle_ids, which would require also promoting a card_cycle_id
// column onto Pack - not synced today). Confirmed live 2026-09-04
// (GET /cards/aircheck) that something better already exists: every NRDB
// card resource carries its own precomputed, authoritative `card_pool_ids`
// array (`Card.raw.attributes.card_pool_ids` - already present in every
// already-synced Card row, since Card.raw stores the full resource verbatim)
// listing every card_pool this specific card has ever been a member of. Using
// that directly is simpler (no cycle-membership inference to get subtly
// wrong), more accurate (it's NRDB's own answer, not a jinteki-side
// re-derivation), and needs no new Pack schema. CardPool.cardCycleIds is
// still synced and stored (per the plan's model shape, and useful
// informationally) but isn't read by the logic below.
//
// "Tournament legal" here is deliberately the NARROW question
// PHASE_10_PLAN.md §3 scopes it to: not-banned-under-the-active-restriction
// AND a member of the active card pool. It does NOT do deck-wide
// points-budget/universal_faction_cost/global_penalty aggregation (a card
// merely being on the current points/restricted list doesn't fail this
// check by itself) - that remains explicitly out of scope, carried over
// unchanged from Phase 8's own deferral.

export interface RotationLegalityCardLike {
  cardPoolIds: string[] | undefined;
}

export function isCardInPool(
  cardPoolIds: string[] | undefined,
  poolId: string,
): boolean {
  return (cardPoolIds ?? []).includes(poolId);
}

/**
 * A decklist is rotation-legal for a target card pool iff every card in it
 * (identity included - decklist card lists cover every slot, per Phase 4's
 * finding) has ever been a member of that pool.
 */
export function isDecklistRotationLegal(
  cards: RotationLegalityCardLike[],
  targetPoolId: string,
): boolean {
  return cards.every((card) => isCardInPool(card.cardPoolIds, targetPoolId));
}

export interface TournamentLegalityCardLike {
  cardPoolIds: string[] | undefined;
  bannedRestrictionIds: string[] | undefined;
}

/**
 * A decklist is tournament-legal for a format iff every card in it is both
 * (a) not banned under the format's *currently active* restriction, and (b) a
 * member of the format's *currently active* card pool. A null
 * activeCardPoolId/activeRestrictionId (no pool/ban-list data at all for this
 * format) makes that half of the check vacuously true, same "nothing to check
 * against" reasoning src/lib/search/format-cards.ts already uses for
 * activeRestrictionId === null.
 */
export function isDecklistTournamentLegal(
  cards: TournamentLegalityCardLike[],
  activeCardPoolId: string | null,
  activeRestrictionId: string | null,
): boolean {
  return cards.every((card) => {
    const poolOk = activeCardPoolId
      ? isCardInPool(card.cardPoolIds, activeCardPoolId)
      : true;
    const banOk = activeRestrictionId
      ? !(card.bannedRestrictionIds ?? []).includes(activeRestrictionId)
      : true;
    return poolOk && banOk;
  });
}
