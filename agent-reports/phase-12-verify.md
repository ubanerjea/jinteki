# Phase 12 independent verification

Verify subagent only. Spec: `plans/PHASE_12_PLAN.md` Verification section, plus `PROJECT_PLAN.md` phase verification standards and `RESEARCH_AND_VERIFICATION_PRINCIPLES.md`. Did not trust `agent-reports/phase-12-build.md`. Expected card counts were re-derived from live `psql` with predicates written from the plan / `plans/SEARCH_MATCHING.md`, not copied from `src/lib/search/cards.ts`.

HTML totals: `script` tags stripped, then HTML comments stripped (React inserts `<!-- -->` between text nodes, e.g. `613<!-- --> card<!-- -->s<!-- --> found`), then regex `(\d+)\s+cards?\s+found`.

Session cookie used: `authjs.session-token=527797df-3059-4652-9f57-c606f3d83bcc` for user `cms4y4wf60000qg1spcaonb6q` (Unmeel Banerjea). That user was **not** signed out. Five live sessions remain.

Probe rows created during this pass were deleted at the end.

Restored topical plans (orchestrator static review; confirm only):

| Path | Present |
|---|---|
| `plans/SEARCH_MATCHING.md` | yes |
| `plans/SIMPLE_CARD_SEARCH_PLAN.md` | yes |
| `plans/ADVANCED_CARD_SEARCH_PLAN.md` | yes |

Accepted deviations (not re-litigated): Prisma `@default(cuid())` has no SQL DEFAULT; mutation logic in `src/lib/owned-decklists.ts`; search tests count `isPublic = true`.

---

## Independent SQL baselines (2026-09-06, live DB)

Format row confirmed:

```
SELECT id, name, "activeCardPoolId", "activeRestrictionId" FROM "Format" WHERE id = 'standard';
```

```
    id    |   name   |      activeCardPoolId       |   activeRestrictionId
----------+----------+-----------------------------+-------------------------
 standard | Standard | standard_2026_vantage_point | standard_ban_list_26_03
```

Matches the brief. Card JSONB shape (from `sure_gamble`): `raw->'attributes'->'card_pool_ids'` array, `card_set_ids` array, `restrictions.banned` array. `pg_trgm.word_similarity_threshold` = `0.6`. Residual text uses `<%` OR `ILIKE` per `plans/SEARCH_MATCHING.md`.

| Check | Independent SQL / meaning | Expected (brief) | Actual | Pass |
|---|---|---|---|---|
| All cards | `SELECT count(*) FROM "Card"` | 2054 | 2054 | **PASS** |
| Decklists (pre-probe, pre-sync) | `SELECT count(*) FROM "Decklist"` | 74242 | 74242 | **PASS** |
| Public decklists (same moment) | `WHERE "isPublic"` | 74242 = 74242 | 74242 = 74242 | **PASS** |
| Owned rows (before inserts) | `"ownerId" IS NOT NULL` | 0 | 0 | **PASS** |
| Anarch | `"factionCode"='anarch'` | 253 | 253 | **PASS** |
| Criminal | `criminal` | 261 | 261 | **PASS** |
| Anarch OR criminal | `IN ('anarch','criminal')` | 514 | 514 | **PASS** |
| Anarch AND criminal | both | 0 | 0 | **PASS** |
| Not anarch | `<> 'anarch'` | 1801 | 1801 | **PASS** |
| Anarch + program | anarch AND `"typeCode"='program'` | 76 | 76 | **PASS** |
| Title virus | `title ILIKE '%virus%'` | 3 | 3 | **PASS** |
| Text virus | `text ILIKE '%virus%'` | 78 | 78 | **PASS** |
| Anarch + virus residual | anarch AND (`'virus' <% title OR title ILIKE '%virus%' OR 'virus' <% text OR text ILIKE '%virus%'`) | 47 | 47 | **PASS** |
| Kala Ghoda any printing | `(raw->'attributes'->'card_set_ids') @> '"kala_ghoda"'` | 19 | 19 | **PASS** |
| Mumbad cycle | `EXISTS` pack with `"cardCycleId"='mumbad'` AND `card_set_ids` contains `pack.code` | 114 | 114 | **PASS** |
| Standard pool | `card_pool_ids @> Format.standard.activeCardPoolId` | 613 | 613 | **PASS** |
| Standard banned in pool | pool AND `restrictions.banned @> activeRestrictionId` | 29 | 29 | **PASS** |
| Pool minus banned | 613−29 | 584 | 584 | **PASS** |
| NBN | `"factionCode"='nbn'` | 241 | 241 | **PASS** |
| Identities | `"typeCode" IN ('corp_identity','runner_identity')` | 148 | 148 | **PASS** |
| `typeCode='identity'` | | 0 | 0 | **PASS** |
| GIN indexes | `pg_indexes` `LIKE '%trgm%'` | 5 named indexes | 5: `Card_text_trgm_idx`, `Card_title_trgm_idx`, `Decklist_name_trgm_idx`, `RuleSection_bodyText_trgm_idx`, `RuleSection_title_trgm_idx` | **PASS** |

Cycle `mumbad` position **10**; six packs (`kala_ghoda` … `fear_the_masses`). Distinct `"typeCode"` values: agenda, asset, corp_identity, event, hardware, ice, operation, program, resource, runner_identity, upgrade — **no** `identity`.

Live SQL matched the brief's 2026-09-06 numbers exactly. Those card counts are the HTTP expected values below.

Later in this pass, required `pnpm sync:decklists` (incremental) wrote 618 records and moved decklist totals to **74860 public / 74863 total** (3 owned private probes). Card table unchanged. After probe cleanup: owned **0**, public **74860**.

---

## A. Static

| Check | Expected | Actual | Pass |
|---|---|---|---|
| `pnpm exec tsc --noEmit` | exit 0 | exit 0, no output | **PASS** |
| `pnpm lint` | exit 0 | exit 0, `$ eslint` | **PASS** |
| `pnpm test` | all green | `Test Files  30 passed (30)` / `Tests  398 passed (398)` / Duration 21.07s | **PASS** |
| `$queryRawUnsafe` / `$executeRawUnsafe` actual calls in `src/` | none (comments don't count) | 4 hits, all comments in `cards.ts`, `cards-advanced.ts`, `decklists-advanced.ts` | **PASS** |

Vitest excerpt:

```
 Test Files  30 passed (30)
      Tests  398 passed (398)
   Start at  12:28:59
   Duration  21.07s
```

---

## B. Schema (psql, not Prisma success messages)

`\d "Decklist"`:

```
                            Table "public.Decklist"
    Column    |              Type              | Collation | Nullable | Default
--------------+--------------------------------+-----------+----------+---------
 id           | text                           |           | not null |
 name         | text                           |           | not null |
 identityCode | text                           |           | not null |
 raw          | jsonb                          |           | not null |
 createdAt    | timestamp(3) without time zone |           |          |
 nrdbUserId   | text                           |           |          |
 updatedAt    | timestamp(3) without time zone |           |          |
 isPublic     | boolean                        |           | not null | true
 notes        | text                           |           |          |
 ownerId      | text                           |           |          |
```

Indexes include `Decklist_name_trgm_idx` gin, `Decklist_ownerId_idx`, FKs to `Card(code)` and `User(id)` ON DELETE CASCADE.

| Check | Expected | Actual | Pass |
|---|---|---|---|
| `ownerId`, `isPublic`, `notes` exist | yes | yes | **PASS** |
| `isPublic` default | `true` | `true` | **PASS** |
| `id` SQL DEFAULT | none (cuid is Prisma-client) | Default column empty | **PASS** (not a phase failure; accepted deviation) |
| Five trgm GIN indexes by exact name | those five | those five, still present after this pass | **PASS** |
| `count(*) WHERE "isPublic"` = `count(*)` immediately after migrate (pre-probe) | 74242 = 74242 | 74242 = 74242 | **PASS** |
| `docs/schema.md` mentions ownerId / isPublic / notes | yes | table docs: `ownerId` FK, `isPublic` default `true`, `notes` nullable | **PASS** |
| Identity DISTINCT typeCode | `corp_identity` + `runner_identity`, not `identity` | 11 codes, no `identity`; 148 identities | **PASS** |

---

## C. Feature SQL vs HTTP — simple search

`pnpm dev` → Next.js 16.2.12 Ready in 1893ms on port 3000.

Visible `{n} cards found` after stripping scripts + comments, compared to **this pass's** psql.

| # | URL | Expected | Actual (dev) | Pass |
|---|---|---|---|---|
| 1 | `/cards?q=format:standard` | 613 | 613, box `value="format:standard"`, no Filtered-by | **PASS** |
| 1 | `/cards?format=standard` | 613 | 613, Filtered-by true | **PASS** |
| 1 | `/cards/advanced/results?format=standard` | 613 | 613 | **PASS** |
| 2 | `/cards?q=format:standard%20banned:yes` | 29 | 29, `value="format:standard banned:yes"` | **PASS** |
| 2 | `/cards/advanced/results?format=standard&banned=1` | 29 | 29 | **PASS** |
| 3 | `/cards?q=format:standard%20banned:no` | 584 | 584 | **PASS** |
| 4 | `/cards?q=f:anarch+virus` | 47 | 47, `value="f:anarch virus"`, Filtered-by **false** | **PASS** |
| 5 | `/cards?q=f:anarch+%7C+f:criminal` | 514 union, not 253 | 514, `value="f:anarch \| f:criminal"` | **PASS** |
| 6 | `/cards?q=f:anarch+f:criminal` | 0 (AND) | 0, `value="f:anarch f:criminal"` | **PASS** |
| 7 | `/cards?q=e:kala+ghoda` | 19 | 19 | **PASS** |
| 7 | `/cards?pack=kala_ghoda` | 19 | 19 | **PASS** |
| 8 | `/cards?q=cy:mumbad` | 114 | 114 | **PASS** |
| 8 | `/cards?q=cy:10` | 114 | 114 | **PASS** |
| 9 | `/cards?q=faction:anarch` | 253 | 253 | **PASS** |
| 9 | `/cards?q=f:anarch` | 253 | 253 | **PASS** |
| 10 | `/cards?q=!f:anarch` | 1801 | 1801 | **PASS** |
| 11 | `/cards?q=i:virus` | 3 (title ILIKE) | 3 — **not wider than ILIKE** | **PASS** |
| 11 | `/cards?q=x:virus` | 78 (text ILIKE) | 78 — **not wider than ILIKE** | **PASS** |
| 12 | `/cards?faction=nbn&q=f:anarch` | 241 NBN, not Anarch; Filtered-by | 241, banner `Filtered by <strong>Faction: NBN</strong>` | **PASS** |
| 13 | `/cards?format=standard&banned=1` | 29; banner may mention Banned | 29, banner `Filtered by <strong>Format: Standard · Banned: 1</strong>` | **PASS** |
| 14 | `/cards/syntax` | `format:standard` as prefix example; no “there is no `b:`”; `!` / `OR` / `title:` / `set:` documented; first-wins change documented | `format_standard_ex=true`; `no_b_sentence=false` (sentence gone); `has_bang=true`; `has_OR=true`; `has_title=true`; `has_set=true`; `first_wins_revoked_example=true`; `first-wins-word=true` | **PASS** |

Banned **set equality** (production HTML, `pageSize=100`, vs independent SQL codes): both lists are exactly these 29 codes:

```
bellona, bukhgalter, cayambe_grid, cleaver, cyberdex_sandbox, cybersand_harvester,
dr_vientiane_keeling, drago_ivanov, endurance, engram_flush, false_lead, gold_farmer,
hoshiko_shiro_untold_protagonist, k2cp_turbine, luminal_transubstantiation, matryoshka,
moshing, nanisivik_grid, nbn_reality_plus, nyusha_sable_sintashta_symphonic_prodigy,
project_vacheron, rezeki, sting, svyatogor_excavator, touch_ups, tributary, trick_shot,
tsakhia_bankhar_gantulga, world_tree
```

**PASS** (HTTP set = independent banned-in-pool SQL).

Quoted fetch lines (dev):

```
STATUS=200 FOUND=613 VALUE="format:standard" FILTERED_BY=false PATH=/cards?q=format:standard
STATUS=200 FOUND=29 VALUE="format:standard banned:yes" FILTERED_BY=false PATH=/cards?q=format:standard%20banned:yes
STATUS=200 FOUND=47 VALUE="f:anarch virus" FILTERED_BY=false PATH=/cards?q=f:anarch+virus raw_q_in_value=true
STATUS=200 FOUND=514 VALUE="f:anarch | f:criminal" FILTERED_BY=false PATH=/cards?q=f:anarch+%7C+f:criminal
STATUS=200 FOUND=0 VALUE="f:anarch f:criminal" FILTERED_BY=false PATH=/cards?q=f:anarch+f:criminal
STATUS=200 FOUND=19 VALUE="e:kala ghoda" FILTERED_BY=false PATH=/cards?q=e:kala+ghoda
STATUS=200 FOUND=114 VALUE="cy:mumbad" FILTERED_BY=false PATH=/cards?q=cy:mumbad
STATUS=200 FOUND=1801 VALUE="!f:anarch" FILTERED_BY=false PATH=/cards?q=!f:anarch
```

Type-ahead dropdowns: **not proven** (no headless browser). Unit tests `simple-search-box.test.ts` (23) passed; that is not UX proof.

---

## D. User decklists (auth)

### Unauthenticated

| Check | Expected | Actual | Pass |
|---|---|---|---|
| GET `/me` | redirect to sign-in | `307` `Location: /api/auth/signin` | **PASS** |
| GET `/decklists/new` | redirect to sign-in | `307` `/api/auth/signin` | **PASS** |
| GET `/decklists/{id}/edit` signed-out | redirect or 404 | `307` `/api/auth/signin` (for both a fake id and a real NRDB UUID) | **PASS** |
| GET `/favorites` | redirect to `/me` | `307` `/me` | **PASS** |

### Unsigned POST (owned count unchanged)

Pre-create owned count after the private SQL probe only: **1**.

| Check | Expected | Actual | Pass |
|---|---|---|---|
| POST create `/decklists/new` without cookie, real `$ACTION_ID_…` + name + identity | 303 sign-in, no new row | `303` `/api/auth/signin`; `SELECT … WHERE name LIKE 'PHASE12_VERIFY_SHOULD_NOT_EXIST%'` empty; owned still 1 | **PASS** |
| POST clone of `61e4dd61-dd12-4870-8668-2fbbc391eb7d` without cookie, fields extracted from the signed-out page, `Origin: http://localhost:3000` | 303 sign-in, no new row | `303` `/api/auth/signin`; fieldNames `$ACTION_REF_3`, `$ACTION_3:0`, `$ACTION_3:1`; no `Copy of Dolls%` row | **PASS** |
| POST update without cookie using the Save action id from the owner edit page | 303 sign-in, row unchanged | `303` `/api/auth/signin`; probe name still `PHASE12_VERIFY_PRIVATE_PROBE`, `isPublic=f` | **PASS** |

A first clone POST **without** `Origin` / with curl `-F` eating `@` in `"bound":"$@1"` returned Next.js `500 Failed to find Server Action`. That was a bad request encoding, not the product path. Re-POST from the live form fields + Origin succeeded as above.

### Private 404

Inserted:

```
INSERT INTO "Decklist" (id, name, "identityCode", raw, "ownerId", "isPublic", …)
VALUES ('phase12verifyprivate0001', 'PHASE12_VERIFY_PRIVATE_PROBE', '419_amoral_scammer',
        '{}'::jsonb, 'cms4y4wf60000qg1spcaonb6q', false, …);
```

| Check | Expected | Actual | Pass |
|---|---|---|---|
| GET `/decklists/phase12verifyprivate0001` **no cookie** | **404**, not 403 | `404`, name absent from body | **PASS** |
| GET same id **with owner cookie** | 200 and the name | `200`, h1 `PHASE12_VERIFY_PRIVATE_PROBE` | **PASS** |
| GET `/decklists/phase12verifyprivate0001/edit` owner | 200 | `200`, h1 `Edit decklist` | **PASS** |
| GET `/decklists/61e4dd61-…/edit` with this user (NRDB row, `ownerId` null) | 404 | `404` | **PASS** (not-owner / not-owned) |
| Non-owner **second user** | 404 | **not proven** — only one `User` row in this DB | unproven (see below) |

### Create via real form

GET `/decklists/new` with cookie: `200`, Sign-out present (session real), form `$ACTION_ID_40acd08728e17fd1902ca30d30049a2189a7ac8362`, identity options include `419_amoral_scammer`.

POST name `PHASE12_VERIFY_CREATE` + `identityCode=419_amoral_scammer`:

```
{"status":303,"location":"/decklists/cmtq1cvzj0001qgowcg4xp4j2/edit",…}
```

psql:

```
            id             |         name          |          ownerId          | isPublic |    identityCode    | raw | notes |      cardCode      | quantity |    typeCode
---------------------------+-----------------------+---------------------------+----------+--------------------+-----+-------+--------------------+----------+-----------------
 cmtq1cvzj0001qgowcg4xp4j2 | PHASE12_VERIFY_CREATE | cms4y4wf60000qg1spcaonb6q | f        | 419_amoral_scammer | {}  |       | 419_amoral_scammer |        1 | runner_identity
```

| Check | Expected | Actual | Pass |
|---|---|---|---|
| New row ownerId | that user | `cms4y4wf60000qg1spcaonb6q` | **PASS** |
| isPublic | false | `f` | **PASS** |
| Identity DecklistCard qty 1 | yes | qty 1 | **PASS** |
| Identity typeCode | `corp_identity` or `runner_identity` | `runner_identity` | **PASS** |
| GET `/decklists` HTML does **not** contain the name | absent | `hasCreateName: false`; visible total **74242** (public only; probe private) | **PASS** |
| GET `/me` contains the name | present | `hasCreateName: true`, `hasProbeName: true`, h1 `My decks` | **PASS** |

### Publish / unpublish

POST Save on `/decklists/cmtq1cvzj0001qgowcg4xp4j2/edit` with `isPublic=1`:

- psql `isPublic = t`
- GET `/decklists` visible total **74243**, first Recent row `PHASE12_VERIFY_CREATE` → `/decklists/cmtq1cvzj0001qgowcg4xp4j2`

POST Save with checkbox dropped (`isPublic` absent):

- psql `isPublic = f`
- GET `/decklists` total **74242**, `VISIBLE_CREATE_NAME false`

**PASS**.

### Clone

POST “Save a copy to my decks” on public NRDB id `61e4dd61-dd12-4870-8668-2fbbc391eb7d` with cookie:

```
303 Location: /decklists/cmtq1dl9o0003qgowjp04ohxi
```

```
                  id                  |                name                 | ownerId | isPublic | identityCode                      | id_len | has_hyphen
 61e4dd61-dd12-4870-8668-2fbbc391eb7d | Dolls? Never heard of 'em 2         | NULL    | t        | muslihat_multifarious_marketeer   | 36     | t
 cmtq1dl9o0003qgowjp04ohxi            | Copy of Dolls? Never heard of 'em 2 | cms4…   | f        | muslihat_multifarious_marketeer   | 25     | f
```

`DecklistCard` count src 25 / clone 25. FULL OUTER JOIN on `(cardCode, quantity)`: **0 mismatches**.

Cuid-shaped id (25 chars, no UUID hyphens) vs NRDB UUID. **PASS**.

### Sync does not eat owned rows

```
pnpm sync:decklists
[sync:decklists] SUCCESS - 618 records
```

Immediately after:

```
 cmtq1cvzj0001qgowcg4xp4j2 | PHASE12_VERIFY_CREATE               | cms4… | f
 cmtq1dl9o0003qgowjp04ohxi | Copy of Dolls? Never heard of 'em 2 | cms4… | f
 phase12verifyprivate0001  | PHASE12_VERIFY_PRIVATE_PROBE        | cms4… | f
```

All three still present. Public listing HTTP **74860** = `count(*) WHERE "isPublic"` **74860**; total 74863 = 74860 public + 3 private owned. Private names absent from `/decklists`. **PASS**.

(The jump 74242 → 74860 public is this incremental NRDB sync, not a visibility leak.)

### Header / favorites

Homepage with cookie (visible HTML, scripts stripped):

```
href="/me">Favorites
href="/me">Unmeel Banerjea
```

GET `/favorites` with cookie: `307` `/me`. **PASS**.

### Cleanup

```
DELETE FROM "Decklist" WHERE id IN (
  'phase12verifyprivate0001',
  'cmtq1cvzj0001qgowcg4xp4j2',
  'cmtq1dl9o0003qgowjp04ohxi'
);
DELETE 3
 owned = 0
 public_count = 74860
 users = 1
 live_sessions = 5
```

No leftover probe rows. Real user still signed in.

---

## E. Hover

Public decklist `61e4dd61-dd12-4870-8668-2fbbc391eb7d` (`Dolls? Never heard of 'em 2`).

| Check | Expected | Actual (dev and prod) | Pass |
|---|---|---|---|
| Payload contains `card-images.netrunnerdb.com` | yes | CDN_COUNT **25** (identity + 24 displayed slots; 25 `DecklistCard` rows including identity) | **PASS** |
| Identity title inside hover wrapper with `src` + CardReference | yes | RSC: `"src":"https://card-images.netrunnerdb.com/v2/large/35013.jpg","alt":"MuslihaT: Multifarious Marketeer","children":[… "code":"muslihat_multifarious_marketeer" …]`. Visible HTML: `Identity: <span><span><a …>MuslihaT: Multifarious Marketeer</a></span></span>` | **PASS** |
| At least one slot title in the same wrapper | yes | Visible: `<span><span><a … href="/cards/sure_gamble">Sure Gamble</a></span></span>` | **PASS** |
| `CardReference` still present | yes | `REF_COUNT 1` in payload (component id); names still wrapped | **PASS** |
| `curl -I` of `https://card-images.netrunnerdb.com/v2/large/35013.jpg` | 200 from NRDB CDN | `HTTP/1.1 200 OK` `Content-Type: image/jpeg` `Content-Length: 49025` | **PASS** |

**Not claimed:** mouse enter/leave, flip-to-left, z-40 vs CardReference z-50, touch-does-not-stick. No headless browser in this environment.

---

## F. Production

```
pnpm build
✓ Compiled successfully in 1981ms
Finished TypeScript in 2.6s
```

Routes include `/me`, `/decklists/new`, `/decklists/[id]/edit`, `/favorites`, `/cards/syntax` (all `ƒ` Dynamic).

```
pnpm start
✓ Ready in 106ms
```

Same load-bearing curls as C (and D/E subset):

| URL | Expected | Actual (prod) | Pass |
|---|---|---|---|
| `/cards?q=format:standard` | 613 | 613 | **PASS** |
| `/cards?format=standard` and advanced results | 613 | 613 | **PASS** |
| `/cards?q=format:standard%20banned:yes` and advanced `banned=1` | 29 | 29 | **PASS** |
| `/cards?q=format:standard%20banned:no` | 584 | 584 | **PASS** |
| `/cards?q=f:anarch+%7C+f:criminal` | 514 | 514 | **PASS** |
| `/cards?q=f:anarch+f:criminal` | 0 | 0 | **PASS** |
| `/cards?q=e:kala+ghoda` and `?pack=kala_ghoda` | 19 | 19 | **PASS** |
| `/cards?q=cy:mumbad` and `cy:10` | 114 | 114 | **PASS** |
| `/cards/syntax` prefix example / no `b:` sentence / `!` `OR` `title:` `set:` / first-wins | as C | same flags as dev | **PASS** |
| GET `/me` unsigned | 307 sign-in | 307 `/api/auth/signin` | **PASS** |
| GET `/decklists/phase12verifyprivate0001` unsigned | 404 | 404 | **PASS** |
| GET `/me` **with owner cookie** | 200, authenticated (no AUTH_TRUST_HOST failure) | **200**, h1 `My decks`, probe + create + copy names present | **PASS** |
| GET private id with cookie | 200 + name | 200 `PHASE12_VERIFY_PRIVATE_PROBE` | **PASS** |
| Public decklist hover URL | CDN + wrappers | CDN_COUNT 25, identity `src` in RSC, Sure Gamble nested spans | **PASS** |
| CDN `curl -I` | 200 | 200 image/jpeg | **PASS** |

Production session cookie still authenticates. No AUTH_TRUST_HOST-style failure.

Dev and prod servers were killed after the pass. Port 3000 freed.

---

## G. Out of scope still absent

| Check | Expected | Actual | Pass |
|---|---|---|---|
| No visible Banned picker on `/cards/advanced` | no `name="banned"`, no Banned label | `nameBanned: false`, `bannedLabel: []`, selects: type, faction, keyword, **pack**, side, format, order, pageSize; labels: Simple search, Card Name, Card Text, Matching, Type, Faction, Subtype, Set, Side, Format, Sort by, Cards per page | **PASS** |
| No hover on `/cards` list | no CardHoverImage / no CDN in list payload | `cardsHover: false`, `cardsCdn: false`; CardReference still used | **PASS** |
| No `/users/[id]` | 404 | GET `/users/cms4y4wf60000qg1spcaonb6q` → **404** | **PASS** |
| No visual deckbuilder | edit page is a form | owner edit `200`, has `<form>` + `name="name"`, no `<canvas>`, no `draggable=` | **PASS** |
| Prisma model still `Pack`; param still `pack=` | unchanged | `model Pack` in `schema.prisma`; `/cards?pack=kala_ghoda` → 19 | **PASS** |

`CardHoverImage` is imported only from `src/app/decklists/[id]/page.tsx` (and its own module).

---

## Verdict

No blockers found against `plans/PHASE_12_PLAN.md` Verification.

### Blockers

None.

### Nits

- Unsigned bound-action POSTs need `Origin: http://localhost:3000` under Next 16; missing Origin + curl `-F` treating `$@1` as a file produced `500 Failed to find Server Action`. The real form path with Origin is 303 to sign-in. Not a product bug.
- GET `/cards/syntax` matches `/Filtered by/i` because the precedence copy says “filtered by”, not because a facet banner is on that page.
- Required incremental `pnpm sync:decklists` grew public NRDB rows 74242 → 74860. Card search expected values were unaffected.

### Unprovable in this environment

- Type-ahead dropdown UX (caret, long-form `faction:`, `format:` / `e:` / `cy:` / `ban:` menus). Parser/token unit tests passed; curl cannot open the menu.
- Hover mouse-enter/leave, flip-to-left, vertical clamp, z-index vs right-click popover, touch-does-not-stick.
- Edit-page layout / human look of the form.
- Non-owner **second user** 404: only one User. Proven instead: unsigned 404, owner 200, and 404 when this user hits `/edit` on an NRDB row they do not own.
