# jinteki — Remote Access Design

## Purpose of this document

`plans/REMOTE_ACCESS_PLAN.md` is an options survey — five ways to let other machines reach
jinteki, with no option chosen. This document is the decision record that follows it: which
option was picked, the reasoning behind each choice, and the concrete architecture that
falls out of it. It exists separately from the survey so the *reasoning* (what was asked,
what was ruled out and why) doesn't get overwritten every time the decision itself changes —
the survey stays a stable reference; this doc is what actually governs the build
(`plans/PHASE_9_PLAN.md`).

Decisions below were reached by walking the repo owner through the open questions
`REMOTE_ACCESS_PLAN.md` itself left unanswered, one at a time, on 2026-08-09.

## Decision 1 — Audience: small known group, deliberately not architected as a dead end

**Chosen**: a small, known group (a handful of specific people, invited by name) — but the
architecture must let this widen to the general public later **without a redeployment**.

This single requirement — "small now, public later, no re-architecture" — is the thread that
determines every decision below. It rules out any option whose "small group" mechanism is
structurally different from its "public" mechanism (see Decision 2).

## Decision 2 — Access control layer: application-layer, not network-layer

**Chosen**: gate access inside the app (after a real public URL exists), not by hiding the
server on a private network.

Two shapes were weighed:

- **Network-layer** (`REMOTE_ACCESS_PLAN.md` Option C, Tailscale private tailnet): the server
  never gets a public address; only devices invited onto the tailnet can reach it at all.
  Strongest isolation, but "going public" later isn't a config change — it's standing up an
  entirely separate public-facing deployment (new hosting shape, new OAuth app, new DNS/URL),
  which is exactly the re-architecture Decision 1 rules out.
- **Application-layer** (chosen): the server has a real, public HTTPS URL from day one.
  Anyone can *reach* it, but sign-in is gated by an allowlist check (Decision 5). Going public
  later means relaxing or removing that check — same deployment, same URL, same OAuth app,
  throughout.

Application-layer gating carries a marginally larger exposure surface today (the URL is
technically reachable by anyone, not invisible like a tailnet) — accepted as the cost of
Decision 1's "no do-over" requirement.

## Decision 3 — Uptime: PC-dependent accepted, not always-on

**Chosen**: the app only needs to be reachable while the owner's machine is on and running
`pnpm dev`/`pnpm start` — not an independent, always-on server.

This rules out `REMOTE_ACCESS_PLAN.md` Options D (self-hosted VPS) and E (managed PaaS) for
now — both solve a problem (independent uptime) that isn't currently a requirement, at a real
cost (money, ops burden) the small-group use case doesn't yet justify. Revisit if/when the
group outgrows "reachable when the host machine happens to be on."

## Decision 4 — Reach mechanism: Tailscale Funnel, no domain purchase

**Chosen**: `REMOTE_ACCESS_PLAN.md` Option B (tunnel to the existing local machine),
specifically via **Tailscale Funnel** rather than Cloudflare Tunnel or ngrok.

Rationale, given Decisions 1–3:

- No domain is currently owned, and buying one wasn't wanted just to get a stable URL.
- Tailscale Funnel issues a free, stable public HTTPS URL
  (`https://<host>.<tailnet-name>.ts.net`) that doesn't change across restarts — unlike
  ngrok's free tier, which reassigns a random URL on every restart and would break the fixed
  GitHub OAuth callback URL each time.
- Funnel makes the tailnet service reachable over the public internet directly — viewers hit
  the URL in a browser, no Tailscale client install required on their end. (This is distinct
  from plain Tailscale private networking, Option C, which *requires* every viewer join the
  tailnet — Funnel is the "make one tailnet service public" feature layered on top.)
- HTTPS is provided automatically by Funnel — satisfies `REMOTE_ACCESS_PLAN.md`'s shared
  prerequisite #3 with no separate certificate work.

Consequence for `REMOTE_ACCESS_PLAN.md`'s shared prerequisites: OAuth App #2's homepage and
callback URL point at the `ts.net` address; `AUTH_URL` is set to that same address (not
`AUTH_TRUST_HOST=true`, which the existing `.env.example` comment already flags as unsafe once
a real hostname is involved).

## Decision 5 — Allowlist shape: dedicated table keyed by GitHub login, checked at sign-in

**Chosen**: a new `AllowedLogin` table (GitHub username, pre-populated by the owner before an
invitee ever signs in), checked inside the Auth.js `signIn` callback. A rejected sign-in never
creates a `User`, `Account`, or `Session` row.

Three shapes were weighed:

1. **Env var allowlist** (`AUTH_ALLOWED_GITHUB_LOGINS=alice,bob`) — simplest to build (no
   schema change), but two things counted against it: editing it requires restarting the
   process (and the tunnel), and it would be a second, different access-control mechanism
   sitting alongside the one that already exists for admin promotion (a manual `User.role`
   edit via Prisma Studio — `src/lib/require-admin.ts:10-13`). Rejected for inconsistency with
   an established in-repo pattern, not for being technically unworkable.
2. **Boolean flag on the existing `User` table** (`allowed`, default `false`) — reuses
   existing schema, but has a chicken-and-egg problem: a `User` row doesn't exist until
   *after* someone's first GitHub sign-in creates it (via the Prisma adapter), so it can't be
   pre-set for someone who hasn't logged in yet. The only way to make this shape work is to
   let *anyone* with a GitHub account complete sign-in (creating a `User` row) and show a
   "pending approval" wall until the owner flips the flag by hand. Rejected because it lets
   unapproved strangers create real `User`/`Account`/`Session` rows — a materially different,
   larger blast radius than rejecting them outright.
3. **`AllowedLogin` table, checked pre-session** (chosen) — combines the DB-backed,
   no-restart-to-edit property that motivated rejecting option 1, with the reject-before-any-
   row-exists property that motivated rejecting option 2. The owner adds a GitHub username to
   the table *before* sharing the URL with that person; anyone else's OAuth attempt is turned
   away in the `signIn` callback before the adapter ever touches the database.

**Match key**: GitHub `login` (username) from the OAuth profile, not email. The `signIn`
callback receives the raw GitHub `profile` object (which always has `login`) independently of
whatever ends up persisted on `User` — and GitHub email can be null/private, so `login` is the
only field guaranteed present. `User.role` (`ADMIN`/`USER`) is unaffected by this change and
continues to gate admin actions (e.g. NRDB sync) exactly as it does today — the allowlist is a
strictly earlier, separate gate ("can you sign in at all"), not a replacement for the role
system ("what can you do once signed in").

**Amendment (2026-08-09)**: this decision originally proposed managing `AllowedLogin` by hand
via Prisma Studio, matching the existing admin-promotion workflow. Once the design moved from
"a one-time setup step" to "something touched every time a new person is invited," the repo
owner asked for a proper admin UI instead: add a login, see every entry with an active/inactive
status (not delete-to-revoke — history is kept), toggle status without retyping, plus a small
append-only sign-in audit trail (who attempted, allowed or rejected, when) for visibility into
both legitimate use and stray unauthorized attempts. Build in `plans/PHASE_9_PLAN.md` §§1–3.
Prisma Studio remains a valid fallback (it's still the same table), just no longer the primary
interface.

## Resulting architecture (end to end)

1. Owner runs `pnpm start` (or `pnpm dev`) on their own machine, as today.
2. Tailscale Funnel exposes it at a stable `https://<host>.<tailnet-name>.ts.net` URL.
3. A second GitHub OAuth App (`REMOTE_ACCESS_PLAN.md` prerequisite #1) has its homepage and
   callback URL set to that `ts.net` address; its `AUTH_GITHUB_ID`/`AUTH_GITHUB_SECRET` are
   new env values, separate from the existing localhost dev app.
4. `AUTH_URL` is set to the `ts.net` address (prerequisite #2); a fresh `AUTH_SECRET` is
   generated for this deployment (prerequisite #4) — none of the local dev secrets are reused.
5. Before inviting someone, the owner adds their GitHub username to the `AllowedLogin` table
   via the `/admin/allowlist` UI (see Decision 5's amendment) — Prisma Studio remains a fallback.
6. An invitee visits the URL, clicks sign in, authorizes via GitHub. The `signIn` callback
   checks their `login` against `AllowedLogin`: present → sign-in proceeds, a `User` row is
   created with the default `USER` role, same as local dev today; absent → sign-in is
   rejected, no rows created.
7. Admin actions (NRDB sync) remain gated by `User.role === "ADMIN"`, promoted by hand exactly
   as it is today — unaffected by this work.

## Cost

**$0.** No domain purchase (Decision 4), no VPS/PaaS subscription (Decision 3), Tailscale
Funnel and GitHub OAuth are both free at this scale. This resolves
`REMOTE_ACCESS_PLAN.md`'s open question #3 (budget ceiling) as a direct consequence of the
other decisions, not a separate choice.

## Explicitly deferred, not decided here

- **Going public**: per Decision 1, the mechanism to widen access later is relaxing/removing
  the `AllowedLogin` check — but *when* to do that, and whether the Tailscale Funnel + PC-
  dependent hosting (Decision 3) still suffices at public scale (vs. needing Option D/E from
  `REMOTE_ACCESS_PLAN.md`), is an explicitly open future decision, not resolved today.
- **A branded domain**: not needed while using the `ts.net` address; revisit only if/when
  going public makes a memorable URL worth the cost.
- **Rate limiting / abuse handling**: not designed here — deferred as low-priority given a
  small, vetted, allowlisted audience; would need revisiting before any public-scale move.
