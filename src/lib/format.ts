// Small display-formatting helpers shared by the /cards and /decklists UI.

// `Faction.description` is NOT a short display name - per
// src/sync/sync-factions-packs.ts, it holds a flavor-text paragraph for
// named factions (Anarch, Criminal, ...) and only falls back to the short
// name for mini-factions/neutrals. There's no separate short-name column
// (see prisma/schema.prisma's `Faction` model), so faction/type/side labels
// for filter dropdowns and card display are derived from their `code`
// instead (e.g. "haas_bioroid" -> "Haas Bioroid").
//
// The subtype entries below are not guesses. NRDB's own display name for
// every subtype is in `Card.raw.attributes.display_subtypes`; all 104
// distinct keyword codes were normalized and compared against it, and these
// seven are the complete set where the derived label disagrees with the real
// one (PHASE_7_PLAN.md item 11 - `ap` was the known case, the other six were
// found by that check). The 11 type codes have no equivalent display-name
// field anywhere in the synced data, and all 11 derive cleanly, so none are
// overridden here.
const CODE_LABEL_OVERRIDES: Record<string, string> = {
  nbn: "NBN",
  // Subtypes, per NRDB's `display_subtypes`.
  ai: "AI",
  ap: "AP",
  caissa: "Caïssa",
  consumer_grade: "Consumer-grade",
  g_mod: "G-mod",
  next: "NEXT",
  off_site: "Off-site",
};

export function formatCode(code: string): string {
  const override = CODE_LABEL_OVERRIDES[code];
  if (override) return override;
  return code
    .split("_")
    .filter((word) => word.length > 0)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}
