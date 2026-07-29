// Small display-formatting helpers shared by the /cards and /decklists UI.

// `Faction.description` is NOT a short display name - per
// src/sync/sync-factions-packs.ts, it holds a flavor-text paragraph for
// named factions (Anarch, Criminal, ...) and only falls back to the short
// name for mini-factions/neutrals. There's no separate short-name column
// (see prisma/schema.prisma's `Faction` model), so faction/type/side labels
// for filter dropdowns and card display are derived from their `code`
// instead (e.g. "haas_bioroid" -> "Haas Bioroid").
const CODE_LABEL_OVERRIDES: Record<string, string> = {
  nbn: "NBN",
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
