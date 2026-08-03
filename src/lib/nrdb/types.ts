// Types for NetrunnerDB's v3 public API (JSON:API format).
//
// Base URL confirmed live against https://api.netrunnerdb.com/api/docs at
// build time: https://api.netrunnerdb.com/api/v3/public. (The docs page
// itself renders example requests against `api-preview.netrunnerdb.com`,
// which returned 503s when hit directly during this build - the production
// host `api.netrunnerdb.com` is what's actually documented and live.)
//
// These are intentionally loose - only the fields the sync mappers actually
// read are typed strictly; everything else falls through `[key: string]:
// unknown` since the full API object is preserved verbatim in `Card.raw` /
// `Decklist.raw` for later phases to mine.

export interface JsonApiResource<TType extends string, TAttributes> {
  id: string;
  type: TType;
  attributes: TAttributes;
  relationships?: Record<string, unknown>;
  links?: Record<string, unknown>;
}

export interface JsonApiListResponse<TResource> {
  data: TResource[];
  links?: {
    self?: string;
    first?: string;
    last?: string;
    next?: string;
    prev?: string;
  };
  meta?: {
    stats?: {
      total?: {
        count?: number;
      };
    };
  };
}

export interface JsonApiSingleResponse<TResource> {
  data: TResource;
  meta?: Record<string, unknown>;
}

// --- factions ---------------------------------------------------------

export interface FactionAttributes {
  name: string;
  description: string | null;
  is_mini: boolean;
  side_id: string;
  updated_at: string;
  [key: string]: unknown;
}

export type FactionResource = JsonApiResource<"factions", FactionAttributes>;

// --- card_sets (= "packs" in our schema) -------------------------------

export interface CardSetAttributes {
  name: string;
  date_release: string | null;
  size: number | null;
  card_cycle_id: string;
  card_set_type_id: string;
  updated_at: string;
  [key: string]: unknown;
}

export type CardSetResource = JsonApiResource<"card_sets", CardSetAttributes>;

// --- cards ---------------------------------------------------------------
// NRDB v3 "cards" are the abstracted card (one row per unique card across
// all its printings/reprints) - not one row per printing. `card_set_ids` /
// `card_cycle_ids` list every set the card was ever printed in.

// Restriction verdicts (see RestrictionAttributes below) as embedded on a
// *card*: same shape, but keyed by restriction id rather than card code -
// e.g. `restrictions.banned` lists every restriction id (past or present)
// that has ever banned this card, `restrictions.points[restrictionId]` gives
// the points cost under that specific (possibly historical) restriction.
// Confirmed live (2026-07-30) against GET /cards/sifr and
// /cards/salvaged_vanadis_armory - see agent-reports/phase-6.md's item 9
// spike for the full investigation.
export interface CardRestrictionsAttribute {
  banned: string[];
  restricted: string[];
  points: Record<string, number>;
  universal_faction_cost: Record<string, number>;
  global_penalty: string[];
}

export interface CardAttributes {
  title: string;
  card_type_id: string;
  side_id: string;
  faction_id: string;
  text: string | null;
  card_subtype_ids: string[];
  card_set_ids: string[];
  num_printings: number;
  printing_ids: string[];
  updated_at: string;
  // Formats this card is (or was) a member of, e.g. ["standard", "eternal"].
  format_ids?: string[];
  // Historical banned/restricted/points status across every restriction ever
  // published, keyed by restriction id - cross-referenced against
  // `Format.activeRestrictionId` (src/lib/restrictions.ts) to determine
  // *current* legality per format, per item 9's build.
  restrictions?: CardRestrictionsAttribute;
  [key: string]: unknown;
}

export type CardResource = JsonApiResource<"cards", CardAttributes>;

// --- decklists -------------------------------------------------------

export interface DecklistAttributes {
  user_id: string | null;
  identity_card_id: string;
  name: string;
  side_id: string;
  faction_id: string;
  card_slots: Record<string, number>;
  created_at: string;
  updated_at: string;
  // Confirmed live (2026-07-30, psql spike against real synced rows) - the
  // author's free-text notes/description field is keyed `notes`, NOT
  // `description` as PHASE_6_PLAN.md's item 4 guessed it might be named.
  // Contains arbitrary user-authored HTML (`<p>`, `<a href>`, `<img>`,
  // `<h2>`, ...) - a materially wider vocabulary than card `text`'s fixed
  // strong/em/ul/li tag set (src/lib/card-text.tsx), so it is NOT rendered
  // via `renderCardText()` - see src/lib/decklist-notes.ts.
  notes: string | null;
  [key: string]: unknown;
}

export type DecklistResource = JsonApiResource<"decklists", DecklistAttributes>;

// --- formats -----------------------------------------------------------
// Confirmed live (2026-07-30) against GET /formats. Only 6 rows total
// (standard/startup/eternal/snapshot/ram/system_gateway) - small enough to
// always do a full resync, same as factions/packs.

export interface FormatAttributes {
  name: string;
  active_restriction_id: string | null;
  active_card_pool_id: string | null;
  restriction_ids: string[];
  snapshot_ids: string[];
  updated_at: string;
  [key: string]: unknown;
}

export type FormatResource = JsonApiResource<"formats", FormatAttributes>;

// --- restrictions (Most Wanted List / ban-list snapshots) --------------
// Confirmed live (2026-07-30) against GET /restrictions - a real, current
// resource (56 rows total), not the plan's originally-guessed shape: verdicts
// are grouped under a single `verdicts` object keyed by card code, not one
// flat per-(restriction,card) row - see prisma/schema.prisma's Restriction
// model comment and agent-reports/phase-6.md.

export interface RestrictionVerdicts {
  banned: string[];
  restricted: string[];
  points: Record<string, number>;
  universal_faction_cost: Record<string, number>;
  global_penalty: string[];
}

export interface RestrictionAttributes {
  name: string;
  format_id: string;
  date_start: string | null;
  point_limit: number | null;
  verdicts: RestrictionVerdicts;
  banned_subtypes: string[];
  size: number;
  updated_at: string;
  [key: string]: unknown;
}

export type RestrictionResource = JsonApiResource<"restrictions", RestrictionAttributes>;

// --- rulings -----------------------------------------------------------

export interface RulingAttributes {
  card_id: string;
  nsg_rules_team_verified: boolean;
  question: string | null;
  answer: string | null;
  text_ruling: string | null;
  updated_at: string;
  [key: string]: unknown;
}

export type RulingResource = JsonApiResource<"rulings", RulingAttributes>;
