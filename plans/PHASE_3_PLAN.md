# jinteki — Phase 3 Build Plan: Rules Glossary

## Context

Phases 1 and 2 built the foundation and the NRDB data sync (cards, factions, packs, decklists, rulings) — the database now has real card data but `RuleSection` is still empty and `RuleMapping` still holds Phase 1's two placeholder rows (`Operation → "3.3"`, `Agenda → "3.2"`). Phase 3 builds the second data source described in `PROJECT_PLAN.md`: NSG's Comprehensive Rules (`rules.nullsignal.games`), scraped into `RuleSection` rows, plus the real curated `RuleMapping` data linking card types/subtypes/keywords to those sections.

This is a genuinely different problem from Phase 2: HTML scraping of a single long, hierarchically-numbered document instead of a JSON API. It's also the phase that activates a deferred piece of schema: Phase 1's plan deliberately left `RuleMapping.ruleSectionId` without a database-level foreign key, specifically because `RuleSection` was empty at the time — this phase adds that constraint now that it won't be.

## Scope

1. A rules-doc scraper that fetches `rules.nullsignal.games` and parses it into section-level `RuleSection` rows (per the architecture decision: one row per numbered section like "3.3 Operations," sub-clauses folded into that row's text, not split out further).
2. Activating the `RuleMapping.ruleSectionId` → `RuleSection.id` foreign key constraint, deferred since Phase 1.
3. Replacing Phase 1's two placeholder `RuleMapping` rows with a real, curated mapping — driven by the actual distinct card types/subtypes/keywords now sitting in the `Card` table from Phase 2's sync.
4. Wiring this into the existing sync/admin infrastructure from Phase 2 (a `pnpm sync:rules` script, a `SyncRun` type, an admin trigger route/row) rather than building a parallel mechanism.
5. Vitest tests for the HTML-parsing logic, using a recorded fixture (a saved snippet of the real page), consistent with how Phase 2 tested its mappers.

No browsing/search UI, no right-click integration — those remain Phase 4/5, per the roadmap `PHASE_2_PLAN.md` already laid out.

## Things to confirm/verify at build time (not hard-coded from memory)

- **The live page's actual DOM structure.** Earlier research (during the original architecture interview) found the page uses hierarchical numbering (e.g. `1.16.2a`) with named anchors (e.g. `#rule_credit_pool`, `#sec_operations`) and a linked table of contents, but the exact heading levels/tags/classes that mark where one numbered *section* (e.g. "3.3") ends and the next begins were never inspected in detail. Fetch the live page and inspect its real HTML before writing the parser — don't assume a specific tag structure.
- **Where section-level boundaries actually fall.** The architecture decision is to store one row per numbered section (e.g. "3.3 Operations"), with that section's sub-clauses (3.3.1, 3.3.2a, etc.) folded into its text rather than split into their own rows. Confirm which heading level in the real page corresponds to "numbered section" versus "sub-clause" before parsing — this determines the parser's actual stopping condition for each section's text block.
- **Whether the document exposes any version/revision identifier** (the original research found references to dated versions like "v22.12," "v26.03"). If the live page displays its current version somewhere, capture it — useful context for knowing whether a re-scrape actually changed anything, even though the sync itself doesn't need to gate on it (a full re-scrape + upsert is fine to run anytime, per the architecture's "manual sync" decision).

## Schema change: activate the deferred FK

Add a migration that adds the real foreign key from `RuleMapping.ruleSectionId` to `RuleSection.id` (Phase 1's schema left this off deliberately since `RuleSection` was empty; PHASE_1_PLAN.md called this out as a follow-up for "the phase that builds the scraper"). This migration should run *after* `RuleSection` is populated by the scraper — attempting it first would fail or require the mapping data to not exist yet. Sequence within this phase: scrape → populate `RuleSection` → verify existing/new `RuleMapping` rows all resolve to a real `RuleSection.id` → add the FK constraint → confirm via direct `psql` introspection that the constraint exists (per `PROJECT_PLAN.md`'s verification standards).

## Scraper — `src/sync/sync-rules.ts` (or `src/lib/rules-scraper/` + a thin sync wrapper, whichever fits the actual parsing complexity better once you've seen the real page)

- HTML parsing via `cheerio` (the assumption flagged back in `PHASE_1_PLAN.md`).
- Fetch the live page, walk its structure, and produce `{ id, title, anchor, bodyText }` rows per numbered section.
- Idempotent upsert on `RuleSection.id` (the section number, e.g. `"3.3"`) — a full re-scrape overwrites existing rows' text if NSG has revised the wording, consistent with "manual, full resync is fine" from the architecture doc.
- Wrapped in a `SyncRun` (new `SyncType` value, e.g. `RULES`), exposed as `pnpm sync:rules`, added to `sync-all.ts`'s chain, and added as a fifth row on the `/admin/sync` page / a fifth case in the `POST /api/admin/sync/[type]` route — extending Phase 2's existing infrastructure rather than duplicating it.
- Sequential fetching is less of a concern here than it was for NRDB's paginated API (it's one page, not thousands), but still be a reasonable citizen — no need to re-fetch the page multiple times in a single sync run.

## Curated `RuleMapping` data — `prisma/rule-mapping-data.ts`

Replace the two placeholder entries with a real mapping, in two tiers of confidence:

1. **Card types** (Agenda, Asset, Event, Hardware, ICE, Identity, Operation, Program, Resource, Upgrade — query the actual distinct `Card.typeCode` values from the synced data rather than assuming this list is complete or correctly spelled) map close to 1:1 onto specific numbered sections in the doc's card-types chapter. These should be unambiguous once the real section titles are known from the scrape — do all of them.
2. **Keywords/subtypes** (query distinct values out of `Card.keywords` — there will be dozens, e.g. Icebreaker, Trojan, Console, Killer, Fracter, Decoder, AI, Caissa, Trap, Ambush, etc.): map the ones that clearly correspond to a specific rules section by title/content match. Not every keyword will have a dedicated rules section (some are closer to flavor/deck-building subtypes with no standalone rule) — for those, leave them unmapped rather than forcing a guess.

Since this genuinely requires judgment (matching a keyword to "the" correct section isn't always mechanical), the plan explicitly does **not** expect a perfect, exhaustive mapping from this phase — do the confident tier-1/tier-2 mappings, and leave anything genuinely ambiguous out of `rule-mapping-data.ts` with a comment noting it was considered and skipped (rather than silently guessing). This is exactly why the architecture decision made this a plain, reviewable seed file instead of a black-box process — the repo owner can extend/correct it afterward as a normal diff.

## Testing

- Vitest tests for the HTML-parsing function, using a small recorded fixture: save a real snippet of `rules.nullsignal.games`'s HTML (a few sections' worth, not the whole document) under `src/sync/__fixtures__/`, and test that it parses into the expected `RuleSection` shape — no live network calls in tests, consistent with Phase 2's approach.

## Verification

Follow `PROJECT_PLAN.md`'s "Phase verification standards" section in full (typecheck/lint, dev-mode boot + curl, production `build`+`start` + curl, schema changes checked by direct introspection, data-writing logic checked by real row counts not self-reported counts, auth-gated routes checked with a real unauthorized request, tests passing). Phase-specific additions:

- `pnpm sync:rules` run for real against the live page; resulting `RuleSection` row count checked via `psql` and spot-checked against the doc's actual table of contents (does the count look like a plausible number of numbered sections, not suspiciously low/high from a parsing bug).
- After the FK migration, confirm via `psql` that the constraint actually exists and that it wasn't silently dropped (Phase 2 hit exactly this problem with `pg_trgm` indexes during a `migrate diff`-based migration — check for it again here).
- Spot-check a handful of `RuleMapping` rows by eye against the actual scraped `RuleSection.bodyText` (e.g. does `Operation → "3.3"` actually point at a section that's really about Operations) — this is a real logic/curation check, not just a schema check.

## Explicitly deferred to later phases (not built now)

- All card/decklist/rules-glossary browsing and search UI.
- The right-click rulings/rules context menu.
- Favorites UI, admin UI polish.

## Roadmap beyond Phase 3 (for visibility only — not detailed/decided yet)

- **Phase 4**: card/decklist browsing + Postgres search UI.
- **Phase 5**: rulings/rules-glossary integration (right-click menu), favorites, admin UI polish.
