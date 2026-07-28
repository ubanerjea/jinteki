# Phase 3 — Rules Glossary: Task Report

Scope built per `plans/PHASE_3_PLAN.md` (informed by `plans/PROJECT_PLAN.md`): a real HTML scraper for `rules.nullsignal.games` populating `RuleSection`, the deferred `RuleMapping.ruleSectionId` → `RuleSection.id` foreign key, a real curated `RuleMapping` seed built from actual synced `Card` data cross-referenced against the actual scraped rules text, full wiring into Phase 2's sync/admin infrastructure (`SyncType.RULES`, `pnpm sync:rules`, a fifth admin row/route case, `sync-all.ts`), and Vitest tests against a recorded real-page fixture. All browsing/search UI, the right-click menu, and favorites/admin-UI polish remain out of scope per the plan's "Explicitly deferred" list and were not touched.

## What was built

### 1. Live page structure — investigated for real, not assumed

Fetched `https://rules.nullsignal.games/` directly (plain `fetch()`, no auth/headers needed — byte length matched a `curl` of the same URL exactly) and inspected the real HTML before writing any parser code, per the plan's explicit instruction not to assume tag structure from the original architecture research. Findings:

- The page is plain server-rendered static HTML (no client-side rendering needed).
- `<title>Netrunner Comprehensive Rules (v26.03)</title>`, with "This version ... is effective 02 March 2026." in the body — the doc's own revision marker, as PHASE_3_PLAN.md asked to confirm. Not stored in the DB (the sync doesn't gate on it, per the architecture's "manual, full resync any time is fine" decision) but noted here and in `sync-rules.ts`'s comments.
- Inside `<div id="RulesContent">`, a sibling `<main>` element contains a **flat sequence** of `<h1 class="Chapter" id="chpt_...">` (11 chapters, not stored as rows) and `<h2 class="Section" id="sec_...">` (**119** numbered sections — this became the "plausible count" verification check) as direct siblings, interspersed with `<ol class="Rules">`/`<ol class="SubRules">` (and a couple of other list classes in the appendix chapter) holding each section's numbered/lettered clauses.
- Critically: "sub-sections" like "3.6.5 Regions" (anchor `subsec_regions`, mentioned in the original architecture research) are **not** a separate heading level at all — they're plain `<li class="Rule">` items (same shape as a numbered clause) whose content is a `<span class="SubSection">` instead of a `<span class="RuleText">`. This confirmed exactly what "sub-clauses folded into their parent section" means mechanically: everything between one `h2.Section` and the next `h1`/`h2` belongs to the current section regardless of what list/class wraps it.

### 2. Scraper — `src/sync/sync-rules.ts`

Single file, following Phase 2's established per-sync-module structure (mapper/parser + `run*Sync()` + CLI guard, all importable without triggering a live network call on import):

- `parseRuleSections(html)` — pure function, no network access, fully unit-tested. Walks `main`'s direct children in order; on each `h2.Section`, extracts the leading section number (e.g. "3.5") and title from its text via regex; everything else until the next `h1`/`h2` is folded into the current section's `bodyText`.
- **Deliberately avoids cheerio's own `.text()`**: adjacent inline elements in the source HTML have zero whitespace between them (e.g. `<a class="RuleLink">3.5.1.</a><span class="RuleText">Operations are...`), so a naive `.text()` reads "3.5.1.Operations are...". Also **deliberately avoids `.find('*').addBack()`** — tried first, then discarded after it silently reordered text (and in one case dropped words) because cheerio's `addBack()` does not preserve document order relative to the found set. The final approach is a plain recursive walk over `.contents()` (cheerio's own typed public API — see the `domhandler` note below), joining every text node with a single space.
- Fails loudly rather than silently: throws if `<main>` isn't found, and `runRulesSync()` throws if fewer than 50 sections come back (protects against a future DOM-structure change quietly upserting a handful of rows and still reporting "SUCCESS").
- `runRulesSync()` wraps the fetch + parse + idempotent per-`id` upsert in `withSyncRun(SyncType.RULES, ...)`, identical pattern to the other four sync modules.

**Deviation from the plan's suggested typing**: `domhandler@5.0.3` was added as an explicit `devDependency` (pinned to the exact version cheerio 1.2.0 itself depends on) so the recursive text-walker could be typed as `Cheerio<AnyNode>` instead of `any` — cheerio's own public `.d.ts` uses `AnyNode` internally but does not re-export the name, and pnpm's strict `node_modules` layout won't resolve an undeclared transitive package for a direct type-only import. Small, justified addition to satisfy `@typescript-eslint/no-explicit-any` (lint was failing on `any` before this).

### 3. Fixture + tests — `src/sync/__fixtures__/rules-page-snippet.html`, `src/sync/sync-rules.test.ts`

The fixture is a **real, recorded excerpt** of the live page (fetched 2026-07-28), not hand-written: chapter 3's header plus four real sections — 3.1 Identities, 3.2 Agendas, 3.5 Operations, 3.6 Upgrades — chosen specifically to exercise multiple sections in sequence, a section with only numbered clauses, a section with lettered sub-clauses tied to card subtypes (Operations' condition/current/lockdown), and a section containing a folded-in "sub-section" (3.6.5 Regions). 7 tests cover: correct row count (per-`h2`, not per-`h1`/per-clause), id/title/anchor extraction, the whitespace-insertion fix, folding of numbered + lettered clauses into one row, folding of a sub-section into its parent's row (and confirming it does *not* become its own row), idempotency, and the "no `<main>` found" error path.

### 4. Schema — two migrations, sequenced per the plan

- `prisma/migrations/20260728141013_add_rules_sync_type/` — adds `RULES` to the `SyncType` enum only.
- `prisma/migrations/20260728143000_add_rule_mapping_fk/` — adds the real `RuleMapping.ruleSectionId → RuleSection.id` foreign key, applied **only after** `RuleSection` was populated by a real scrape and every `RuleMapping` row was verified (via a one-off script, `verify-mapping.mjs`, run and then deleted) to reference a real `RuleSection.id` — sequenced exactly as PHASE_3_PLAN.md specified.
- Both migrations were generated via `prisma migrate diff --to-schema-datamodel` (this non-interactive shell still can't get through `migrate dev`'s prompt, same as Phase 2) and **both times** the raw diff proposed dropping all five Phase-1 `pg_trgm` GIN indexes again (they aren't expressed in `schema.prisma`'s syntax) — both migration files were hand-trimmed to exclude those `DROP INDEX` statements before being applied via `migrate deploy`.

### 5. Curated `RuleMapping` data — `prisma/rule-mapping-data.ts` (28 rows, replacing the 2 placeholders)

Built by querying the real, synced `Card` table directly (`docker compose exec postgres psql`), not from memory:

- **11 distinct `Card.typeCode` values**: `agenda, asset, corp_identity, event, hardware, ice, operation, program, resource, runner_identity, upgrade`. All 11 map unambiguously onto chapter 3 ("Card Types")'s 10 sections (`corp_identity`/`runner_identity` share 3.1 Identities). **Full coverage**, as the plan requires for card types.
- **104 distinct `Card.keywords` values**, checked against the real scraped `RuleSection.bodyText` two ways: a broad word search (too noisy — many keywords are also common English words, e.g. "current", "link", "run", "source") and a targeted search for the doc's own definitional phrasing (`"has/have the subtype X"`, confirmed by spot-check to be the pattern NSG's rules consistently use whenever a subtype has real governing rules text, as opposed to merely being listed in the master glossary at **2.16 Subtypes**, which nearly all 104 keywords appear in and so isn't a useful differentiator on its own).

**A concrete example of why this evidence-based approach mattered**: Phase 1's own placeholder guessed `Operation → "3.3"`. The real scrape shows **3.3 is actually "Assets"** and **Operations is really 3.5** — confirming PROJECT_PLAN.md's own warning not to hard-code section numbers from memory. The placeholder rows were deleted (not just left alongside the new ones) as part of this phase's "replace" instruction.

**15 keyword mappings kept** (19 distinct sections, 17 keyword rows since `condition` and `current` each map to two sections):

| Keyword | Section(s) | Reasoning |
|---|---|---|
| `icebreaker` | 3.9 Programs | Dedicated 3.9.5 Icebreakers sub-clause, folded into 3.9's row |
| `console` | 3.8 Hardware | Dedicated 3.8.5 Consoles sub-clause |
| `region` | 3.6 Upgrades | Dedicated 3.6.5 Regions sub-clause. Assets can also carry the subtype (3.3.4), but 3.3's own text explicitly cross-references 3.6.5 as the section with the actual governing rules, so 3.6 alone is the target rather than double-mapping |
| `condition` | 3.5 Operations **and** 3.7 Events | The doc defines an identical "condition" subtype for both card types (3.5.1a for operations, 3.7's "On the Lam" clause for events) — mapped to both rather than picking one |
| `current` | 3.5 Operations **and** 3.7 Events | Same situation as condition — defined identically for both |
| `lockdown` | 3.5 Operations | Defined only for operations (3.5.1c), unlike condition/current |
| `alliance` | 2.14 Influence Cost | 2.14.3 defines alliance cards' influence-cost adjustment rule |
| `connection` | 1.13 Host, Hosted, and Hosting | Defined there re: hosting (Off-Campus Apartment example) |
| `priority` | 1.11 Clicks | 1.11.4 defines the "priority" subtype's first-click restriction |
| `directive` | 1.5 Extra Cards | Defined there via Adam's identity ability |
| `terminal` | 5.4 Action Phase | Terminal operations/events force the action phase to end early — defined mechanic there |
| `virus` | 1.9 Counters and Tokens | Virus counters are one of the defined counter types there |
| `sabotage` | 10.12 Sabotage | The "sabotage N" keyword-ability is directly, namesake-ly defined there |
| `link` | 10.7 Link | Link-granting cards and the link mechanic are defined there |
| `psi` | 10.14 Bidding | The modern name for the secret-bid ("psi") mechanic — the section text no longer says "psi" but is the governing rules for psi-subtype cards |

**Keywords explicitly considered and left out**, checked against real body text rather than skipped by assumption (comment block in `rule-mapping-data.ts` has the full reasoning):

- `ai`, `caissa`, `killer`, `fracter`, `decoder`, `trojan` — Program/Icebreaker flavor subtypes with zero presence in the doc beyond the 2.16 glossary listing.
- `barrier`, `code_gate`, `sentry` — Ice "type" subtypes; only appear in the glossary and as incidental illustrative examples elsewhere (e.g. "a barrier" used as an example in an unrelated rule), never with their own governed rule.
- `trap`, `ambush`, `companion` — Asset/Resource flavor subtypes with no rules-doc section of their own.
- `bioroid` — only appears in incidental examples (9.5, 9.12 — e.g. "a rezzed piece of bioroid ice" illustrating an unrelated paid-ability rule), never in a section defining the subtype itself.
- `stealth` — only an incidental example in 9.11 ("spend credits from a stealth card"), not a defined rule; no dedicated Stealth section exists in this revision.
- `tracer` — only in the glossary, unlike sabotage/link/psi (each of which has its own named mechanic section).
- The remaining ~80 keywords (academic, advertisement, ap, beanstalk, black_ops, cast, character, chip, clan, clone, cloud, consumer_grade, corp, corporation, cybernetic, cyborg, daemon, deep_net, deflector, destroyer, deva, digital, division, double, enforcer, executive, expansion, expendable, facility, gear, genetics, g_mod, government, grail, gray_ops, harmonic, hostile, industrial, initiative, job, liability, location, mandate, megacorp, mod, morph, mythic, natural, next, observer, off_site, orgcrime, police_department, political, public, remote, reprisal, research, ritzy, run, security, security_protocol, sensie, source, subsidiary, sysop, transaction, triple, unorthodox, unsubstantiated, vehicle, virtual, weapon) are pure faction/flavor/deckbuilding subtypes with no comprehensive-rules presence beyond the glossary listing.

`prisma/seed.ts` was updated to strip a documentation-only `note` field (present on each `RuleMappingEntry` for exactly this kind of inline reasoning) before writing, since it isn't a real `RuleMapping` column.

### 6. Wiring into Phase 2's sync/admin infrastructure

- `SyncType.RULES` added to the enum (first migration above).
- `pnpm sync:rules` added to `package.json`.
- `src/sync/sync-all.ts` — fifth step, `runRulesSync`, added after rulings.
- `src/app/api/admin/sync/[type]/route.ts` — fifth `SYNC_HANDLERS` entry, `rules: { type: SyncType.RULES, run: runRulesSync }`.
- `src/app/admin/sync/page.tsx` — fifth `SYNC_TYPES` row, labeled "Rules (Comprehensive Rules glossary)".

No new admin UI patterns invented — reused Phase 2's existing table/button/route shape exactly.

## A real bug found (and fixed) during production-mode verification

PROJECT_PLAN.md's verification standards require checking auth-gated routes under the real `next start` production server, not just `next dev`. Doing this properly (not just re-running the same unauthenticated check that already passed under dev) surfaced a genuine, previously-latent bug:

**With a real, valid, non-expired admin `Session` row and the correct `authjs.session-token` cookie sent via `curl`, `GET /admin/sync` and `POST /api/admin/sync/rules` both returned "not authenticated" — but only under `next start`, not under `next dev`.** Root cause, confirmed by reading `@auth/core`'s installed source (`node_modules/.../@auth/core/lib/utils/env.js`): `trustHost` defaults to `!!(AUTH_URL ?? AUTH_TRUST_HOST ?? VERCEL ?? CF_PAGES ?? (NODE_ENV !== "production"))`. Neither `AUTH_URL` nor `AUTH_TRUST_HOST` was set in `.env`, so this evaluates to `true` under `next dev` (`NODE_ENV=development`) but silently `false` under `next start` (`NODE_ENV=production`) — even on plain `localhost` HTTP with no real reverse proxy involved. With `trustHost` false, `auth()` fails to resolve the session at all.

This is **not** a Phase 3 regression — it affects every admin route from Phase 1/2 as well. It went undetected until now because Phase 2's own production-mode re-check (see `agent-reports/phase-2.md`'s "Admin routes re-checked under the production server" row) only exercised the *unauthenticated* rejection path under `next start` (no real admin session existed at that time to test the authenticated path with). This phase is the first time an authenticated admin request was made against a genuine `next start` server, and it caught this immediately.

**Fix applied**: `AUTH_TRUST_HOST=true` added to `.env` (gitignored, not committed) and documented with a detailed comment in `.env.example` explaining the root cause and pointing at a real `AUTH_URL` as the better long-term fix if this app is ever deployed behind an actual reverse proxy for a non-local host. Re-verified after the fix: unauthenticated requests and a bogus session token both still correctly return 401/"Access denied" (the gating logic itself was never wrong — only the session-resolution step upstream of it), and the real admin session now correctly authenticates under `next start`, identical to its `next dev` behavior.

## Verification — run for real, actual results

| Step | Result |
|---|---|
| Live page structure inspected before writing the parser | **Done.** Raw `fetch()` of `rules.nullsignal.games`, byte-length-matched against a `curl` of the same URL. Confirmed flat `<main>` structure, 119 real `h2.Section` elements across 11 `h1.Chapter`s, and that "sub-sections" (e.g. 3.6.5 Regions) are plain `<li class="Rule">` items, not a separate heading level. |
| `npx tsc --noEmit` | **Pass**, no errors. |
| `npx eslint .` | **Pass**, no errors or warnings (one `@typescript-eslint/no-explicit-any` failure found and fixed by properly typing the cheerio text-walker with `domhandler`'s `AnyNode` instead of `any`). |
| `pnpm test` | **Pass.** `Test Files 5 passed (5)`, `Tests 27 passed (27)` — the prior 20 (Phase 2) plus 7 new for `parseRuleSections`, against the real recorded fixture, no live network calls. |
| `pnpm sync:rules` run for real against the live page | **Pass.** `[sync:rules] SUCCESS - 119 records`. `psql`: `SELECT count(*) FROM "RuleSection"` → **119** (matches the live `h2.Section` count exactly, not a suspiciously low/high number from a parsing bug). Spot-checked `id`/`title`/`anchor` for 3.2/3.3/3.5/3.6 (Agendas/Assets/Operations/Upgrades) and read the full `bodyText` for 3.5 by eye — genuinely reads as real Operations rules, correctly folding in the lettered condition/current/lockdown sub-clauses with a space correctly inserted between adjacent inline elements that have none in the source HTML. |
| `pnpm sync:all` (full 5-step chain) | **Pass.** `factions+packs: SUCCESS (87)`, `cards: SUCCESS (2054)`, `decklists: SUCCESS (9` — 9 new decklists created since the last Phase 2 sync, incremental path correctly engaging`)`, `rulings: SUCCESS (886)`, `rules: SUCCESS (119)`, `all steps succeeded`. |
| Schema change (RULES enum) verified by direct introspection | **Pass.** `psql`: `SELECT enumlabel FROM pg_enum WHERE enumtypid = ...'SyncType'` lists `FACTIONS_PACKS, CARDS, DECKLISTS, RULINGS, RULES` — all 5, confirmed directly, not just trusted from Prisma's migration-success message. |
| Schema change (RuleMapping FK) verified by direct introspection | **Pass.** `psql \d "RuleMapping"` shows `Foreign-key constraints: "RuleMapping_ruleSectionId_fkey" FOREIGN KEY ("ruleSectionId") REFERENCES "RuleSection"(id) ON UPDATE CASCADE ON DELETE RESTRICT` — the constraint genuinely exists, not just present in `schema.prisma`. **Further confirmed it's a real, enforced constraint** (not decorative): attempted `INSERT INTO "RuleMapping" ... VALUES (..., '999.999')` (a nonexistent `ruleSectionId`) directly via `psql` and it was **rejected** — `ERROR: insert or update on table "RuleMapping" violates foreign key constraint`. |
| `pg_trgm` GIN indexes survived both migrations | **Pass.** `psql \di *trgm*` shows all 5 original indexes present after both of this phase's migrations — `migrate diff` proposed dropping all 5 both times (same known issue as Phase 2, since they aren't expressed in `schema.prisma`'s syntax); both migration files were hand-trimmed to exclude those `DROP INDEX` statements before being applied. |
| `RuleMapping` data-writing logic verified by real row counts, not self-reported | **Pass.** Old placeholder rows (`Operation`/`3.3`, `Agenda`/`3.2`) explicitly deleted via `psql` (confirmed `DELETE 1` twice). `npx prisma db seed` reported "Seeded 28 RuleMapping row(s)"; `psql SELECT count(*) FROM "RuleMapping"` independently confirms **28** — matches exactly, not just the script's own log line. A one-off verification script (`verify-mapping.mjs`, run once then deleted, not left in the repo) confirmed all 19 distinct `ruleSectionId` values referenced by the 28 rows resolve to real `RuleSection.id`s **before** the FK migration was applied — exactly the sequencing PHASE_3_PLAN.md calls for. |
| `RuleMapping` rows spot-checked by eye against real `RuleSection.bodyText` | **Pass.** `operation → 3.5`: body genuinely reads as Operations rules (not Assets, which is what 3.3 actually is — the specific pitfall the plan warned about). `ice → 3.4`, `virus → 1.9` ("virus counters" among the defined counter types), `priority → 1.11` ("Some cards have the subtype priority and the text 'Play only as your first...'") all read exactly as expected by eye. |
| Dev-mode boot + curl | **Pass.** `pnpm dev` (Turbopack) → Ready. `curl http://localhost:3000/` → 200. `curl --cookie <real admin session> http://localhost:3000/admin/sync` → 200, body shows all 5 sync rows including the new "Rules (Comprehensive Rules glossary)" row (not "Access denied"). `curl -X POST --cookie <real admin session> http://localhost:3000/api/admin/sync/rules` → 200, `{"run":{"status":"SUCCESS","recordCount":119,...}}`, confirmed against `psql` (`SyncRun` row with that exact id exists, `type=RULES`, `status=SUCCESS`, `recordCount=119`). |
| Production `next build` + `next start` + curl (separate check, not a substitute for dev-mode) | **Pass, after finding and fixing the `AUTH_TRUST_HOST` bug above.** `pnpm build` → compiled successfully, route listing shows `/admin/sync` and `/api/admin/sync/[type]` as dynamic. `pnpm start` → genuine `next start` server (no dev banner, no Turbopack dev overlay), `Ready in 136ms`. Homepage → 200. Unauthenticated `GET /admin/sync` → 200 + "Access denied". Unauthenticated `POST /api/admin/sync/rules` → 401 + `{"error":"Not authenticated"}`. **Authenticated** admin checks against real `next start` initially failed (see bug above); after adding `AUTH_TRUST_HOST=true` to `.env` and restarting the production server, the same authenticated `GET /admin/sync` and `POST /api/admin/sync/rules` calls succeeded identically to the dev-mode results (all 5 rows rendered; POST returned `SUCCESS`/119 records, confirmed via `psql`). Re-confirmed the unauthenticated and bogus-session-token paths still correctly return 401/"Access denied" after the fix — the gating logic itself was never wrong, only the upstream session-resolution step. |
| Auth-gated routes reject unauthorized access | **Pass**, under both dev and production servers, both before and after the `AUTH_TRUST_HOST` fix: `POST /api/admin/sync/rules` with no cookie → 401 `{"error":"Not authenticated"}`; with a bogus/nonexistent session token → 401 `{"error":"Not authenticated"}` (same as no cookie — no partial-trust leakage). |

## Deviations from the plan, summarized

1. **`domhandler@5.0.3` added as an explicit devDependency**, pinned to the exact version cheerio 1.2.0 itself uses — needed to type the recursive text-walker as `Cheerio<AnyNode>` instead of `any` (cheerio's own `.d.ts` doesn't re-export that type name, and pnpm won't resolve an undeclared transitive package for a direct import).
2. **`RuleMappingEntry.key` uses raw NRDB-style lowercase/underscore strings** (`operation`, `corp_identity`, `icebreaker`) rather than Phase 1 placeholder's human-readable capitalized labels (`Operation`) — so future lookup code (the Phase 5 right-click menu) can join directly against `Card.typeCode`/`Card.keywords` without a translation layer. A deliberate improvement over the placeholder's format, not a plan requirement either way.
3. **`RuleMappingEntry` gained an optional `note` field**, stripped out by `seed.ts` before writing (not a real `RuleMapping` column) — used to keep the reasoning for each tier-2 mapping decision inline with the data itself rather than only in a separate comment block, given how much judgment PHASE_3_PLAN.md expects here.
4. **`AUTH_TRUST_HOST=true` added to `.env`/`.env.example`** — not part of the plan's stated scope, but a genuine bug found while following PROJECT_PLAN.md's own verification standard (auth-gated routes checked under real production mode) to the letter. Left unfixed, the new `rules` admin route (and every existing admin route) would be provably broken for authenticated use under `next start`. Documented above in full with root cause and reasoning.
5. **Two migrations instead of one** for the schema changes (RULES enum, then the FK), rather than combining them — required by the plan's own explicit sequencing (FK only after RuleSection has real rows and every RuleMapping row is verified to resolve).

No scope reduction: every file/route/model/script named in `PHASE_3_PLAN.md` was built, and the "Explicitly deferred" list (browsing/search UI, right-click menu, favorites, admin UI polish) was left untouched.

## Left unresolved / requires the repo owner's manual action

1. **The `AUTH_TRUST_HOST` fix is currently only in `.env`** (gitignored, not committed) and documented in `.env.example` — the repo owner should confirm `.env`'s value matches `.env.example`'s guidance (it already does on this machine) and be aware this affects all admin routes, not just this phase's new one.
2. **The 15 mapped keywords / full-coverage 11 card types are a best-effort, reviewable starting point**, exactly as PROJECT_PLAN.md's architecture intends (`rule-mapping-data.ts` as a plain seed file the owner can extend/correct as a normal diff) — the ~89 unmapped keywords are documented as "considered and skipped" in the file's comments, not silently dropped, and are open to the owner's own judgment calls if any should actually be mapped.
3. Nothing from `PHASE_3_PLAN.md`'s "Explicitly deferred" list was started: no card/decklist/rules browsing or search UI, no right-click rulings/rules menu, no favorites UI, no admin UI polish.
4. Working tree was **not** committed or pushed, per instructions. `git status` at the end of this session shows `.env.example`, `package.json`, `pnpm-lock.yaml`, `prisma/rule-mapping-data.ts`, `prisma/schema.prisma`, `prisma/seed.ts`, `src/app/admin/sync/page.tsx`, `src/app/api/admin/sync/[type]/route.ts`, `src/sync/sync-all.ts` as modified, plus the two new migration folders, `src/sync/__fixtures__/rules-page-snippet.html`, `src/sync/sync-rules.test.ts`, and `src/sync/sync-rules.ts` as untracked — ready for the owner's review.

## Key files (all under `C:\Users\Unz\git\jinteki`)

- `src/sync/sync-rules.ts`, `src/sync/sync-rules.test.ts`, `src/sync/__fixtures__/rules-page-snippet.html`
- `src/sync/sync-all.ts` (added the `rules` step)
- `src/app/api/admin/sync/[type]/route.ts`, `src/app/admin/sync/page.tsx` (added the `rules` handler/row)
- `prisma/schema.prisma` (added `SyncType.RULES`, `RuleSection.mappings`, `RuleMapping.ruleSection` relation)
- `prisma/migrations/20260728141013_add_rules_sync_type/migration.sql`
- `prisma/migrations/20260728143000_add_rule_mapping_fk/migration.sql`
- `prisma/rule-mapping-data.ts` (28 real curated rows, replacing the 2 Phase 1 placeholders), `prisma/seed.ts` (strips `note` before writing)
- `.env.example` (documents `AUTH_TRUST_HOST`), `.env` (gitignored — has the real fix applied)
- `package.json` (added `sync:rules`, `cheerio` dependency, `domhandler` devDependency)
