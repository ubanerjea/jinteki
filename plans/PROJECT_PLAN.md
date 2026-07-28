# jinteki — Project Plan

Shared understanding reached before initial build. This document captures the decisions made and the reasoning behind them, so future work (by you or an assistant) can pick up without re-litigating settled questions.

## Purpose

A web app to capture, search, and view Android: Netrunner card data (FFG core set onward, including all Null Signal Games (NSG) releases up to the most recent), NRDB decklists, official card rulings, and a browsable comprehensive-rules glossary.

## Data

- **Cards & decklists**: sourced from the [NetrunnerDB (NRDB) API](https://api.netrunnerdb.com/api/docs), synced into your own Postgres database (not queried live). NRDB unifies FFG-era and NSG-era card data in one place and is the only source with a decklist API.
  - Decklist scope: sync *everything* NRDB has — no pre-filtering by quality/popularity. Filtering/ranking can be applied at the query layer later if noise becomes a problem.
- **Card images**: hotlinked directly from NRDB's own CDN, `https://card-images.netrunnerdb.com/v2/{size}/{printing_id}.jpg` (sizes: tiny/small/medium/large). No local caching of images. NRDB runs a public, documented API server explicitly built to power third-party apps, which is strong evidence hotlinking is the intended usage pattern (no formal written ToS was found either way).
- **Per-card official rulings**: sourced from NRDB's rulings endpoint (`nsg_rules_team_verified` Q&A/errata records keyed by `card_id`). Synced the same way as cards.
- **Comprehensive rules glossary**: sourced from NSG's [Comprehensive Rules](https://rules.nullsignal.games/) — a single long HTML document, hierarchically numbered (e.g. 1.16.2a), anchor-addressable, with no API and no separate glossary section.
  - Stored at **section level** (e.g. "3.3 Operations") as one text block per section — sub-clauses are embedded in their parent section's block rather than split into their own rows. This captures 100% of the text with a much simpler parser/schema than full-depth storage.
  - **Card ↔ rule-section linkage** is coarse: mapped by card **type/subtype/keyword** (e.g. Operation → §3.3), not per individual card. Maintained as a **code/seed file** in the repo (not a DB-editable admin table) — this mapping changes rarely (only when NSG adds a new type/keyword) and is small enough to review as a plain diff.
- **Sync mechanism** (applies to cards/decklists, rulings, and the rules doc alike): **manual only** — a CLI script and an in-app UI button (admin-only), no scheduled/cron sync. New releases and rules updates are infrequent enough that on-demand syncing is sufficient.

## Stack

- **TypeScript + Next.js** — single codebase for UI, API routes, and sync scripts.
- **Prisma** as ORM — schema-as-code, generated migrations, typed relational queries (cards ↔ decklists, cards ↔ rulings, cards ↔ rule sections), plus Prisma Studio for inspecting synced data.
- **Postgres**, run locally via **Docker Compose** — reproducible, disposable during schema iteration.
- **Search**: Postgres native full-text/fuzzy search (`pg_trgm` + GIN indexes) across cards, decklists, and the rules glossary. No dedicated search engine (Meilisearch/Typesense) — the search space is well-bounded and doesn't need relevance-tuning infrastructure.
- **pnpm** as package manager.
- **Vitest** for testing (sync/mapping logic and search queries are the parts most likely to silently break).
- **ESLint + Prettier** (as bundled by `create-next-app`).

## Users & Auth

- **Multi-user** from the start, via **Auth.js (NextAuth)** with the Prisma adapter — no password flows to build/maintain.
  - OAuth provider: **GitHub only** (single provider, simplest OAuth app setup).
- Accounts unlock:
  - **Favorites/collections** on cards and decklists.
  - **Roles**: an admin role (you) that can trigger syncs and moderate; regular users can browse and favorite.
- **Explicitly out of scope for now**: user-created decklists / a full deckbuilder feature — that's a separate, larger phase.

## Deployment

- **Local-only** for now (Docker Compose Postgres, localhost Next.js). No hosting, no production OAuth app registration, no hosted Postgres yet. Revisit once the core loop (browse/search cards & decklists, rulings, rules glossary, favorites) is solid.

## Phase verification standards

Every phase plan (`plans/PHASE_N_PLAN.md`) should include, at minimum, the following checks in its own "Verification" section — run for real with captured output, not asserted from code inspection alone. These were distilled from real gaps caught (and in one case, missed and later caught) during Phase 1 and Phase 2:

- **Static correctness**: typecheck (`tsc --noEmit`) and lint clean.
- **Dev-mode boot**: `pnpm dev` actually starts, and a real HTTP request (e.g. `curl`) against at least the homepage returns the expected response — confirms the app serves requests, not just that it compiles.
- **Production artifact actually works**: `next build` followed by `next start`, with a real HTTP request against the running production server. `next build` succeeding only proves the code compiles — it does **not** prove the built artifact correctly serves requests at runtime, since `next dev` and `next start` are different code paths (dev-mode bundling and error handling vs. the real production build). Both must be checked; neither substitutes for the other. (This was originally missed in Phase 2's verification and had to be added in a follow-up pass — don't repeat that gap.)
- **Schema changes verified by direct introspection**: if a phase adds/changes the Prisma schema, confirm the actual resulting database state directly (`psql \dt`/`\d`/`\di`, etc.) rather than trusting Prisma's own migration-success message — schema-diffing tools can silently propose dropping things they don't understand (e.g. raw-SQL indexes not expressed in `schema.prisma`, like the `pg_trgm` GIN indexes).
- **Data-writing logic verified by actual row counts, not self-reported counts**: if a phase syncs or otherwise writes data, check real row counts/spot-check real rows via the database directly. Do not trust a script's own "N records synced" log line as proof the data actually landed correctly — Phase 2's decklist sync reported a correct-looking count while silently only persisting ~64% of the rows, due to unstable pagination order; only a direct `psql` count caught it.
- **Auth-gated routes actually reject unauthorized access**: for any new protected route, confirm with a real unauthenticated/unauthorized HTTP request that it's actually rejected, not just that the gating code exists.
- **Tests pass**: `pnpm test` for whatever the phase added.

Every phase also produces a task report per `AGENTS.md`'s convention — these verification results are what that report's "Verification" section should be built from.

## UI behavior (rules support)

Right-clicking a card surfaces:
1. Its official NRDB rulings (per-card Q&A/errata).
2. The linked comprehensive-rules section(s) for its type/subtype/keywords (e.g. right-click an Operation → its rulings + "3.3 Operations").

The rules glossary is also independently browsable/searchable, similar to the card browser.
