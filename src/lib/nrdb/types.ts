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
  [key: string]: unknown;
}

export type DecklistResource = JsonApiResource<"decklists", DecklistAttributes>;

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
