# Advanced Card Search: "Card title"/"Card text" non-functional under `start:remote` — Research

## 0. Framing and headline finding

Task framing note: the user wrote "pnpm remote:start"; the real script in `package.json` is
`start:remote` (`"start:remote": "dotenv -e .env.remote -- next start -p 3001"` —
**[jinteki source]**, `package.json`). No `remote:start` script exists anywhere in the repo
(checked directly). This report treats `start:remote` as the intended target; there is no other
candidate script.

**Headline finding, stated plainly up front: the bug as described did not reproduce.** A
side-by-side test — a genuinely fresh `pnpm build` + `pnpm start:remote` production instance
against the *same* running dev instance, both pointed at the same live local Postgres — produced
byte-identical filtering results for Card title, Card text, and every combination/fuzzy variant
tried. No environment-conditional code path exists anywhere in the relevant source that could
explain a title/text-specific dev-vs-prod difference. The "different database" explanation is also
directly ruled out: `.env` and `.env.remote` point at the exact same `localhost:5432/jinteki`
database, and this is confirmed as *intentional design*, not incidental, by `agent-reports/phase-9.md`
itself (quoted in §2 below).

**Confidence level: real-instance-tested, not merely code-read, for everything reported here** —
see §3 for the exact commands and outputs. What this does *not* cover, and could not cover in this
environment (no headless/interactive browser available — the `claude-in-chrome` skill reported no
Chrome extension connected this session): genuine mouse-click/keyboard interaction in a real
browser, and JS console errors during hydration. §5 discusses why that gap is unlikely to explain
the report anyway, given the fields in question are plain, un-JS'd `<input>` elements, and offers
the concrete alternative explanations most likely to account for what the user saw.

**Update (2026-08-10), see §8**: the repo owner clarified their original test was against the
*real Tailscale Funnel public URL* (`https://andromeda.tailcb2bd0.ts.net`), not `localhost:3001`
directly — a materially different code path (real HTTPS termination, a real reverse-proxy hop,
`AUTH_URL`/`AUTH_TRUST_HOST` as actually set for that process) that this report's original §3 did
not test. §8 re-runs the same test matrix through the real Funnel URL. **Verdict unchanged: the bug
still did not reproduce.** Every query returned byte-identical response bodies between the Funnel
URL and direct `localhost:3001` (same running `start:remote` process), and the server log was
silent (no errors, no auth warnings) throughout. Both the localhost-only path (original §3) and the
real Funnel path (§8) have now been tested, and neither reproduces the bug. The one gap that
remains — a real interactive browser session against the Funnel URL — is still open; no
`claude-in-chrome` connection was available in this session either (re-confirmed in §8).

Source tags used below: **[jinteki source]** = read directly from this repo this session;
**[directly-verified]** = a real command run and real output observed this session (curl against a
real running server, a real `pnpm build`/test run, etc.); **[code-read, not runtime-confirmed]** =
a claim based on reading source without a corresponding live test.

---

## 1. Where title/text live, and how they differ from faction/side/pack (code read)

**[jinteki source]**, `src/lib/search/cards-advanced.ts`:

- `parseAdvancedCardSearchParams()` (lines 94–136) reads `title`/`text` as `firstParam(input,
  "title")?.trim()` / same for `text` (lines 97–98) — plain string params, no special parsing.
- `textCondition()` (lines 144–153) builds `ILIKE` (fuzzy off) or `(ILIKE OR <%)` (fuzzy on)
  conditions for whichever of `title`/`text` is present (lines 165–170 in `searchCardsAdvanced()`).
- Faction/side/type/keyword/pack instead go through `buildFacetConditions()`
  (`src/lib/search/cards.ts` lines 141–215), a completely separate code path (`=` / `= ANY(...)` /
  array-overlap / JSONB containment, depending on facet) — genuinely different SQL shape from the
  ILIKE path, which is exactly why the user's report singles out title/text as the odd ones out. No
  part of either path branches on `process.env` or anything else environment-dependent.

**Form side**, `src/app/cards/advanced/page.tsx`:

- Card Name (line 152–165) and Card Text (line 167–180) are **plain, server-rendered `<input
  type="text">` elements inside a plain `<form method="get" action="/cards/advanced/results">`**
  (form starts line 151). No `"use client"` boundary wraps them, no `onChange`/`onSubmit`/
  `onKeyDown` handler is attached to either input or the form. A no-JS browser would submit this
  form exactly the same way a JS-enabled one does — native browser GET-form submission, not React
  event handling.
- By contrast, Faction/Type/Subtype/Pack use `<FacetPicker>` (`src/components/facet-picker.tsx`,
  `"use client"` at line 1) — a genuine client component with its own hydration lifecycle, though
  by its own design (comment lines 8–22) it degrades to a plain `<select multiple>` pre-hydration
  and only ever emits hidden `<input>`s into the same surrounding plain form; it does not fetch or
  hold state that survives submit.

This is backwards from the most common shape of a "works in dev, breaks in prod" hydration bug:
the fields the user says are broken (title/text) are the ones with **zero** client JS involved,
while the fields the user says work fine (faction/pack) are the ones that actually go through a
client-hydration boundary. If hydration-timing/minification were the cause, the client components
would be the more likely casualty, not the plain inputs — this alone made the hydration-boundary
hypothesis low-probability going in, and the direct testing in §3 confirms both paths behave
identically regardless.

**Results page**, `src/app/cards/advanced/results/page.tsx` — also a plain async server component
(no `"use client"`), `export const dynamic = "force-dynamic"` (line 13), same as the form page
(line 11 of `page.tsx`). `CardResultsList`/`ResultsControls`/`PaginationNav` (the components that
render the result count and list) are also plain server-rendered output — `results-controls.tsx`
and `card-results.tsx` have no `"use client"` directive, no `useEffect`, no client-side
`URLSearchParams` reconstruction that could silently drop `title`/`text` after the initial render.

## 2. "Different database" — checked directly and ruled out

**[jinteki source]**, redacted comparison of `DATABASE_URL` in `.env` vs `.env.remote`:

```
.env:        DATABASE_URL="postgresql://USER:PASS@localhost:5432/jinteki?schema=public"
.env.remote: DATABASE_URL="postgresql://USER:PASS@localhost:5432/jinteki?schema=public"
```

Identical host, port, and database name — both point at the same `jinteki-postgres-1` Docker
container (**[directly-verified]**, `docker ps` showed it `Up 21 hours (healthy)`,
`0.0.0.0:5432->5432/tcp`).

This is not incidental — `agent-reports/phase-9.md` (§B, "Two-process local setup") documents this
as the *deliberate design* of `.env.remote`: *"`.env.remote.example` ... `DATABASE_URL` (same value
as `.env` — same shared Postgres)"*. The two processes (`pnpm dev` on 3000, `pnpm start:remote` on
3001) are meant to run side by side against one shared local database for local verification, per
that same report's own two-process testing. So for a same-machine `start:remote` run (which is what
the task describes and what this report tests), there is no different-database explanation
available at all — ruled out with direct evidence, not inferred.

(Caveat: if the user was instead testing through the actual Tailscale Funnel URL from a genuinely
separate machine per `plans/PHASE_9_PLAN.md`/`plans/REMOTE_ACCESS_PLAN.md`'s full remote-access
design, that's a different scenario this report didn't test — but the task's own framing
["pnpm start:remote... requires a prior pnpm build"] describes the same-machine local two-process
setup, which is what's tested below.)

## 3. Direct side-by-side test — commands and results

**Setup [directly-verified]**:
- A `next dev` instance was already running on port 3000 before this session started (pre-existing,
  not started by this investigation — confirmed via its own log: `next-development.log`, no errors/
  warnings during the test window).
- Ran `pnpm build` fresh (clean rebuild, not reusing a stale `.next/`): succeeded, `✓ Compiled
  successfully`, all routes including `/cards/advanced` and `/cards/advanced/results` listed as `ƒ
  (Dynamic)`.
- Ran `pnpm start:remote` (`dotenv -e .env.remote -- next start -p 3001`): started cleanly, `✓ Ready
  in 89ms`, no errors in its log.
- `git status --short` was clean throughout (no uncommitted changes) — both servers ran the exact
  same source (HEAD, `main`), confirmed via `git log` showing `src/lib/search/cards-advanced.ts` and
  `src/app/cards/advanced/` last touched 2026-08-04, before this session.

**Test matrix, `curl` against both ports for the exact same query strings**:

| Query | Dev (3000) | Remote/prod (3001) | Match? |
|---|---|---|---|
| *(no params — baseline)* | 2054 cards found | 2054 cards found | Yes |
| `?title=Sure+Gamble` | 1 card found (confirmed "Sure Gamble" text present in body) | 1 card found (confirmed "Sure Gamble" text present in body) | Yes |
| `?text=gain+4%5Bcredit%5D` | 21 cards found | 21 cards found | Yes |
| `?title=Sure&text=credit` (both fields, AND semantics) | 4 cards found | 4 cards found | Yes |
| `?title=Sure+Gambel&fuzzy=1` (typo, fuzzy on) | 1 card found | 1 card found | Yes |
| `?title=Sure+Gambel` (same typo, fuzzy off) | 0 cards found | 0 cards found | Yes |
| `/cards/advanced?title=Sure+Gamble&text=gain` (form pre-fill / "Edit search" round trip) | `value="Sure Gamble"` / `value="gain"` in the rendered `<input>`s | identical | Yes |

Every row is identical between dev and the freshly built production instance. This directly
exercises: plain-substring title filtering, plain-substring text filtering, the two fields ANDed
together, fuzzy-on typo tolerance, fuzzy-off precision (correctly returning 0, not silently
matching), and the form's own value-restore path — the full surface area the report describes as
broken.

**Response headers** [directly-verified] were also compared (`Cache-Control`, `Vary`) — dev sends
`Cache-Control: no-cache, must-revalidate`, prod sends `Cache-Control: private, no-cache, no-store,
max-age=0, must-revalidate` (prod's is strictly *more* aggressive about not caching, not less), so
there's no caching explanation for prod serving a stale/unfiltered result either.

**Unit tests** [directly-verified]: `pnpm vitest run src/lib/search/cards-advanced.test.ts` → 36/36
passed, exercising `parseAdvancedCardSearchParams()` and `searchCardsAdvanced()` directly, before
and independent of the manual curl matrix above.

**Cleanup**: the `start:remote` process was stopped via its own PID (found through `netstat`, not a
broad kill) after testing; the pre-existing dev server on port 3000 was left untouched throughout
and confirmed still serving `200` afterward.

## 4. Environment-conditional code search (code read)

`grep -rn "NODE_ENV" src/` returned exactly one hit in the entire `src/` tree:
`src/lib/prisma.ts:12`:

```ts
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

This is the standard Next.js dev-mode Prisma Client singleton pattern (comment above it says as
much) — it exists purely to avoid exhausting Postgres connections across `next dev` hot reloads. In
production it just skips caching the client on `globalThis` and constructs one `PrismaClient` for
the life of the single `next start` process — normal, correct, and unrelated to *what SQL any given
query produces*. It's the same `prisma` instance and the same `searchCardsAdvanced()` code path
regardless of `NODE_ENV`; this branch affects connection lifecycle, not filtering logic. No other
`process.env` branch, dynamic import, or dev-only code path exists anywhere in
`src/lib/search/cards-advanced.ts`, `src/app/cards/advanced/page.tsx`,
`src/app/cards/advanced/results/page.tsx`, `src/components/facet-picker.tsx`,
`src/components/simple-search-box.tsx`, `src/components/results-controls.tsx`,
`src/components/card-results.tsx`, or `src/components/pagination-nav.tsx` (all read in full this
session).

No `middleware.ts` exists in the repo (checked via `find`), so there's no request-level
interception that could differ by environment either.

## 5. If the report is real: most likely explanations, and what would confirm each

Given §§1–4 found no reproducible difference and no code-level cause, here are the concrete,
falsifiable candidates for what the user may actually have hit, roughly in order of likelihood —
none of these were confirmed this session; they're offered as the next things to check, not
conclusions:

1. **Stale production build.** `start:remote` does not build; it only starts whatever is already in
   `.next/`. If the user ran `pnpm start:remote` without a `pnpm build` immediately before it (or
   built once, then edited source and re-tested `start:remote` without rebuilding), they'd be
   serving an old build. The task description already flags this as a known gotcha ("note this
   requires a prior `pnpm build`"), which suggests this was considered — but it's still the single
   most common real-world cause of "identical dev/prod code, different prod behavior," and is worth
   explicitly re-confirming with the user: did they rebuild immediately before the failing test, on
   the same source tree as the working dev test? **What would confirm/refute it**: `stat .next/BUILD_ID`
   timestamp vs. `git log -1` on the relevant source files, exactly as this report checked before
   testing (§3).
2. **Testing through the real Funnel/Tailscale path, not localhost:3001 directly.** If the "remote"
   test was actually done from a second, physically separate machine hitting the public Funnel
   hostname (`AUTH_URL=https://andromeda.tailcb2bd0.ts.net` per `.env.remote`), there could be a
   proxying/tunnel-layer behavior (header rewriting, query-string handling through the tunnel) this
   report's direct-localhost test doesn't exercise. **What would confirm/refute it**: re-run the
   same title/text query matrix from §3 through the actual Funnel URL and compare.
3. **A genuine browser-only interaction bug**, not observable via `curl` (e.g. an actual JS error on
   the page during hydration that this environment's lack of a connected browser tool prevented
   checking). Judged low-probability per §1's structural argument (title/text have zero client JS
   attached — a plain GET form submits identically whether or not hydration ever completes), but not
   airtight without an actual browser. **What would confirm/refute it**: open the production
   instance in a real browser, open devtools console, type into Card title, click Search, and watch
   for thrown errors or a URL that doesn't change as expected.
4. **User expectation mismatch, not a bug**: Card title/Card text default to exact-substring,
   non-fuzzy matching (checkbox off) per `textCondition()`'s design (`cards-advanced.ts` lines
   9–16's own header comment: "with the checkbox off the query is a plain ILIKE substring match...
   That is the whole point of the advanced page"). A query with a typo, or one expecting the fuzzy
   ranking behavior of `/cards`' simple search, would correctly return fewer/no results with the
   Fuzzy checkbox off — which could read as "doesn't filter"/"non-functional" without being a bug at
   all. §3's fuzzy-off-with-typo test (0 results) shows this is working as designed, identically in
   both environments.

## 6. Recommendation

No code change is recommended from this investigation — no root cause was found, and the reported
behavior could not be reproduced. Recommend, in order:

1. Ask the user for the *exact* URL/host they tested against (`localhost:3001` directly, or the
   Funnel hostname) and whether a fresh `pnpm build` immediately preceded the failing `start:remote`
   test — this alone would settle explanations 1–2 above.
2. If still unresolved, get a screen recording or exact click-by-click repro, since this
   investigation's tooling (curl-only, no connected browser) cannot rule out explanation 3.
3. Treat this report's test matrix (§3) as the regression baseline: if the bug is reproduced again,
   re-run the same title/text/combined/fuzzy query matrix via curl against both ports first — it's
   fast, and would immediately localize the bug to either the query layer (this report found none)
   or something browser/tunnel-specific (not yet tested).

## 7. Key files referenced

- `package.json` (`start:remote` script, line with `"start:remote": "dotenv -e .env.remote -- next start -p 3001"`)
- `src/lib/search/cards-advanced.ts` (`parseAdvancedCardSearchParams`, `textCondition`,
  `searchCardsAdvanced` — lines 94–216)
- `src/lib/search/cards.ts` (`buildFacetConditions`, lines 141–215; `ORDER_COLUMNS`/`orderColumn`)
- `src/app/cards/advanced/page.tsx` (form, Card Name/Card Text rows lines 152–180)
- `src/app/cards/advanced/results/page.tsx` (results route)
- `src/components/facet-picker.tsx` (client component used by faction/type/keyword/pack, for
  contrast with title/text's plain inputs)
- `src/components/simple-search-box.tsx` (client component for the embedded `/cards` simple search
  box on the advanced page — not the same fields as the bug report, confirmed a separate `<form>`)
- `src/components/results-controls.tsx`, `src/components/card-results.tsx`,
  `src/components/pagination-nav.tsx` (checked for client-side URL reconstruction — none found)
- `src/lib/prisma.ts` (the one `NODE_ENV` branch in `src/`, unrelated to query behavior)
- `.env`, `.env.remote` (DATABASE_URL compared, identical)
- `agent-reports/phase-9.md` (source of the "same shared Postgres" design confirmation for
  `.env.remote`, and the origin of the `start:remote` script itself)
- `plans/PHASE_9_PLAN.md`, `plans/REMOTE_ACCESS_PLAN.md` (background on the two-process/Funnel
  design, relevant to explanation 2 in §5)

---

## 8. Follow-up (2026-08-10): testing via the real Tailscale Funnel URL

The repo owner clarified that the original bug report was based on testing through the actual
**Tailscale Funnel public URL** (`https://andromeda.tailcb2bd0.ts.net`), not `localhost:3001`
directly — explanation 2 from §5 above, which the original report explicitly flagged as untested.
This section closes that gap: same running `start:remote` production process, tested both via the
real Funnel hostname (real HTTPS termination, real reverse-proxy hop, real `Host` header) and via
direct `localhost:3001` in the same session, so any difference found is attributable to the Funnel
hop itself and not to any code change since §3 was written.

**Headline: the bug still did not reproduce.** Every query in the test matrix returned
byte-for-byte identical response bodies between the Funnel URL and direct `localhost:3001`. Both
the localhost-only path (original §3) and the real Funnel path (this section) have now been
tested; neither reproduces the reported non-functional title/text filtering.

### 8.1 Setup [directly-verified]

- Confirmed before starting: Tailscale Funnel was already configured and live
  (`tailscale funnel status` showing `https://andromeda.tailcb2bd0.ts.net` → `http://127.0.0.1:3001`,
  a persistent setup not created or modified by this investigation), but nothing was listening on
  port 3001 or 3000 yet — `curl https://andromeda.tailcb2bd0.ts.net/` returned `502`.
- Ran `pnpm build` fresh: succeeded, `✓ Compiled successfully in 1870ms`, all 20 routes listed
  including `/cards/advanced` and `/cards/advanced/results` as `ƒ (Dynamic)`.
- `git status --short` showed only untracked `agent-reports/*.md` files (this report and two
  unrelated ones from other sessions) — no modified source, confirming the build used the exact
  same `main` HEAD (`86d5d57`) as the rest of this investigation.
- Started `pnpm start:remote` in the background, stdout/stderr redirected to a log file. Output:
  ```
  $ dotenv -e .env.remote -- next start -p 3001
  ▲ Next.js 16.2.12
  - Local:         http://localhost:3001
  - Network:       http://100.121.28.94:3001
  ✓ Ready in 94ms
  ```
- Confirmed up: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/` → `200`;
  `curl -s -o /dev/null -w "%{http_code}" https://andromeda.tailcb2bd0.ts.net/` → `200` (flipped
  from the pre-test `502`, confirming Funnel was actually forwarding to the freshly started
  process and not serving anything cached).
- Identified the listening process precisely for later targeted cleanup: `netstat -ano` showed PID
  `14384` (`node.exe`, `C:\Program Files\nodejs\node.exe`, start time matching the launch) as the
  sole listener on `0.0.0.0:3001` / `[::]:3001`.

### 8.2 Test matrix: Funnel URL vs. direct `localhost:3001` [directly-verified]

Same six-query matrix as §3, this time run as pairs — `https://andromeda.tailcb2bd0.ts.net/cards/advanced/results?...`
(new, previously-untested Funnel path) vs. `http://localhost:3001/cards/advanced/results?...`
(direct, same-session baseline) — against the identical running `start:remote` process for both:

| Query | Funnel URL | Direct `localhost:3001` | Byte-for-byte body diff |
|---|---|---|---|
| *(no params — baseline)* | 200, 2054 cards found | 200, 2054 cards found | Identical (`diff -q` reported no difference) |
| `?title=Sure+Gamble` | 200, 1 card found ("Sure Gamble" text confirmed present in body) | 200, 1 card found | Identical |
| `?text=gain+4%5Bcredit%5D` | 200, 21 cards found | 200, 21 cards found | Identical |
| `?title=Sure&text=credit` (both fields) | 200, 4 cards found | 200, 4 cards found | Identical |
| `?title=Sure+Gambel&fuzzy=1` (typo, fuzzy on) | 200, 1 card found | 200, 1 card found | Identical |
| `?title=Sure+Gambel` (same typo, fuzzy off) | 200, 0 cards found | 200, 0 cards found | Identical |

Every one of the six `diff -q` comparisons reported the funnel and local response files as
identical (no output beyond the tool's own "identical" confirmation) — not just matching counts,
but matching HTTP status, matching byte count (`Content-Length`-equivalent `size_download` from
curl matched exactly per query, e.g. 40123 bytes for baseline, 19399 for `title=Sure+Gamble`, 33711
for the encoded-bracket text query, 22066/19774/18696 for the remaining three), and matching body
content throughout, including the RSC payload segment that carries the result count (e.g.
`"en":[2054," card","s"," found"]` verbatim in both baseline responses, and `1,\" card"` /
`21,\" card"` / `4,\" card"` / `0,\" card"` matching per-query in both). The `text=gain+4%5Bcredit%5D`
case — flagged going in as the single most likely thing a reverse proxy could mangle, since it's
URL-encoded square brackets in a query string — showed no mangling at all: 21 results on both
paths, byte-identical bodies. Because the bodies are byte-identical, the actual matched card titles
are necessarily identical too, not merely the counts.

These counts also match §3's original dev/prod numbers exactly (2054 / 1 / 21 / 4 / 1 / 0),
confirming the underlying dataset and query behavior haven't drifted since the original
investigation, independent of the Funnel question.

### 8.3 Response header diff [directly-verified]

`curl -s -D - -o /dev/null` (full `GET`, not `HEAD`, to avoid Next.js suppressing headers on a
`HEAD` request) against the same query (`?title=Sure+Gamble`) through both paths:

```
Funnel:
HTTP/1.1 200 OK
Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate
Content-Type: text/html; charset=utf-8
Date: Mon, 10 Aug 2026 04:16:52 GMT
Link: </_next/static/media/...>; rel=preload; as="font"; ...
Vary: rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch, Accept-Encoding
X-Powered-By: Next.js
Transfer-Encoding: chunked

Direct localhost:3001:
HTTP/1.1 200 OK
Vary: rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch, Accept-Encoding
link: </_next/static/media/...>; rel=preload; as="font"; ...
X-Powered-By: Next.js
Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate
Content-Type: text/html; charset=utf-8
Date: Mon, 10 Aug 2026 04:16:52 GMT
Connection: keep-alive
Keep-Alive: timeout=5
Transfer-Encoding: chunked
```

Only two differences, both benign and both exactly what's expected of any standards-compliant HTTP
proxy, not anything specific to Funnel mangling this app's responses:

1. **`Connection: keep-alive` / `Keep-Alive: timeout=5` present only on the direct path.** These are
   hop-by-hop headers (RFC 7230 §6.1) describing the TCP connection between curl and the local Next
   server; a compliant proxy is required to strip them rather than forward them to the client on
   the other side of the tunnel, since the client's connection to the proxy has its own, different
   lifecycle. Their absence on the Funnel path is correct proxy behavior, not evidence of anything
   being dropped from the request/response that matters to search filtering.
2. **Header name casing**: the direct Node.js response sends `link` lowercase; the Funnel response
   normalizes it to `Link`. Cosmetic only — HTTP header names are case-insensitive per spec, and no
   other header's value differs.

No `Via` header is added by Funnel (Tailscale's proxy doesn't inject one). `Content-Length` is
absent on both paths — both use `Transfer-Encoding: chunked` — so there's no discrepancy there
either (both value and mechanism match). No caching header differs in a way that would explain
stale/cached results on either path (both send the same maximally-non-cacheable
`Cache-Control` value). Nothing here points at request query-string or response-body alteration by
the Funnel hop.

### 8.4 Server-side log during Funnel-routed requests [directly-verified]

The `start:remote` process's stdout/stderr was redirected to a log file for its entire lifetime
this session. Its complete contents, from launch through all twelve requests (six queries × two
paths) plus the header-diff requests plus the plain `/` liveness checks:

```
$ dotenv -e .env.remote -- next start -p 3001
▲ Next.js 16.2.12
- Local:         http://localhost:3001
- Network:       http://100.121.28.94:3001
✓ Ready in 94ms
```

— followed only by the `[ELIFECYCLE] Command failed with exit code 4294967295.` line that appeared
after this investigation force-stopped the process at cleanup (§8.6), which is the expected
artifact of `Stop-Process -Force` killing an in-flight Node process, not an application error.

No line was printed for any Funnel-routed request specifically, or for any request at all — Next.js
production mode doesn't request-log by default, so an empty log here is the *expected* baseline,
not itself informative about correctness. What it does rule out: no uncaught exception, no NextAuth
warning about an untrusted host or callback URL, and no other server-side error fired in response
to the real `Host: andromeda.tailcb2bd0.ts.net` header the Funnel path sends (vs. `Host:
localhost:3001` on the direct path). Given `.env.remote`'s `AUTH_TRUST_HOST` is deliberately left
empty (documented in `agent-reports/phase-9.md`, quoted in the file at lines 256–263, specifically
so an arbitrary `Host` header isn't trusted on the Funnel-facing process), this was the most
plausible place an auth-related difference could have surfaced — it didn't, and separately, `/cards/advanced/results`
is not an auth-gated route and no `middleware.ts` exists in the repo (re-confirmed, per §4) to
intercept it regardless of `Host`.

### 8.5 Real-browser interactive check: still not possible this session

Per the task instructions, checked directly (not assumed) whether a connected browser automation
tool was available this session: invoked the `claude-in-chrome` skill explicitly. Result: **"Browser
tools are not available in this session: the Claude in Chrome extension is not set up."** No
`mcp__claude-in-chrome__*` tools were available to call. This is the same gap the original report
flagged in its §0/§5 point 3 — **this follow-up session does not close it.** The one thing this
investigation still cannot directly observe is a real mouse-click-and-type interaction against the
Funnel URL in an actual browser, including its devtools console for JS errors. Everything else in
the originally-proposed browser-check step (typing into Card Name/Card Text, clicking Search,
confirming filtered results) has effectively been exercised via the curl matrix in §8.2 at the HTTP
level — the same GET request a browser's native form submission would produce — but not via actual
UI interaction or JS console observation.

### 8.6 Cleanup [directly-verified]

- Stopped the `start:remote` process by its exact PID (`14384`, identified via `netstat -ano`
  in §8.1, not a broad `taskkill`/pattern match): `Stop-Process -Id 14384 -Force`.
- Confirmed termination: `Get-Process -Id 14384` returned nothing (process gone); the process's own
  log picked up the expected `[ELIFECYCLE] Command failed with exit code 4294967295.` line noted in
  §8.4.
- Confirmed no process remained listening on port 3001: `netstat -ano | grep ':3001' | grep
  LISTENING` returned no rows; `curl http://localhost:3001/` failed to connect (`http_code=000`).
- Confirmed the Funnel URL reverted to its pre-test failure state, proving nothing was left running
  behind it: `curl -s -o /dev/null -w "%{http_code}" https://andromeda.tailcb2bd0.ts.net/` → `502`
  (matching the `502` observed before this session's `start:remote` was launched).
- Did not touch the Tailscale Funnel configuration itself at any point (no `tailscale funnel ...`
  command run) — it remains the repo owner's persistent setup, now correctly proxying to nothing,
  exactly as it was found before port 3001 had a listener.
- `pnpm dev` (port 3000) was never started or stopped by this session — confirmed both before
  (nothing listening on 3000) and after (still nothing listening on 3000) — left entirely alone per
  the task instructions, since it isn't part of the Funnel-vs-direct-3001 comparison this follow-up
  was scoped to.

### 8.7 Updated conclusion

Both requested code paths have now been directly tested against the live application:
`localhost:3001` directly (§3, original report) and the real public Tailscale Funnel URL (§8, this
follow-up) — both against a freshly built, current-`main` `start:remote` production process. Neither
reproduces the reported "Card title"/"Card text" non-functionality. The Funnel hop itself
introduces no observable difference in response body, result count, matched cards, or server-side
behavior — only the expected, benign stripping of hop-by-hop connection headers and cosmetic header
casing normalization, both standard reverse-proxy behavior unrelated to search filtering.

This narrows explanation 2 from §5 (the one this follow-up was scoped to test) from "untested" to
"tested and ruled out." Of §5's four candidate explanations, only #3 (a genuine browser-only
interaction/JS bug, still unobservable without a connected browser tool) and, to a lesser extent,
#1 (stale build at the time the user originally tested — not something re-testable after the fact)
remain open. Recommendation unchanged from §6: if the report recurs, the next actionable step is a
real browser session against the Funnel URL with devtools open — that is now the *only* untested
surface, everything reachable via HTTP request/response comparison (direct or Funnel-routed) has
been exhausted across this report and its follow-up without finding a reproduction.
