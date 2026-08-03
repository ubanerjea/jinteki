# jinteki — Formats Section Fixes Plan

## Context

An **open-ended, running list of fixes** to the `/formats`/`/formats/[id]` area and
related format-legality display, deliberately **not** given a phase number
(`plans/PHASE_N_PLAN.md`) — unlike a phase plan, this doc isn't a fixed, closed batch of
work; new fixes get appended as new sections over time as they're identified, the same
way `PROJECT_PLAN.md`'s phase list itself is "open-ended, not a fixed roadmap." Read
`agent-reports/format-descriptions-links-and-search-plan.md` and its companion
`-build.md` first — they're the baseline this doc builds on (`Format.description`,
`/formats`, `/formats/[id]`, format links from the card detail page, the `/cards`
format filter). `agent-reports/phase-6.md` is the baseline before that (`Format`/
`Restriction` schema + sync).

Each fix below follows the same shape: **Problem → Root cause → Fix → Verification**,
so a build agent can take one section at a time without needing the others done first
(unless a later fix explicitly says it depends on an earlier one).

---

## Fix 1: Restriction history mixes unrelated legacy entries and doesn't distinguish scheduled/future snapshots from past ones

### Problem

Reported by the repo owner browsing `/formats/standard`: `Standard Ban List 26.03`
(dated 2026-03-13) is shown as "active," despite three later-dated entries also
appearing in the same restriction history — and some entries carry a confusing
"(ignore active date)" suffix with no explanation.

### Background — confirmed this session (live DB + real source research, not guesswork)

**Live DB state** (`docker compose exec postgres psql`, re-synced same day, not stale —
`SyncRun` shows a successful `RESTRICTIONS` run at 2026-08-03 07:35, still producing
this same result):

```
Format.standard.activeRestrictionId = "standard_ban_list_26_03"
```

...even though `Format.standard.raw.attributes.restriction_ids` already lists two later
real Standard entries — `standard_ban_list_26_05` (2026-05-01) and
`standard_balance_update_26_08` (2026-08-01) — plus **six** `Restriction` rows whose
`id` looks like `startup_balance_update_26_05_for_classic_only` and whose `name` is
literally `"Startup Balance Update 26.05 (ignore active date)"`, but whose `format_id`
attribute is `"standard"` (not `"startup"`), so they show up mixed into Standard's
history too.

**A dedicated research subagent this session** (findings not yet written to their own
`agent-reports/` file — captured here since this plan is the first place they're acted
on) traced this to NRDB's actual source-of-truth data repo,
`github.com/Null-Signal-Games/netrunner-cards-json`, which the public API is generated
from:

1. **`active_restriction_id` is a hand-set editorial flag, not date-derived.** Each
   format is modeled as a chronological array of *snapshots*
   (`{card_pool_id, restriction_id, date_start}`); exactly one snapshot carries an
   explicit `active: true`, set by Null Signal Games maintainers when they choose to
   flip it — **not** automatically computed from the max `date_start`. Per NSG's own
   blog post, `standard_balance_update_26_08` explicitly "becomes active on August
   1st" — i.e. `standard_ban_list_26_05`/`standard_balance_update_26_08` are real,
   staged/scheduled future snapshots, not yet flipped active as of the last sync.
   **jinteki's `Format.activeRestrictionId` (`src/sync/sync-restrictions.ts`'s
   `mapFormat()`) already mirrors this flag correctly — this is not a sync bug or a
   jinteki active-detection bug.**
2. **"(ignore active date)" is a real, documented NRDB signal**, found verbatim as UI
   label text in NRDB's own `nrdbv2` frontend source
   (`Null-Signal-Games/nrdbv2`, `src/routes/decklists/search/+page.svelte`), and the
   six flagged restriction ids are explicitly excluded from NRDB's own
   format-snapshot validation test (`netrunner-cards-json/test/validate_v2.test.ts`,
   comment: "Put any startup banlists for NRDB Classic in here"). These six entries are
   **free-floating legacy bookkeeping, never wired into any format's live snapshot
   timeline** — the suffix is NRDB itself telling API consumers not to infer
   active/current status from their `date_start`.
3. **"classic" = "NRDB Classic"**, NSG's name for the legacy netrunnerdb.com site
   (distinct from the `nrdbv2` rewrite) — not a real "Startup Classic" game format (no
   such format appears in NSG's public Supported Formats list). Tagging these six
   entries `format_id: "standard"` looks like a data-bucketing convenience to populate
   one legacy dropdown on the old site, not a real sub-format relationship.

**Net conclusion**: nothing to fix in *how* jinteki determines "active" — that logic is
already correct. The actual problem is purely a **display** one: `/formats/[id]`'s
restriction-history list (`src/app/formats/[id]/page.tsx`) renders every `Restriction`
row matching `formatId` with no distinction between (a) real past history, (b) the
active entry, (c) real future/staged entries not yet active, and (d) unrelated legacy
"NRDB Classic" entries that shouldn't be in a Standard-history view at all.

### Fix

All changes are query/render logic only — **no schema change** (the `Restriction` model
already has everything needed: `id`, `name`, `formatId`, `dateStart`, `raw`).

- **`src/lib/restrictions.ts`**: add a new pure, unit-tested function alongside
  `computeCardLegality`/`summarizeLegality`:
  ```ts
  export type RestrictionHistoryStatus = "active" | "scheduled" | "past";

  export interface RestrictionLike {
    id: string;
    name: string;
    dateStart: Date | null;
  }

  export interface RestrictionHistoryEntry {
    restriction: RestrictionLike;
    status: RestrictionHistoryStatus;
  }

  export function classifyRestrictionHistory(
    format: FormatLike,
    restrictions: RestrictionLike[],
  ): RestrictionHistoryEntry[]
  ```
  - **Excludes legacy entries**: filter out any restriction whose `name` ends with
    `"(ignore active date)"` before classifying anything else — this is the literal,
    real NRDB signal confirmed above, not a jinteki-invented heuristic. (If this ever
    proves too fragile — e.g. NRDB rewords the suffix — the fallback is an explicit id
    denylist of the known `..._for_classic_only` ids, but the name-suffix match is
    preferred since it's NRDB's own semantic marker and needs no jinteki-side
    maintenance as new legacy entries are added upstream.)
  - **Classifies by comparing each restriction's `dateStart` against the *active*
    restriction's `dateStart`** (found by matching `restriction.id ===
    format.activeRestrictionId`), **not** against wall-clock "today" — confirmed
    necessary above, since NSG flips the active flag manually and may lag real time
    (26.05's `date_start` is already in the past relative to today's date, but it's
    still not active). Later than the active entry's `dateStart` → `"scheduled"`;
    matches `format.activeRestrictionId` → `"active"`; everything else → `"past"`.
  - Preserves the existing newest-first ordering (`dateStart` descending) so the page
    component doesn't need to resort.
- **`src/app/formats/[id]/page.tsx`**: replace the current inline
  `restriction.id === format.activeRestrictionId` check (the sole existing use of
  `restrictions`, around the `<ul>` rendering the history) with
  `classifyRestrictionHistory(format, restrictions)`. Render:
  - `"active"` → unchanged existing bold + "active" badge.
  - `"scheduled"` → a distinct badge (e.g. "scheduled") so a future/staged snapshot
    reads clearly as "not yet in effect," not as already-superseded history.
  - `"past"` → unchanged plain rendering (today's default, non-bold, no badge).
  - Legacy entries are simply absent from the list (already filtered out by
    `classifyRestrictionHistory`) — no separate "N legacy entries hidden" note for v1;
    add one later only if a real user asks where they went, per this project's general
    preference for not building for hypothetical needs.
- **`src/lib/restrictions.test.ts`** (or a new co-located test file if that one is
  judged to be getting crowded — build agent's judgment): unit tests, no DB needed
  (pure function over plain fixture data):
  - A restriction named `"... (ignore active date)"` is excluded from the result
    entirely, regardless of its `dateStart`.
  - A restriction later-dated than the active one is `"scheduled"`, not `"past"`.
  - The restriction matching `format.activeRestrictionId` is `"active"`.
  - A restriction earlier-dated than the active one is `"past"`.
  - Ordering is preserved (newest-first) across all three statuses mixed together.
  - A format with `activeRestrictionId: null` (e.g. `ram`/`system_gateway`) — every
    restriction (if any exist at all, which today they don't for those two) should
    classify as `"past"` or `"scheduled"` relative to... there is no active entry to
    compare against; decide and test the explicit behavior (recommendation: if there's
    no active id at all, nothing can be "scheduled" relative to it — treat everything
    as `"past"` — but confirm this doesn't matter in practice today since `ram`/
    `system_gateway` have zero `Restriction` rows regardless).

### Verification

- **Real curl + direct `psql` cross-check against `/formats/standard`** (this session's
  exact finding, re-confirmed post-fix):
  - The 6 `..._for_classic_only` / "(ignore active date)" rows (verify current exact
    set via `SELECT id FROM "Restriction" WHERE name LIKE '%(ignore active date)%';`)
    must **not** appear anywhere in the rendered history.
  - `standard_ban_list_26_05` and `standard_balance_update_26_08` must render with the
    new "scheduled" badge, not plain and not "active."
  - `standard_ban_list_26_03` must still render "active" — unchanged.
  - Every remaining real Standard Ban List/MWL entry older than 26.03 must still
    render plain (unchanged from today).
- **Repeat against at least one other format** with an active pointer partway through
  real history — `eternal` (`activeRestrictionId = eternal_points_list_26_03`, 8 total
  restrictions per `agent-reports/format-descriptions-links-and-search-build.md`'s own
  cross-check) is a good second case, confirming the fix isn't Standard-specific
  hardcoding.
- **`ram`/`system_gateway`** (no `activeRestrictionId`, no restrictions at all) must
  still render "No ban/points list has ever applied to this format" unchanged.
- Standard project verification standards (`plans/PROJECT_PLAN.md`): typecheck/lint
  clean, `pnpm test` green including the new `classifyRestrictionHistory` cases,
  dev-mode `curl` + a **separate** production `build`+`start`+`curl` re-check. No
  schema/migration involved in this fix, so no `psql \d` introspection step is needed
  — this is pure application logic.

---

## Fix 2+: reserved for future entries

Append future fixes to this document as new `## Fix N: ...` sections, same
Problem → Root cause → Fix → Verification shape. This doc stays open-ended by design —
do not close it out or rename it to a phase number without an explicit instruction to
do so.
