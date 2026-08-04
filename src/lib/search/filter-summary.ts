// Pure, DB-free helpers for describing the facet filters active on a URL,
// and for rewriting that URL to drop or hand them on.
//
// Used by two places (PHASE_7_PLAN.md items 6 and 8):
//
//   - /cards' read-only "filtered by" note, which explains why results are
//     narrowed now that the page no longer has the widgets to change it.
//   - /cards/advanced/results' read-only query summary, which is what lets
//     that page explain its own result count when the filters live on
//     another route.
//
// Deliberately no data access: labels come from formatCode() on the codes
// already present in the URL, so the note costs no query. Pack and format
// codes ("core_set", "system_gateway") format into readable names that way
// too, which is why neither needs its display row looked up.

import { formatCode } from "@/lib/format";

import { allParams, type SearchParamsInput } from "./types";

export interface FacetDescription {
  key: string;
  label: string;
  values: string[];
}

// Every non-`q` search param that actually filters results, in the order the
// summary reads them out. Matches the facet set buildFacetConditions()
// understands - if one is added there it must be added here, or the note
// will under-report why a result set is narrowed.
export const FACET_PARAMS: { key: string; label: string }[] = [
  { key: "faction", label: "Faction" },
  { key: "side", label: "Side" },
  { key: "type", label: "Type" },
  { key: "keyword", label: "Subtype" },
  { key: "pack", label: "Pack" },
  { key: "format", label: "Format" },
];

const FACET_KEYS = FACET_PARAMS.map((f) => f.key);

// Params that describe *presentation* rather than filtering, and so survive
// a "clear filter" - the user asked to widen the results, not to reset how
// they're displayed or where they are in them.
const PRESENTATION_KEYS = ["view", "order", "pageSize"];

export function describeFacets(input: SearchParamsInput): FacetDescription[] {
  const described: FacetDescription[] = [];
  for (const { key, label } of FACET_PARAMS) {
    const values = allParams(input, key);
    if (values.length === 0) continue;
    described.push({ key, label, values: values.map(formatCode) });
  }
  return described;
}

export function hasActiveFacets(input: SearchParamsInput): boolean {
  return describeFacets(input).length > 0;
}

// Renders a description list as "Faction Anarch, Criminal · Type Event".
//
// `labelSeparator` sits between a facet's label and its values. It exists
// because the two callers' design docs specify different punctuation:
// ADVANCED_CARD_SEARCH_PLAN.md's results summary reads "Type Event, Program
// · Faction Anarch" (no colon - it is a terse header over a result set),
// while SIMPLE_CARD_SEARCH_PLAN.md's "filtered by" note reads "Filtered by
// **Faction: Anarch**", where the colon separates the label from the value
// inside a running sentence. One helper, one parameter, both docs honoured.
export function formatFacetSummary(
  described: FacetDescription[],
  labelSeparator: string = " ",
): string {
  return described
    .map((f) => `${f.label}${labelSeparator}${f.values.join(", ")}`)
    .join(" · ");
}

// "Clear filter" on /cards: drops every facet, keeps the free-text query and
// the presentation params. `page` is deliberately dropped too - widening the
// result set invalidates whatever page number the user was on.
export function clearFacetsHref(
  basePath: string,
  input: SearchParamsInput,
): string {
  const params = new URLSearchParams();
  for (const key of ["q", ...PRESENTATION_KEYS]) {
    for (const value of allParams(input, key)) params.append(key, value);
  }
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

// "Edit in advanced search" on /cards: hands the same facets to the page
// that can actually change them. `q` is carried into the advanced form's
// Card Name box rather than dropped - the advanced form renders every value
// it receives, so the text stays visible and editable (and movable to Card
// Text) instead of silently disappearing. It does narrow: /cards' `q`
// matches title OR text, while `title` matches title only. That is the
// documented asymmetry between the two pages, shown on screen rather than
// applied invisibly.
export function editInAdvancedHref(input: SearchParamsInput): string {
  const params = new URLSearchParams();
  for (const key of [...FACET_KEYS, ...PRESENTATION_KEYS]) {
    for (const value of allParams(input, key)) params.append(key, value);
  }
  for (const value of allParams(input, "q")) params.append("title", value);
  const qs = params.toString();
  return qs ? `/cards/advanced?${qs}` : "/cards/advanced";
}
