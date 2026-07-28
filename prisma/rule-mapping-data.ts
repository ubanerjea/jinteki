// Card type/subtype/keyword -> comprehensive-rules-section mapping.
//
// This is the "code/seed file" from PROJECT_PLAN.md's architecture decision:
// the real mapping changes rarely and is small enough to review as a plain
// diff, so it's maintained here rather than as a DB-editable admin table.
//
// Phase 3: replaces Phase 1's two placeholder rows with the real curated
// mapping, built by:
//   1. Querying the actual distinct `Card.typeCode` (11 values) and
//      `Card.keywords` (104 values) out of the live, synced `Card` table
//      (2054 rows) - not assumed from memory. See the full distinct-value
//      dumps in agent-reports/phase-3.md.
//   2. Cross-referencing every candidate against the REAL scraped
//      `RuleSection.bodyText` (119 rows, from the live
//      rules.nullsignal.games scrape) rather than guessing section numbers
//      from general Netrunner knowledge. This mattered: Phase 1's own
//      placeholder guessed Operation -> "3.3", but the real doc has
//      Operations at 3.5 and Assets at 3.3 - confirming the plan's warning
//      not to hard-code section numbers from memory.
//
// `key` intentionally uses the SAME raw lowercase/underscore strings NRDB
// uses for `Card.typeCode` and `Card.keywords` entries (e.g. "operation",
// "corp_identity", "icebreaker") rather than Phase 1's placeholder's
// human-readable capitalized labels ("Operation") - so later-phase lookup
// code (the Phase 5 right-click menu: "this card's typeCode/keywords ->
// which RuleMapping.key rows match") can join directly without a
// translation layer.
//
// A single `key` can map to more than one `ruleSectionId` (the unique
// constraint is on the pair) - used below for "condition" and "current",
// which the rules doc defines identically for both Operations AND Events.
export interface RuleMappingEntry {
  key: string;
  ruleSectionId: string;
  /** Not persisted (see prisma/seed.ts) - just documents *why* here, next to the data. */
  note?: string;
}

export const ruleMappingData: RuleMappingEntry[] = [
  // ---------------------------------------------------------------------
  // Tier 1: card types (Card.typeCode). Full coverage - all 11 distinct
  // values seen in the synced Card table map unambiguously onto one of the
  // 10 sections in chapter 3 ("Card Types"). Corp and Runner identities
  // share a single section (3.1) since the doc covers both there together.
  // ---------------------------------------------------------------------
  { key: "agenda", ruleSectionId: "3.2", note: "Card type -> chapter 3 'Card Types': 3.2 Agendas." },
  { key: "asset", ruleSectionId: "3.3", note: "3.3 Assets." },
  { key: "corp_identity", ruleSectionId: "3.1", note: "3.1 Identities (covers both Corp and Runner identities)." },
  { key: "runner_identity", ruleSectionId: "3.1", note: "3.1 Identities (covers both Corp and Runner identities)." },
  { key: "event", ruleSectionId: "3.7", note: "3.7 Events." },
  { key: "hardware", ruleSectionId: "3.8", note: "3.8 Hardware." },
  { key: "ice", ruleSectionId: "3.4", note: "3.4 Ice." },
  {
    key: "operation",
    ruleSectionId: "3.5",
    note: "3.5 Operations. NOTE: Phase 1's placeholder guessed \"3.3\" for this - the real scraped doc has Operations at 3.5 (3.3 is Assets). Confirms the plan's warning against hard-coding section numbers from memory.",
  },
  { key: "program", ruleSectionId: "3.9", note: "3.9 Programs." },
  { key: "resource", ruleSectionId: "3.10", note: "3.10 Resources." },
  { key: "upgrade", ruleSectionId: "3.6", note: "3.6 Upgrades." },

  // ---------------------------------------------------------------------
  // Tier 2: keywords/subtypes (Card.keywords). Best-effort - mapped only
  // where the scraped bodyText shows the rules doc actually defines
  // governing rules for that subtype (typically phrased "has/have the
  // subtype X ..."), not merely lists it in the master subtype glossary
  // (2.16 Subtypes, which nearly every one of the 104 distinct keywords
  // appears in and so is not a useful differentiator on its own).
  // ---------------------------------------------------------------------
  {
    key: "icebreaker",
    ruleSectionId: "3.9",
    note: "3.9 Programs (the 3.9.5 Icebreakers sub-clause is folded into this row's bodyText).",
  },
  {
    key: "console",
    ruleSectionId: "3.8",
    note: "3.8 Hardware (the 3.8.5 Consoles sub-clause is folded into this row's bodyText).",
  },
  {
    key: "region",
    ruleSectionId: "3.6",
    note: "3.6 Upgrades (the 3.6.5 Regions sub-clause is folded into this row's bodyText). Assets can also carry the region subtype (see 3.3.4), but 3.3's own text explicitly cross-references 3.6.5 as the section with the actual governing rules, so 3.6 is the single canonical target rather than double-mapping.",
  },
  {
    key: "condition",
    ruleSectionId: "3.5",
    note: "Both Operations (3.5.1a) and Events (3.7, e.g. On the Lam) define an identical 'condition' subtype - mapped to both sections rather than picking one.",
  },
  { key: "condition", ruleSectionId: "3.7", note: "See the 3.5 entry above - condition is defined identically for both card types." },
  {
    key: "current",
    ruleSectionId: "3.5",
    note: "Both Operations (3.5.1b) and Events (3.7) define an identical 'current' subtype - mapped to both sections rather than picking one.",
  },
  { key: "current", ruleSectionId: "3.7", note: "See the 3.5 entry above - current is defined identically for both card types." },
  { key: "lockdown", ruleSectionId: "3.5", note: "Defined only for Operations (3.5.1c), unlike condition/current." },
  { key: "alliance", ruleSectionId: "2.14", note: "2.14 Influence Cost - alliance cards have defined influence-cost adjustment rules there (2.14.3)." },
  { key: "connection", ruleSectionId: "1.13", note: "1.13 Host, Hosted, and Hosting - connection resources are discussed there re: hosting (e.g. Off-Campus Apartment)." },
  { key: "priority", ruleSectionId: "1.11", note: "1.11 Clicks - 'priority' cards have a defined rule (1.11.4) restricting them to a player's first click of the turn." },
  { key: "directive", ruleSectionId: "1.5", note: "1.5 Extra Cards - directive cards are defined there in the context of Adam's identity ability." },
  { key: "terminal", ruleSectionId: "5.4", note: "5.4 Action Phase - terminal operations/events force the action phase to end early, a defined mechanic there." },
  { key: "virus", ruleSectionId: "1.9", note: "1.9 Counters and Tokens - virus counters are one of the defined counter types there." },
  { key: "sabotage", ruleSectionId: "10.12", note: "10.12 Sabotage - the 'sabotage N' card-ability keyword is directly defined there." },
  { key: "link", ruleSectionId: "10.7", note: "10.7 Link - link-granting cards and the link mechanic are defined there." },
  {
    key: "psi",
    ruleSectionId: "10.14",
    note: "10.14 Bidding - the modern name/mechanic for secret-bid ('psi') abilities; the section itself no longer uses the word 'psi' but is the governing rules for cards with the psi subtype.",
  },

  // ---------------------------------------------------------------------
  // Considered and deliberately left OUT (genuinely ambiguous / no
  // standalone rule beyond the master glossary at 2.16 Subtypes) rather
  // than guessing. These were checked against the real scraped bodyText,
  // not skipped by assumption:
  //
  // - ai, caissa, killer, fracter, decoder, trojan - Program/Icebreaker
  //   flavor subtypes (what an icebreaker breaks, or where it's hosted).
  //   No dedicated rules text beyond the general Icebreaker rules (already
  //   covered by the "icebreaker" mapping above) and the glossary listing.
  // - barrier, code_gate, sentry - Ice "type" subtypes (what kind of ice).
  //   Same situation: only appear in the 2.16 glossary and as incidental
  //   examples elsewhere (e.g. 9.11's "a barrier" example), never as their
  //   own governed rule.
  // - trap, ambush, companion - Asset/Resource flavor subtypes with no
  //   rules-doc section of their own (their behavior is entirely on the
  //   printed card text, not the comprehensive rules).
  // - bioroid - only appears in incidental examples (9.5, 9.12 - e.g. "a
  //   rezzed piece of bioroid ice" used to illustrate an unrelated rule
  //   about paid abilities), never in a section that defines what the
  //   bioroid subtype itself means.
  // - stealth - only an incidental example in 9.11 ("spend credits from a
  //   stealth card"), not a defined rule; no dedicated Stealth section
  //   exists in this revision of the doc.
  // - tracer - only in the 2.16 glossary, unlike sabotage/link/psi (which
  //   each have their own named mechanic section - 10.12/10.7/10.14 - that
  //   actually defines behavior for cards using that keyword).
  //
  // The remaining ~80 keywords (academic, advertisement, ap, beanstalk,
  // black_ops, cast, character, chip, clan, clone, cloud, consumer_grade,
  // corp, corporation, cybernetic, cyborg, daemon, deep_net, deflector,
  // destroyer, deva, digital, division, double, enforcer, executive,
  // expansion, expendable, facility, gear, genetics, g_mod, government,
  // grail, gray_ops, harmonic, hostile, industrial, initiative, job,
  // liability, location, mandate, megacorp, mod, morph, mythic, natural,
  // next, observer, off_site, orgcrime, police_department, political,
  // public, remote, reprisal, research, ritzy, run, security,
  // security_protocol, sensie, source, subsidiary, sysop, transaction,
  // triple, unorthodox, unsubstantiated, vehicle, virtual, weapon) are
  // pure faction/flavor/deckbuilding subtypes with no comprehensive-rules
  // presence beyond the 2.16 glossary listing - left unmapped for the same
  // reason, without individually re-litigating each one here.
  // ---------------------------------------------------------------------
];
