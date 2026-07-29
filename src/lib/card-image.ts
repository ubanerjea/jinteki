// Card image hotlink resolution for /cards/[code].
//
// PHASE_4_PLAN.md explicitly asked not to assume `printing_ids`/
// `card_set_ids`'s shape from memory and to inspect real synced `Card.raw`
// rows first. Doing that (see agent-reports/phase-4.md) found something
// better than the "guess a printing id, build the URL" heuristic the plan
// anticipated: NRDB v3's `cards` resource already ships a ready-made URL per
// image size at `attributes.latest_printing_images.nrdb_classic`, and it was
// present (all 5 sizes, non-null) on all 2054 currently-synced cards. That
// field is used directly - no need to pick an entry out of `printing_ids`
// ourselves. (For the record: `printing_ids[0]` matches `latest_printing_id`
// - newest printing first - and `card_set_ids`'s *last* entry is the
// original release pack, which is what sync-cards.ts's `packCode` heuristic
// already relies on.)

export type CardImageSize = "tiny" | "small" | "medium" | "large" | "xlarge";

interface RawCardShape {
  attributes?: {
    latest_printing_id?: string;
    latest_printing_images?: {
      nrdb_classic?: Partial<Record<CardImageSize, string>>;
    };
  };
}

// Defensive fallback only (not the primary path, and not currently
// exercised by any of the 2054 synced cards): if a future sync ever
// encounters a card missing the nested `nrdb_classic` object, reconstruct
// the URL from `latest_printing_id` using NRDB's documented hotlink format
// (PROJECT_PLAN.md: `https://card-images.netrunnerdb.com/v2/{size}/{printing_id}.jpg`,
// except NRDB's own `xlarge` entries are `.webp`).
export function getCardImageUrl(
  raw: unknown,
  size: CardImageSize = "large",
): string | null {
  const attributes = (raw as RawCardShape | null | undefined)?.attributes;

  const fromApi = attributes?.latest_printing_images?.nrdb_classic?.[size];
  if (typeof fromApi === "string" && fromApi.length > 0) {
    return fromApi;
  }

  const printingId = attributes?.latest_printing_id;
  if (typeof printingId === "string" && printingId.length > 0) {
    const extension = size === "xlarge" ? "webp" : "jpg";
    return `https://card-images.netrunnerdb.com/v2/${size}/${printingId}.${extension}`;
  }

  return null;
}
