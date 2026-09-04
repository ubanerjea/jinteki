# NRDB "Rotation" and "Tournament Legal" decklist filters — research report

Investigates two filter controls the repo owner noticed on netrunnerdb.com's
decklist search UI ("Rotation": 7th/6th/.../1st Rotation dropdown;
"Tournament Legal": Ignore/Yes/No dropdown), against primary sources only:
the live `netrunnerdb.com` site, the live `api.netrunnerdb.com` v3 public
API, `github.com/Null-Signal-Games/netrunner-cards-json`, and
`github.com/Null-Signal-Games/nrdbv2`. All findings below were fetched live
on 2026-08-10 (`curl`, not cached/remembered content) unless marked
otherwise. jinteki's own `prisma/schema.prisma` and `src/lib/nrdb/types.ts`
were read directly, not assumed.

## Important scope-setting finding, up front

**Live `netrunnerdb.com` is the "classic" site, not the `nrdbv2` Svelte
rewrite.** `curl https://netrunnerdb.com/` returns
`<title>Android: Netrunner Cards and Deckbuilder · NetrunnerDB</title>` and
Bootstrap/glyphicon markup (`/en/...` routes) — this is NRDB's long-standing
PHP/classic frontend, confirmed live. The decklist search form (`GET
https://netrunnerdb.com/en/decklists/search`, submitting to
`/en/decklists/find`) is this classic site's **own internal search
endpoint**, not the public v3 JSON:API at `api.netrunnerdb.com`.

`nrdbv2` (`Null-Signal-Games/nrdbv2`) is a separate, in-progress Svelte
rewrite. Its decklist search page,
`src/routes/decklists/search/+page.svelte` (fetched raw from the `main`
branch, 357 lines total), opens with a literal comment:
```
/**
 * TODO: Implement full decklist search functionality (compared to NRDBc)
 * - Fetch and display search results from NRDB API
 * ...
 */
```
and its `search()` handler is explicitly unfinished (`// Mock search
function - replace with actual decklist search logic`, plus multiple other
`// stub` / `// Example ... replace with real data` comments for the
packs/cycles lists and the `selectStartup`/`selectStandard`/etc. button
handlers, which are empty function bodies). It forwards form data verbatim
to `${NRDB_API_URL}/decklists?...` via `URLSearchParams`. **The field
names/option values in this file were almost certainly copied from the
classic site's real HTML form** (they match it exactly, byte-for-byte on
option labels — see below), not independently designed. Treat `nrdbv2` here
as a corroborating copy of the classic site's UI contract, not as evidence
that these filters work against the public v3 API — they don't (see next
section).

## 1. "Rotation" filter

### What it means, game-mechanically

Standard is Netrunner's rotating-card-pool format. Periodically NSG (Null
Signal Games, the game's steward) retires ("rotates out") some of the
oldest card cycles from Standard's legal pool; each such event is a numbered
"rotation" (1st through 7th, so far). This is confirmed as an explicit,
named domain concept — not just a UI label — by the source-of-truth repo's
root-level `rotations.json` file.

**Primary source:** `netrunner-cards-json` repo root,
`rotations.json` (fetched raw from `main`, full content, 7 entries):
```json
[
  { "code": "rotation-2017", "date_start": "2017-10-01", "name": "First Rotation",  "rotated": ["core","genesis","spin"] },
  { "code": "rotation-2018", "date_start": "2018-12-21", "name": "Second Rotation", "rotated": ["core","genesis","spin","core2","terminal-directive"] },
  { "code": "rotation-2019", "date_start": "2019-12-27", "name": "Third Rotation",  "rotated": [...7 codes] },
  { "code": "rotation-2021", "date_start": "2021-04-09", "name": "Fourth Rotation", "rotated": [...11 codes] },
  { "code": "rotation-2022", "date_start": "2022-08-05", "name": "Fifth Rotation",  "rotated": [...13 codes] },
  { "code": "rotation-2023", "date_start": "2023-08-11", "name": "Sixth Rotation",  "rotated": [...15 codes] },
  { "code": "rotation-2025", "date_start": "2025-04-24", "name": "Seventh Rotation","rotated": [...21 codes] }
]
```
Each entry's `rotated` array is **cumulative** — the full list of pack-cycle
codes no longer legal in Standard as of that rotation's `date_start`, not
just the newly-rotated ones. There is no 2020 or 2024 entry — rotations
don't happen on a fixed yearly cadence (there's a gap 2019→2021 and
2023→2025).

### What data backs it in NRDB's live v3 public API

The public API models this as a `card_pools` resource — **a different NRDB
resource from `card_sets` (packs) and `card_cycles`** (see the "naming
collision" warning in the Relevance section below).

**Primary source:** `curl -g
'https://api.netrunnerdb.com/api/v3/public/card_pools?filter[format_id]=standard'`
(live, 2026-08-10) returns 10 `card_pools` rows for Standard, each shaped
`{ id, type: "card_pools", attributes: { name, format_id, card_cycle_ids,
updated_at, num_cards } }`. The 7 rotation-numbered ones:

| `card_pools.id`  | `attributes.name` | `num_cards` |
|---|---|---|
| `rotation_2017` | First Rotation | 1181 |
| `rotation_2018` | Second Rotation | 1119 |
| `rotation_2019` | Third Rotation | 1088 |
| `rotation_2021` | Fourth Rotation | 935 |
| `rotation_2022` | Fifth Rotation | 896 |
| `rotation_2023` | Sixth Rotation | 853 |
| `rotation_2025` | Seventh Rotation | 547 |

Plus **three non-rotation-numbered pools also present in the same list**:
`pre_rotation` ("Pre Rotation", 1224 cards, the pool before any rotation
existed), `rotation_2020` (**named "Salvaged Memories", not "Fourth
Rotation"** — an addition-only card-pool update between the 3rd and 4th
numbered rotations, 1106 cards), and the format's *currently active* pool
`standard_2026_vantage_point` ("Standard 2026 - Vantage Point", 613 cards —
confirmed as `Format.active_card_pool_id` for `standard`, see below). **The
"Nth Rotation" ordinal is therefore not derivable by counting/sorting
`card_pools` rows chronologically** — `rotation_2020` breaks that sequence,
and the currently-active pool isn't labeled with a rotation ordinal at all.
The ordinal mapping (`rotation_id=1..7` → `rotation_2017..rotation_2025`) is
only reliably obtainable from `rotations.json`'s own array order /
`name`/`code` fields (or by string-matching `card_pools[].attributes.name`
against `"...Rotation"$`), not from any numeric field in the API itself —
**no `rotation` or `card_cycle_rotation` numeric field exists anywhere in
the v3 API's `card_pools`, `snapshots`, or `formats` resources** (confirmed
by reading every attribute key returned live for all three, listed below).

`GET /formats/standard` (live) returns, among other fields:
```json
"active_card_pool_id": "standard_2026_vantage_point",
"active_restriction_id": "standard_ban_list_26_03",
"active_snapshot_id": "standard_34",
"snapshot_ids": [...37 ids, "standard_0".."standard_36" plus "sunset_01"],
"restriction_ids": [...37 ids]
```
`GET /snapshots/standard_34` (the currently active snapshot, live) returns:
```json
{ "format_id": "standard", "active": true,
  "card_cycle_ids": [...], "card_set_ids": [...],
  "card_pool_id": "standard_2026_vantage_point",
  "restriction_id": "standard_ban_list_26_03",
  "num_cards": 613, "date_start": "2026-03-13" }
```
This matches the source-of-truth shape a prior research pass on this
project already established from `v2/formats/standard.json` in
`netrunner-cards-json` — confirmed again here directly against the live
source file (`main` branch): each format's file is `{ id, name, snapshots:
[{ card_pool_id, date_start, id, restriction_id?, active? }] }`, e.g.:
```json
{ "card_pool_id": "pre_rotation", "date_start": "2012-09-06", "id": "standard_0" },
...
{ "card_pool_id": "standard_2026_vantage_point", "date_start": "2026-03-13",
  "id": "standard_36", "restriction_id": "standard_ban_list_26_03", "active": true }
```
(exact `active: true` snapshot confirmed at line ~218 of the fetched file —
matches `active_snapshot_id: "standard_34"`... **note**: the v3 API's
`active_snapshot_id` value `"standard_34"` and the raw JSON file's own `id`
numbering for its final/active entry did not match on direct visual count
in this pass — the file lists snapshots through `standard_36`; this
discrepancy was not resolved and should be treated as **unverified** rather
than guessed at. It does not affect the `card_pool_id`/`rotation` findings
above, which were confirmed independently via the live API.)

The `netrunner-cards-json` per-format card-pool file
(`v2/card_pools/standard.json`, fetched raw, `main` branch) mirrors the live
API's `card_pools` list exactly in content (same ids, same `name` values,
same `card_cycle_ids`), confirming this file is the source the API's
`card_pools` resource is generated from — each entry shaped `{
card_cycle_ids, card_set_ids, format_id, id, name }`.

### Rotation as a query filter — classic site vs. public API

**Live classic-site HTML** (`GET https://netrunnerdb.com/en/decklists/search`,
fetched raw, 2026-08-10) contains this exact form control:
```html
<label for="rotation_id">Rotation</label>
<select class="form-control" id="rotation_id" name="rotation_id">
    <option value="">Ignore</option>
    <option value="7">Seventh Rotation</option>
    <option value="6">Sixth Rotation</option>
    <option value="5">Fifth Rotation</option>
    <option value="4">Fourth Rotation</option>
    <option value="3">Third Rotation</option>
    <option value="2">Second Rotation</option>
    <option value="1">First Rotation</option>
</select>
```
inside `<form method="GET" action="/en/decklists/find" ...>`. So the real
param name is **`rotation_id`**, values `"1"`–`"7"` (matching the seven
`rotations.json`/`card_pools` ordinals above), submitted against
`https://netrunnerdb.com/en/decklists/find` (the classic site's own
non-public search endpoint) — **not** `api.netrunnerdb.com`.

Confirmed working live: `curl -g
'https://netrunnerdb.com/en/decklists/find?rotation_id=7'` → HTTP 200, and
every result row's rendered rotation badge (`<span class="glyphicon
glyphicon-repeat"></span> Seventh Rotation`, etc. — the "Second Rotation" /
"Seventh Rotation" text visible per decklist row) was one of the 7 named
rotations (30 badge occurrences on the page, all matching one of the 7
labels, none blank/other) — i.e. the filter demonstrably narrows results by
rotation ordinal.

**Tried directly against the public v3 API** and it does **not** work: `curl
-g 'https://api.netrunnerdb.com/api/v3/public/decklists?filter[rotation_id]=7&page[size]=1'`
→ `{"errors":[{"code":"internal_server_error","status":"500", ...}]}`
(live, 2026-08-10; the same unfiltered call, and a `filter[faction]=anarch`
call, both succeed with 200 and normal JSON — so the endpoint itself is
healthy, only this specific filter param 500s). `rotation_id` also does not
appear anywhere in `curl https://api.netrunnerdb.com/api/docs` (fetched raw
HTML, `grep`-searched for `rotation`, `card_pool_id`, `is_legal`, `mwl_code`,
`tournament` — zero matches). The docs' only *documented* decklist filters
are, verbatim (from the docs page's own link list):
"Filter - Get Decklists for a given faction", "...containing all supplied
Card ids", "...excluding all supplied Card ids", "...with a particular
Identity". **Conclusion: `rotation_id` is real and functional against the
classic site's internal `/en/decklists/find` endpoint, but is not a
supported/documented public v3 API filter today** (at minimum it 500s as of
this check; whether that's "not implemented" vs. "a live bug" could not be
determined from outside).

Also worth noting: a decklist's *displayed* rotation badge does not
necessarily reflect the *current* rotation — filtering `is_legal=0` (see
next section) still returned decklists tagged e.g. "Second Rotation" (a
2018-era card pool) alongside decks explicitly marked as having been played
in a "2026 Megacity Championship" — i.e. the badge reflects whichever
rotation the decklist was tagged/published under, not necessarily whether
it's rotation-legal today.

## 2. "Tournament Legal" filter

### What it means

Not explicitly defined in prose anywhere found in this pass (no tooltip/
help text near the control on the classic site's search form, and the
public API docs don't mention it at all — see below). Observationally, from
the classic site's live results: filtering `is_legal=0` returns decklists
that **are** tagged as tournament-attended (e.g. carry a `<span
class="text-success"><span class="glyphicon glyphicon-certificate">
2026 Megacity Championship</span>` badge) but are **not** currently
tournament-legal — consistent with "does this decklist's card list +
identity conform to the *currently active* format snapshot's card pool and
banlist verdicts," evaluated as of query time, independent of whether it
was played in a real past tournament. This interpretation is inferred from
observed behavior, not confirmed from any NRDB prose definition —
**flagged as not directly verified**.

### What data backs it

**Not a stored field on the decklist resource.** A real decklist fetched
from the public v3 API (`curl -g
'https://api.netrunnerdb.com/api/v3/public/decklists?page[size]=1'`, live)
has this full, exact attribute set on `data[0].attributes`:
```
user_id, follows_basic_deckbuilding_rules, identity_card_id, name, notes,
tags, side_id, created_at, updated_at, faction_id, card_slots, num_cards,
influence_spent
```
No `is_legal`, `tournament_legal`, `legal`, or `rotation_id` field is
present. `follows_basic_deckbuilding_rules` (a boolean) is the only
legality-adjacent stored attribute, and it means something narrower —
basic deckbuilding-rule conformance (correct card counts, influence, etc.),
not "legal under the currently active banlist."

**Live classic-site HTML** confirms the real filter/param:
```html
<label for="is_legal">Tournament Legal</label>
<select class="form-control" id="is_legal" name="is_legal">
    <option value="">Ignore</option>
    <option value="1">Yes</option>
    <option value="0">No</option>
</select>
```
Same form (`/en/decklists/search` → `/en/decklists/find`). Confirmed working
live: both `curl -g
'https://netrunnerdb.com/en/decklists/find?is_legal=1'` and `...is_legal=0`
returned HTTP 200 with visibly different result sets (spot-checked the
`is_legal=0` page: results include decks tagged with old rotations like
"Second Rotation" mixed with recent 2026 tournament badges, consistent with
"currently not legal despite being a real, dated, tournament-played deck").

There is also a **third, related but distinct filter** on the same live
form, not mentioned by the task but directly adjacent and worth recording
since it's easy to conflate with "Tournament Legal":
```html
<label for="mwl_code">Legality</label>
<select class="form-control" id="mwl_code" name="mwl_code">
    <option value="">Ignore</option>
    <option value="standard-balance-update-26-08">Standard Balance Update 26.08</option>
    <option value="standard-ban-list-26-05">Standard Ban List 26.05</option>
    ... (full history back to "NAPD_MWL_1.0")
</select>
```
`mwl_code` lets you filter by a **specific named restriction/ban-list
snapshot** (jinteki's `Restriction.id`/`.name` equivalent), whereas
`is_legal` is a **boolean** ("does this decklist pass the currently active
snapshot's rules"), and `rotation_id` filters by **card-pool ordinal**
only. These are three independent, composable filters on the live form, not
variants of the same thing.

**Tried directly against the public v3 API** — same result as `rotation_id`:
`curl -g
'https://api.netrunnerdb.com/api/v3/public/decklists?filter[is_legal]=1&page[size]=1'`
and `...filter[is_legal]=0...` and `...filter[mwl_code]=standard-ban-list-25-10...`
all return the same `500 Internal Server Error` JSON body, live,
2026-08-10. None of `is_legal`, `mwl_code`, or `tournament` appear in
`api.netrunnerdb.com/api/docs`'s HTML at all. **Conclusion: "Tournament
Legal" is computed server-side by the classic site's own internal search
backend (`/en/decklists/find`) — almost certainly by evaluating each
decklist's `card_slots`/`identity_card_id` against the format's currently
active card pool + active restriction's `verdicts` at query time — but this
computation is not exposed as a public v3 API filter, and no precomputed
boolean is returned on the decklist resource itself for reuse.** How
exactly the classic backend computes it (e.g. does it also account for
per-card `restrictions` legality per the `Card.raw.attributes.restrictions`
blob jinteki already syncs) could not be verified from outside — flagged as
unverified.

## 3. `nrdbv2`'s own copy of these filters (for context, not as an independent source)

`src/routes/decklists/search/+page.svelte` (fetched raw, `main` branch,
full 357-line file read) defines, verbatim:
```ts
const rotation_options = [
    { value: "", label: "Ignore" },
    { value: "7", label: "Seventh Rotation" },
    { value: "6", label: "Sixth Rotation" },
    { value: "5", label: "Fifth Rotation" },
    { value: "4", label: "Fourth Rotation" },
    { value: "3", label: "Third Rotation" },
    { value: "2", label: "Second Rotation" },
    { value: "1", label: "First Rotation" },
];

const tournament_legality = [
    { value: "", label: "Ignore" },
    { value: "1", label: "Yes" },
    { value: "0", label: "No" },
];

const legality = [   // this is the mwl_code equivalent
    { value: "", label: "Ignore" },
    { value: "standard-ban-list-25-10", label: "Standard Ban List 25.10" },
    ... // same history as the classic site's mwl_code list
];
```
rendered as `<select name="rotation_id" ...>`, `<select name="is_legal"
...>`, `<select name="mwl_code" ...>` respectively — identical field names
and near-identical option lists/order to the classic site (confirming these
were copied from it, not independently reverse-engineered). Its `search()`
handler builds a `URLSearchParams` from the raw `FormData` and calls
`fetch(`${NRDB_API_URL}/decklists?` + parameters.toString())` — i.e. it
would send `filter`-less bare `rotation_id=7&is_legal=1&...` params (not
even wrapped in `filter[...]`) straight to the public v3 API, which (per
above) doesn't support any of them regardless of wrapping. Given the file's
own "Mock search function" comment, this page is not a working
implementation today — it's a scaffold with copied UI chrome and an
unfinished/untested fetch call.

## Relevance to jinteki

### Current jinteki schema/sync coverage (read directly from source, not assumed)

- `prisma/schema.prisma`: `Format { id, name, activeRestrictionId, raw,
  description }`, `Restriction { id, name, formatId, dateStart, raw }`.
  **No `Pack`/`CardPool`/`CardCycle`/`Snapshot` model exists for NRDB's
  `card_pools` or `snapshots` resources at all.**
- `prisma/schema.prisma`'s `Pack` model (`code`, `name`) maps to NRDB's
  `card_sets` resource — confirmed by `src/sync/sync-factions-packs.ts`'s
  own header comment: *"NRDB's v3 API calls packs `card_sets` (e.g. `Core
  Set`, `Kala Ghoda Shard`) - distinct from `card_cycles`, which group
  multiple card_sets together."* **This is a third, different NRDB concept
  from `card_pools`** (the rotation-numbered format snapshots). jinteki's
  `Pack` sounds superficially like it could be "the same idea" as
  `card_pools` — it is not; there is a real naming-collision risk here if
  a future dev builds a "rotation" feature and reaches for the existing
  `Pack` model thinking it already covers this.
- `src/lib/nrdb/types.ts`'s `FormatAttributes` interface **already
  declares** `active_card_pool_id: string | null` (line 148) — the sync
  code fetches this field from NRDB today (it's part of the raw JSON:API
  resource captured wholesale) but `mapFormat()` in
  `src/sync/sync-restrictions.ts` only extracts `id`, `name`,
  `activeRestrictionId`, and `raw` — **`active_card_pool_id` is present in
  `Format.raw` (JSONB) for every synced format row already, just not
  promoted to its own column**, exactly the same pattern this project
  already used once for `active_restriction_id` → `Format.activeRestrictionId`.
- No sync script touches the `/card_pools` or `/snapshots` v3 API
  endpoints. `SyncType` enum (`schema.prisma`) has no `CARD_POOLS` or
  `SNAPSHOTS` variant.
- `Decklist.raw` (JSONB) stores every decklist's full NRDB v3 resource — but
  per the API attribute dump above, that resource **never contained** an
  `is_legal`/`tournament_legal`/`rotation_id` field to begin with, on any
  decklist, synced or not. This isn't a promotion opportunity the way
  `active_card_pool_id` is — the data genuinely isn't there.

### "Rotation" on `/formats` or `/formats/[id]`

Fully supportable with data jinteki already has *most* of the pieces for,
plus one small new sync:

- **Cheap, no-new-sync option**: `Format.raw.attributes.active_card_pool_id`
  is already captured (see above) — a `/formats/[id]` page could read it out
  of the existing JSONB today with zero schema change, same technique
  `src/lib/search/format-cards.ts` already uses for
  `raw.attributes.verdicts` per the phase-6/format-descriptions build
  report. This gets you "which card pool is currently active" but not the
  human-readable "Nth Rotation" label or rotation history, since (per
  Finding 1) that label only lives on the `card_pools` resource itself
  (`attributes.name`), not on `Format`.
- **Fuller option**: add a `CardPool` model (or extend `Pack`'s sibling
  set — name it something that avoids colliding with the existing `Pack` =
  `card_sets` mapping, e.g. `CardPool`) synced from `GET /card_pools`, plus
  a new sync step analogous to `sync-restrictions.ts`. This is what's
  needed to render a real "Standard rotation history" list (à la NRDB's own
  `/en/rotation` page) or to label the active pool as "Seventh Rotation" on
  `/formats/standard`. **Caveat found in this research**: the "Nth
  Rotation" ordinal is not a field anywhere in the API — it has to be
  derived either by string-matching `card_pools.attributes.name` against
  `.*Rotation$` (fragile if NSG ever renames something, as `rotation_2020`
  = "Salvaged Memories" already shows can happen) or by syncing
  `rotations.json` from `netrunner-cards-json` directly (not an API
  resource — would need its own fetch, since it's a repo file, not part of
  `api.netrunnerdb.com`). Recommend the latter if an exact "7th Rotation"
  label is wanted, since it's the actual source-of-truth file and avoids
  the string-matching fragility.
- A `/decklists` "Rotation" search filter (mirroring the live site's
  dropdown) would need `Decklist` rows to be joinable against "which
  card_pool was active when." Nothing on the `Decklist` resource itself
  carries a card-pool reference (confirmed above — the attribute list has
  no such field). jinteki would have to compute it itself: take each
  decklist's cards, and for a given target `card_pools` row, check every
  card's pack against that pool's `card_cycle_ids` — i.e. a real
  server-side computation jinteki would own, not something NRDB hands over
  precomputed, matching the "Tournament Legal" situation below.

### "Tournament Legal" as a `/decklists` filter

**No NRDB-side boolean to sync — this would be entirely jinteki's own
computation if built.** Confirmed above: no decklist resource, synced or
live, carries an `is_legal`/`tournament_legal`/similar field; the public v3
API's `filter[is_legal]=...` 500s and isn't documented; only the classic
site's non-public `/en/decklists/find` computes it, and how it computes it
internally isn't observable from outside. If jinteki wants this feature it
would need to implement its own legality check, using data it can already
partially assemble:
- `Decklist.raw.attributes.card_slots` (card code → quantity) and
  `identityCode` — already synced, per row.
- `Format.activeRestrictionId` → `Restriction.raw.attributes.verdicts`
  (`banned`/`restricted`/`points`/`universal_faction_cost`) — already
  synced (this is exactly the data `src/lib/restrictions.ts` and
  `src/lib/search/format-cards.ts` already read, per the
  format-descriptions build report).
- **Missing piece**: which cards are in the format's *currently active card
  pool* at all (rotation-legal), which requires the `card_pools`/
  `active_card_pool_id` data this project doesn't sync yet (see previous
  section) — without it, jinteki could check ban-list legality but not
  rotation legality, so a "Tournament Legal" flag built without that piece
  would be a narrower check than NRDB's own (verdicts-only, not
  pool-membership-aware).
- `follows_basic_deckbuilding_rules` (already synced, per decklist) covers
  the "is this even a structurally valid decklist" half NRDB itself
  separates out — worth combining with a computed pool/banlist check rather
  than treated as equivalent to "Tournament Legal."

In short: building a real "Tournament Legal" decklist filter is a
build-it-yourself feature for jinteki (compute per-decklist, per-format
legality against `Restriction.verdicts` + a not-yet-synced `card_pools`
membership set), not a value to pull from NRDB — the two live NRDB
implementations of it (classic site's internal endpoint, `nrdbv2`'s
unfinished stub) both agree it isn't exposed anywhere jinteki could sync
from directly.

## What could not be verified (explicitly flagged)

- The exact algorithm the classic site's `/en/decklists/find` uses to
  compute `is_legal` (banlist-only? pool-membership-aware? both?) — not
  observable from outside; only its externally-visible behavior (filters
  narrow results, `is_legal=0` includes decks with old rotation badges) was
  confirmed.
- Whether `filter[rotation_id]`/`filter[is_legal]`/`filter[mwl_code]` 500ing
  on the public v3 API is a permanent "not supported" or a transient bug —
  could not be determined from outside; only the observed 500 + absence
  from `/api/docs` was confirmed, live, on 2026-08-10.
- A discrepancy between `formats/standard`'s `active_snapshot_id`
  (`"standard_34"`) and the raw `netrunner-cards-json` file's own snapshot
  numbering visually appearing to run through `standard_36` — flagged
  above, not resolved, does not affect the rotation/card_pool conclusions
  which were confirmed independently.
- No prose definition of "Tournament Legal" was found on NRDB's site itself
  (no tooltip, no glossary hit in this pass) — the meaning given above is
  inferred from observed filter behavior only.
