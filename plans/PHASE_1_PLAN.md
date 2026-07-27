# jinteki — Phase 1 Build Plan: Foundation

## Context

`PROJECT_PLAN.md` (already in this repo) captures the full architecture reached through a detailed requirements interview: TypeScript + Next.js, Prisma/Postgres, Auth.js (GitHub OAuth) with roles, NRDB-sourced cards/decklists/rulings, and a scraped comprehensive-rules glossary linked to cards by type/keyword.

The repo is currently empty except `README.md` and `PROJECT_PLAN.md` — there's no existing code to build on, and the architecture is already decided from that interview, so this plan skips straight to translating those decisions into a concrete first build step rather than re-deriving anything.

The full scope (sync scripts, the rules-doc scraper, and the browsing/search UI) is too much for one pass. This plan scopes **Phase 1** to the foundation: a running Next.js app, Postgres via Docker, the complete Prisma schema for every entity in the plan doc (so later phases don't require painful migrations), and working GitHub sign-in with role support. Later phases (NRDB sync, rules scraper, UI, tests) are listed at the end but not built yet — each will be proposed and approved separately.

## Assumptions to confirm during review

A few implementation-level details weren't covered in the architecture interview (they're below the threshold of what that interview was for) — flagging them here rather than re-opening the whole interview:
- **Styling**: Tailwind CSS (bundled default with `create-next-app`, no separate decision needed).
- **Auth.js version**: v5 (`next-auth@beta`), since it's the version built for the App Router, which is what we're using.
- **HTML parsing for the later rules scraper**: `cheerio` — not built this phase, just noting the dependency will show up later.

## Scaffold & Infra

1. `pnpm create next-app@latest .` into the existing repo — TypeScript, ESLint, Tailwind, App Router, `src/` directory.
2. `docker-compose.yml` at repo root: single `postgres:16` service, named volume, port 5432, credentials via `.env` (`POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB`), matching `DATABASE_URL` in `.env.example`.
3. Add `.env` to `.gitignore` (if the Next.js scaffold doesn't already), commit `.env.example`.

## Prisma Schema (`prisma/schema.prisma`)

One migration covering every entity from the plan doc, so the schema doesn't need reshaping once sync/UI work starts:

- `Card` — NRDB `code` as primary key, structured columns for the fields we'll filter/search on (`title`, `typeCode`, `factionCode`, `sideCode`, `text`, `keywords String[]`), plus a `raw Json` column holding the full NRDB card object for everything else. Avoids hand-modeling NRDB's entire field set up front.
- `Faction` — minimal dimension table: `code` (primary key, e.g. `"haas-bioroid"`) and `description`. `Card.factionCode` references it. Populated by the card sync (a later phase) from NRDB's faction data, not hand-seeded.
- `Pack` — NRDB pack/cycle code + name, `Card.packCode` references it. Kept minimal (no separate `Cycle` table yet).
- `Decklist` — NRDB decklist id as primary key, `name`, `identityCode` (references `Card`), `raw Json` for author/date/description and anything else NRDB returns.
- `DecklistCard` — join table: `decklistId`, `cardCode`, `quantity`.
- `Ruling` — `id`, `cardCode` (FK), `question`, `answer`, `textRuling`, `nsgRulesTeamVerified`, `updatedAt`.
- `RuleSection` — `id` (e.g. `"3.3"`), `title`, `anchor`, `bodyText` (full section text, sub-clauses included as-is per the section-level-granularity decision).
- `RuleMapping` — `key` (card `typeCode`/`subtypeCode`/keyword string), `ruleSectionId` (references `RuleSection`, but see the note below about deferring the FK constraint). Rows are populated by the seed script below, not entered by hand through the app.
- `User` — Auth.js-required fields (`id`, `name`, `email`, `emailVerified`, `image`) plus `role` enum (`ADMIN`/`USER`).
- `Account`, `Session`, `VerificationToken` — standard Auth.js Prisma-adapter tables, unmodified from the adapter's documented schema.
- `CardFavorite` (`userId`, `cardCode`) and `DecklistFavorite` (`userId`, `decklistId`) — two plain join tables rather than one polymorphic table, since Prisma doesn't model polymorphic relations cleanly.
- Postgres `pg_trgm` extension + GIN indexes on `Card.title`/`Card.text`, `Decklist.name`, `RuleSection.title`/`bodyText` — added as raw SQL in the migration (Prisma's schema DSL doesn't express trigram indexes natively).

**Note on `RuleMapping.ruleSectionId`**: `RuleSection` won't have any rows until the rules-doc scraper (a later phase) runs, but the seed script below needs to insert `RuleMapping` rows now. So `ruleSectionId` should NOT have a DB-level foreign-key constraint in Phase 1 — it's a plain string column referencing a `RuleSection.id` that will exist later. Add the FK constraint in the phase that builds the scraper, once `RuleSection` is actually populated.

## Seed script (`prisma/seed.ts`)

- Reads a plain data file, `prisma/rule-mapping-data.ts` (the "code/seed file" from the architecture decision — e.g. `{ key: "Operation", ruleSectionId: "3.3" }[]`), and upserts it into `RuleMapping`.
- `RuleSection` rows themselves are NOT seeded here — they come from the rules-doc scraper, built in a later phase.

## Auth.js

- `next-auth@beta` (v5) with the `@auth/prisma-adapter`, GitHub as the sole provider.
- `auth.ts` (root config), `app/api/auth/[...nextauth]/route.ts`.
- `User.role` defaults to `USER`; no in-app role-granting UI this phase — the first admin is set directly via a one-off DB update (documented in a code comment, not built as a feature) since there's only one user (you) to promote right now.
- A `requireAdmin()` helper (session + role check) for later use gating sync-trigger routes/pages — not wired to any route yet since no admin actions exist in Phase 1.

## Verification

- `docker compose up -d` starts Postgres cleanly.
- `pnpm prisma migrate dev` applies the full schema with no errors; `pnpm prisma studio` shows all tables listed above.
- `pnpm prisma db seed` runs without error and populates `RuleMapping` (should succeed even though `RuleSection` is empty, per the deferred-FK note above).
- `pnpm dev` boots the app; visiting the homepage and signing in via GitHub creates a `User`/`Account`/`Session` row (checkable via Prisma Studio) and the session reflects `role: USER`.

## Explicitly deferred to later phases (not built now)

- NRDB sync scripts (cards, decklists, rulings) and the rules-doc scraper.
- All browsing/search UI (cards, decklists, rules glossary), the right-click rulings/rules context menu, favorites UI, admin sync-trigger UI.
- Vitest setup and any tests (nothing exists yet to meaningfully test).
