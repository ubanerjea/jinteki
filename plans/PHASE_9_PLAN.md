# jinteki — Phase 9 Build Plan: Remote Access (Tailscale Funnel + Sign-in Allowlist)

## Context

`plans/REMOTE_ACCESS_PLAN.md` surveys five ways to let other machines reach jinteki;
`plans/design/REMOTE_ACCESS_DESIGN.md` records the decision reached from that survey through a
design interview with the repo owner (2026-08-09): expose the existing local deployment via
**Tailscale Funnel** (a free, stable public HTTPS URL, no domain purchase, no new hosting
account), gated by a new **application-layer sign-in allowlist** so only pre-approved GitHub
accounts can ever get a session — deliberately chosen over Tailscale's private-tailnet mode so
that widening access later is a config change, not a redeployment. Read both docs before
building; this plan translates their decisions into concrete steps and does not re-derive the
reasoning behind them.

Nothing here changes `auth.ts`'s provider, `PROJECT_PLAN.md`'s scope, or the existing
`User.role` (`ADMIN`/`USER`) system — the allowlist is a strictly earlier gate ("can this
GitHub account sign in at all"), separate from and unaffected by role-based authorization
("what can a signed-in user do").

## Baseline read directly against the repo before writing this plan

- `auth.ts` has no `signIn` callback today — every GitHub account that completes OAuth gets a
  `User` row created via `PrismaAdapter` and a database session, unconditionally.
- `prisma/schema.prisma`'s `User` model (line 199) has no field suitable for a pre-signup
  allowlist — `email` is nullable/GitHub-private-capable, and there is no `login`/username
  column at all today.
- `.env.example` already documents `AUTH_TRUST_HOST=true` for local-only use and flags (lines
  33–47) that a real public hostname should use `AUTH_URL` instead — this phase is the case
  that comment was written for.
- `src/lib/require-admin.ts` promotes admins via a one-off manual `User.role` edit through
  Prisma Studio — design doc Decision 5 originally proposed following that same
  manual-via-Prisma-Studio pattern for allowlist management too. **Superseded below**: the
  repo owner asked for a proper admin UI (add/list/activate/deactivate + a login audit trail)
  instead of raw table edits, once it became clear the allowlist would need to be touched more
  often than a one-time admin promotion.
- `src/app/admin/sync/` is the one existing admin UI in this codebase: a server-component page
  gated by `requireAdmin()` (try/catch, rendering "Access denied" inline rather than a hard
  404/500), a small `STATUS_STYLES`/badge convention, and a `"use client"` button that `fetch()`s
  a POST API route under `src/app/api/admin/...`.
- `src/app/actions/favorites.ts` is this codebase's other established mutation pattern: plain
  `"use server"` Server Actions bound directly to `<form action={...}>` — real HTML forms,
  curl-testable, no client-side JS required. This phase's allowlist CRUD (add / activate /
  deactivate) is a closer fit to this pattern than to the sync page's fetch+API-route one — it's
  simple state toggles, not a long-running job needing a "pending" spinner — so it follows
  `favorites.ts`'s Server Actions convention instead, while keeping the sync page's
  requireAdmin()-gated-page-with-inline-denial layout.
- `src/components/site-header.tsx` renders the `/admin/sync` nav link only when
  `user?.role === "ADMIN"` (line 44) — the new `/admin/allowlist` link follows the same
  conditional.

## Scope

1. **Schema migration** — new `AllowedLogin` table (with an `active` status, not just presence/
   absence) and a new append-only `LoginAttempt` audit table, seeded with the repo owner's own
   GitHub login so this phase can never lock the owner out.
2. **`signIn` callback** — reject non-allowlisted *or deactivated* GitHub logins before any
   `User`/`Account`/`Session` row is created; record every attempt (allowed or not) to
   `LoginAttempt`.
3. **Admin allowlist UI** (`/admin/allowlist`) — add a GitHub login, list current entries with
   active/inactive status and last-login time, activate/deactivate without deleting history.
4. **Two-process local setup** (resolved 2026-08-09, was previously an open question left to
   "however the owner chooses"): local dev (`pnpm dev`, port 3000, the existing localhost OAuth
   app) and the Funnel-facing remote instance (new `start:remote` script, port 3001, a separate
   `.env.remote` file) run as two independent, simultaneously-running processes on the same
   machine — never a swap-before-starting step. Includes the env var changes previously listed
   as a separate item; see section 4 below for the full mechanism, including a real landmine in
   how Next.js merges env files that needs direct verification, not assumption.
5. **Tailscale Funnel setup** — now targets port **3001** (the remote process), not 3000;
   backgrounded so it survives host reboots (operational step, not code, but documented here so
   it's not left implicit).
6. **Second GitHub OAuth App** — registered against the Funnel URL, which proxies to port 3001.
7. **Verification** — split explicitly into what's verifiable now (schema, seed, gate logic,
   admin UI, the two-process/port mechanism itself) versus what requires sections 5–6 to be done
   manually first (an allowlisted and non-allowlisted GitHub account actually attempting sign-in
   through the real Funnel URL, Funnel's reboot survival) — see the "Deferred verification"
   subsection.

---

## 1. Schema migration

`prisma/schema.prisma` gains two new models:

```prisma
model AllowedLogin {
  githubLogin String   @id
  active      Boolean  @default(true)
  addedAt     DateTime @default(now())
  updatedAt   DateTime @updatedAt
  note        String?  // optional: who this is / why they were added — for the owner's own reference
}

model LoginAttempt {
  id          String   @id @default(cuid())
  githubLogin String
  allowed     Boolean
  attemptedAt DateTime @default(now())

  @@index([githubLogin])
  @@index([attemptedAt])
}
```

`AllowedLogin` keyed by GitHub `login` (username), not `User.id` or email — per design doc
Decision 5, this table must be populatable *before* the person it refers to has ever signed in,
so it can't reference anything that only exists after their first login. `note` is a plain
optional field for the owner's own bookkeeping (e.g. `"alice — local playgroup"`); not read by
any app logic. `active` replaces plain row-presence as the gate (row exists but `active: false`
== revoked-but-remembered) so deactivating someone doesn't lose their `addedAt`/`note` history
or require re-typing their username to reinstate them later.

`LoginAttempt` is deliberately **not** a Prisma relation to `AllowedLogin` (no `@relation`, just
a plain `githubLogin` string column) — a relation with `AllowedLogin.githubLogin` as its target
would force every attempt to reference an existing `AllowedLogin` row, but the whole point of
logging attempts is to also capture logins from GitHub accounts that were **never** allowlisted
at all (a stranger trying the URL). Kept intentionally minimal per the "nothing too fancy"
brief: no IP address or user-agent capture — Auth.js v5's `signIn` callback isn't hard-wired
into the request object the way an API route handler is, so getting at request metadata there
would mean threading extra plumbing through for a small-group audit log that doesn't need it.
`githubLogin` (not `userId`) is the key column throughout, since a rejected attempt never gets a
`User` row to point at, and using two different keying schemes for allowed-vs-rejected rows
would complicate the admin UI's single combined activity list for no real benefit.

- **Migration**: `pnpm prisma migrate dev --name add_allowed_login_and_login_attempt`.
- `LoginAttempt` starts empty (nothing to backfill — it's a forward-only log). `AllowedLogin`
  is **seeded**, not left empty: `prisma/seed.ts` (existing file, already run via
  `pnpm prisma db seed` — see `RuleMapping`'s seeding for precedent) gains

  ```ts
  await prisma.allowedLogin.upsert({
    where: { githubLogin: "ubanerjea" },
    update: {}, // never overwrite — if the owner deactivates this row while testing,
                // re-running seed must not silently reactivate it out from under them
    create: { githubLogin: "ubanerjea", note: "repo owner" },
  });
  ```

  `update: {}` mirrors `RuleMapping`'s own upsert in the same file — create-if-missing, no-op if
  present — so this seed step is safe to rerun (`pnpm prisma db seed` is idempotent) without
  fighting the admin UI's activate/deactivate toggle. This is what makes the "add the owner's
  own login before merging or local sign-in breaks" hazard (section 2 below) a non-issue: it's
  now guaranteed by running the standard setup command, not a manual step someone can forget.

  Every other allowlist entry (actual invited friends) still goes through the admin UI — this
  seed only ever covers the one row that must exist for the app to be usable by anyone at all,
  including the owner, on a completely fresh database.

---

## 2. `signIn` callback (`auth.ts`)

Add a `signIn` callback that checks the GitHub profile's `login` against `AllowedLogin`
(present **and** `active`), rejects everyone else before the adapter persists anything, and
records every attempt either way:

```ts
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [GitHub],
  session: { strategy: "database" },
  callbacks: {
    async signIn({ profile }) {
      const login = (profile as { login?: string } | undefined)?.login;
      if (!login) return false;

      const entry = await prisma.allowedLogin.findUnique({ where: { githubLogin: login } });
      const allowed = entry?.active === true;

      await prisma.loginAttempt.create({ data: { githubLogin: login, allowed } });

      return allowed;
    },
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.role = user.role;
      }
      return session;
    },
  },
});
```

- `profile` here is the raw GitHub OAuth profile Auth.js receives mid-flow — `login` is present
  on every GitHub profile regardless of whether the user has a public email, confirming design
  doc Decision 5's reasoning for keying on `login` over email.
- Gate is `entry?.active === true`, not just `entry !== null` — a deactivated entry still exists
  (so its history survives in the admin UI) but must fail the gate exactly like a login that was
  never added at all.
- The `loginAttempt.create()` runs for every attempt, allowed or not, before returning — so a
  stranger who was never allowlisted still produces a `LoginAttempt` row (`allowed: false`) the
  admin can see in the UI, even though no `AllowedLogin` row exists for them.
- Returning `false` from `signIn` stops the flow before `PrismaAdapter` creates or links any
  `User`/`Account` row — confirm this directly (a rejected sign-in attempt should leave zero
  new rows in `User`/`Account`, checkable via Prisma Studio) rather than assuming Auth.js's
  documented behavior holds in this exact adapter/version combination, per
  `RESEARCH_AND_VERIFICATION_PRINCIPLES.md`.
- Existing local dev flow is unaffected *only if* the owner's own GitHub login is present and
  `active` in `AllowedLogin` — guaranteed by the seed step above (section 1) running as part of
  the normal `pnpm prisma db seed`, not a manual step someone has to remember before merging.

---

## 3. Admin allowlist UI (`/admin/allowlist`)

Follows `src/app/admin/sync/page.tsx`'s page-gating shape (server component, `requireAdmin()`
in a try/catch rendering inline "Access denied" text on failure, same Tailwind table
conventions and a `StatusBadge`-style component for Active/Inactive) but uses
`src/app/actions/favorites.ts`'s Server Actions convention for mutations, since these are plain
state toggles rather than a long-running job.

**`src/app/actions/allowlist.ts`** (new, `"use server"`, each function opens with
`await requireAdmin()`):

```ts
export async function addAllowedLogin(formData: FormData) {
  await requireAdmin();
  const githubLogin = String(formData.get("githubLogin") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!githubLogin) throw new Error("GitHub login is required");

  // upsert, not create: re-submitting an existing (possibly deactivated) login
  // reactivates it and updates the note, rather than erroring on the unique constraint
  await prisma.allowedLogin.upsert({
    where: { githubLogin },
    update: { active: true, note },
    create: { githubLogin, note },
  });

  revalidatePath("/admin/allowlist");
}

export async function setAllowedLoginActive(githubLogin: string, active: boolean) {
  await requireAdmin();
  await prisma.allowedLogin.update({ where: { githubLogin }, data: { active } });
  revalidatePath("/admin/allowlist");
}
```

**`src/app/admin/allowlist/page.tsx`** (new, server component):

- Gated by `requireAdmin()`, same inline-denial pattern as `/admin/sync`.
- An "Add" form (`<form action={addAllowedLogin}>`, plain `githubLogin` + optional `note`
  inputs) at the top.
- A table of every `AllowedLogin` row (no pagination — this is a small-group list, per design
  doc Decision 1), columns: GitHub login, Active/Inactive badge, Added, Note, Last login, and an
  Activate/Deactivate button per row. "Last login" is
  `prisma.loginAttempt.findFirst({ where: { githubLogin, allowed: true }, orderBy: { attemptedAt: "desc" } })`
  per row — an N+1 query, accepted deliberately at this table's expected size (a handful of
  rows) rather than building a grouped/windowed query for it.
- The per-row Activate/Deactivate button is its own small `<form action={...}>` with a hidden
  `githubLogin` field, bound to a thin wrapper action (`toggleAllowedLogin(formData)` calling
  `setAllowedLoginActive` with the opposite of the row's current `active` value) — no
  `"use client"` needed, matching `favorites.ts`'s no-client-JS philosophy.
- A second, smaller "Recent sign-in activity" table below: the last 20 `LoginAttempt` rows
  (`orderBy: { attemptedAt: "desc" }, take: 20`), columns GitHub login / Allowed-or-Denied /
  When — this is what surfaces a stranger's rejected attempt even though they have no
  `AllowedLogin` row at all.

`src/components/site-header.tsx`'s admin nav (line 44's `user?.role === "ADMIN"` block) gains a
second link, `/admin/allowlist`, next to the existing `/admin/sync` one.

Basic input validation on `githubLogin` (trim, non-empty) is enough here — GitHub's own OAuth
flow is the actual source of truth for whether a login is real; a typo just means nobody with
that (nonexistent) login can ever match it, which is a harmless no-op, not a security hole.

---

## 4. Two-process local setup (ports + env files)

**Decision (2026-08-09)**: run local dev and the Funnel-facing remote instance as two
independent processes, on two different ports, at the same time — not a single process whose
env gets swapped before each start. Local dev stays exactly as it is today (`pnpm dev`, port
3000, the original localhost OAuth app, plain `.env`); a new `start:remote` script runs a
second, separate process on port 3001 against a separate env file, so the owner can develop
locally and serve the shared instance simultaneously without ever stopping one to run the
other.

**`.env.remote`** (new, gitignored exactly like `.env` — add it alongside `.env` in
`.gitignore`) is **self-contained**, not a partial override layered on top of `.env`:

```
DATABASE_URL="postgresql://jinteki:jinteki_dev_password@localhost:5432/jinteki?schema=public"
AUTH_GITHUB_ID=<from section 6 below>
AUTH_GITHUB_SECRET=<from section 6 below>
AUTH_URL=https://<host>.<tailnet-name>.ts.net
AUTH_SECRET=<fresh value from `npx auth secret` — NOT the local dev one>
AUTH_TRUST_HOST=
```

Generate that `AUTH_SECRET` value by running `npx auth secret` from the repo root — it prints a
random value and, run interactively, offers to write it straight to `.env`; decline that and
paste the printed value into `.env.remote` by hand instead, since the auto-write targets the
wrong file here. Do this once: the same fresh value carries through section 4's
placeholder-credential verification pass below and into section 6's real setup — it does not
need regenerating once real GitHub OAuth credentials replace the placeholders.

**Why self-contained, and the landmine this avoids**: Next.js's built-in env loader
(`@next/env`) reads `.env`/`.env.production` from disk on every start *regardless* of what
another tool already put in `process.env`, but a key already present in `process.env` wins over
whatever that file says for the same key — it does not "unset" or blank out a key the file
defines that the override omits. So if `.env.remote` only contained the four `AUTH_*` overrides
and omitted `AUTH_TRUST_HOST` entirely, `next start`'s own loader would still pick up
`AUTH_TRUST_HOST=true` from the *local* `.env` file sitting in the same directory (it's read
unconditionally, override or not) — silently reintroducing the exact "trust any Host header"
problem `AUTH_URL` exists to replace, on the one process where it matters most. Setting
`AUTH_TRUST_HOST=` (empty) explicitly in `.env.remote` closes that gap by giving the key a
falsy value *before* Next's own loader runs, rather than leaving it absent for `.env` to fill
in. `DATABASE_URL` is included too (identical value to `.env` — same shared Postgres, per plan
§1's "unchanged" note) purely so `.env.remote` never depends on `.env`'s contents at all —
one file, fully describing one process, no merge order to reason about.

**`package.json`** gains one script (mirroring the existing `dev`/`build`/`start` scripts'
style):

```json
"start:remote": "dotenv -e .env.remote -- next start -p 3001"
```

using `dotenv-cli` (new devDependency — `pnpm add -D dotenv-cli`) to load an arbitrarily-named
env file, since Next.js's own convention-based loading (`.env.local`, `.env.production`, etc.)
has no mechanism for a custom filename. `dotenv-cli` is cross-platform (works identically under
this repo's PowerShell-primary/bash-secondary environment — see `AGENTS.md`/environment notes),
which a raw shell `VAR=x command` prefix would not be.

**This whole mechanism is directly verifiable now**, without Tailscale or a real second OAuth
app existing yet — per `RESEARCH_AND_VERIFICATION_PRINCIPLES.md`, don't assume the env
precedence reasoning above is correct just because it's plausible:

1. Fill `.env.remote` with placeholder `AUTH_GITHUB_ID`/`_SECRET` values (sign-in itself can't
   work without a real OAuth app yet, but the process should still boot) and a real
   `AUTH_SECRET`.
2. Run `pnpm start:remote` alongside an already-running `pnpm dev` — confirm both processes stay
   up simultaneously on their respective ports (`curl http://localhost:3000` and
   `curl http://localhost:3001` both succeed at the same time).
3. Add a temporary log line (or a throwaway debug route) printing
   `process.env.AUTH_URL`/`process.env.AUTH_TRUST_HOST` on the port-3001 process at boot; confirm
   it reads `.env.remote`'s values (`AUTH_URL` set, `AUTH_TRUST_HOST` empty/falsy) and *not*
   `.env`'s (`AUTH_TRUST_HOST=true`) — this is the actual test of the landmine above, not just
   code inspection. Remove the temporary log line once confirmed.

## 5. Tailscale Funnel setup (operational, not code)

Done on the machine currently running the port-3001 remote process (`pnpm start:remote`):

1. Install Tailscale, sign in, confirm the machine joins the owner's tailnet.
2. `tailscale funnel -bg 3001` — **note the port is 3001, not 3000** (section 4's decision) —
   the confirmed current syntax (Tailscale CLI reference, `tailscale funnel -bg [flags]
   <target>`) for exposing local port 3001 at a public `https://<host>.<tailnet-name>.ts.net`
   URL. **Use `-bg`, not bare `tailscale funnel 3001`**: per Tailscale's own docs, `-bg` makes
   Funnel "run persistently in the background" and auto-resume after the host reboots or
   Tailscale restarts (`tailscale down`/`tailscale up`); without it, a reboot silently drops the
   public URL until someone manually re-runs the command — an availability gap with no error
   surfaced to remote users, just a dead link.
3. Confirm the URL is reachable from a network *other than* the host's own LAN (e.g. phone on
   cellular data) — LAN-reachability alone doesn't prove the public path works.
4. Note the exact URL — it's needed verbatim for section 6 below.
5. The hostname (`<host>.<tailnet-name>.ts.net`) is derived from the device's Tailscale machine
   name and tailnet name, not randomly generated — confirmed stable across restarts (Tailscale
   Funnel docs); it only changes if the device or tailnet is renamed, which is a deliberate
   owner action, not something that happens on its own.

### commands to check tailscale, start and stop
Check status:
  tailscale funnel status
Shows current Funnel configuration (which ports are exposed, to what).

Stop it:
  tailscale funnel --https=443 off

Start it:
  tailscale funnel -bg 3001

Also use:
  tailscale down
  tailscale up

---

## 6. Second GitHub OAuth App

Per `REMOTE_ACCESS_PLAN.md`'s shared prerequisite #1 — a manual, one-time step by whoever owns
the GitHub account registering it (the repo owner):

1. GitHub → Settings → Developer settings → OAuth Apps → New OAuth App.
2. Homepage URL and Authorization callback URL both set to the Funnel URL from section 5
   (callback: `https://<host>.<tailnet-name>.ts.net/api/auth/callback/github`).
3. Generate a client secret. **Do not reuse** the existing localhost dev app's credentials —
   this is a second, separate OAuth app per the design doc.
4. Paste the real `AUTH_GITHUB_ID`/`AUTH_GITHUB_SECRET` values into `.env.remote` (section 4),
   replacing the placeholders used for the local verification pass.

Update `.env.example` (and add a new `.env.remote.example`, mirroring section 4's template
above with placeholder values) so a future reader isn't left guessing why there are two OAuth
apps or two `.env*` files — point both at `plans/design/REMOTE_ACCESS_DESIGN.md` for the "why."

---

## 7. Verification

### Verifiable now (no Funnel, no second OAuth app required)

- After `pnpm prisma db seed`, confirm `ubanerjea` already appears, active, in
  `/admin/allowlist` **without** any manual add step.
- Re-run `pnpm prisma db seed` a second time; confirm it's a no-op for the `ubanerjea` row (in
  particular, that manually deactivating it first and then reseeding leaves it deactivated —
  proving `update: {}` doesn't fight the admin UI's toggle).
- Sign in as the owner via the **existing local dev OAuth app** (`pnpm dev`, port 3000, no
  Funnel needed) — confirm a `User`/`Account`/`Session` row is created, the app is usable
  (browse cards/decklists, favorite something), and a `LoginAttempt` row (`allowed: true`) now
  shows as "Last login" for `ubanerjea` in the admin UI. This exercises the real `signIn`
  callback end-to-end through a genuine GitHub OAuth handshake — it doesn't need the Funnel URL
  specifically, just *some* real OAuth app pointed at *some* reachable callback URL, and
  localhost already qualifies.
- From a second, real GitHub account **not** in `AllowedLogin`, attempt sign-in via that same
  local dev OAuth app; confirm the attempt is rejected, that — check directly in Prisma Studio —
  **no** new `User` or `Account` row was created for that account, and that a `LoginAttempt` row
  (`allowed: false`) for that login now appears in the admin UI's "Recent sign-in activity"
  table despite no matching `AllowedLogin` row existing.
- Deactivate a previously-allowed test login via the UI's Activate/Deactivate button; confirm a
  subsequent sign-in attempt from that account is now rejected (same as a never-allowlisted
  account), and that its `AllowedLogin` row (`addedAt`, `note`) is still visible in the UI rather
  than gone. Reactivate it and confirm sign-in succeeds again without re-entering the username.
- Confirm the existing local `pnpm dev` flow (against the original localhost OAuth app) still
  works unmodified — this phase must not break local development.
- Confirm admin-gated actions (NRDB sync) still require `role === "ADMIN"` for a signed-in,
  allowlisted, non-admin test account — the allowlist must not accidentally grant admin.
- Confirm `/admin/allowlist` itself is inaccessible (inline "Access denied", matching
  `/admin/sync`'s behavior) to a signed-in, allowlisted, non-admin account, and that its nav
  link is absent from the site header for that account.
- Section 4's two-process/env-file mechanism (`pnpm dev` on 3000 and `pnpm start:remote` on
  3001 running simultaneously, `.env.remote`'s values winning over `.env`'s for the remote
  process, `AUTH_TRUST_HOST` actually reading empty on port 3001 rather than leaking `true` from
  `.env`) — fully verifiable locally per section 4's own numbered steps, using placeholder OAuth
  credentials since real sign-in on port 3001 isn't possible until section 6 exists.

### Deferred — requires sections 5–6 (Tailscale Funnel + second GitHub OAuth App) to exist first

These cannot be exercised by any build or verify subagent run during this phase's automatable
build pass, regardless of how thorough that pass is — they depend on infrastructure
(a live public Funnel URL, a registered OAuth app with real credentials) that only the repo
owner can create, using their own GitHub and Tailscale accounts. **Not a gap in this phase's
build/verify cycle — a hard boundary of what's testable before those manual steps exist.**

**Resolved 2026-09-04** (owner-verified directly, see `agent-reports/phase-9.md`'s follow-up
section of the same date):

- ✅ Sections 5–6 both complete: `tailscale funnel -bg 3001` running (`https://andromeda.tailcb2bd0.ts.net`
  → `127.0.0.1:3001`, confirmed via `tailscale funnel status`), second GitHub OAuth App
  registered with its callback URL pointed at this exact Funnel hostname, `.env.remote`
  populated with the app's real `AUTH_GITHUB_ID`/`AUTH_GITHUB_SECRET`.
- ✅ An allowlisted GitHub account signing in through the *actual* Funnel URL from a genuinely
  separate, off-LAN machine — owner-confirmed working.
- ✅ `AUTH_URL`/`AUTH_TRUST_HOST` behaving correctly against a real public hostname — the
  successful sign-in above is direct end-to-end proof (Auth.js's redirect/callback handling
  worked against `andromeda.tailcb2bd0.ts.net`, not just `localhost`), superseding the need for
  a separate check.

**Explicitly skipped, by owner decision (2026-09-04)** — not a gap, a deliberate choice not to
spend a second real GitHub account on this:

- A non-allowlisted GitHub account attempting sign-in through the real Funnel URL. The
  underlying gate logic (deny path, `LoginAttempt` recording for never-allowlisted logins) is
  already covered by real-DB tests (`check-allowed-login.test.ts`) and by the equivalent test
  against the local dev OAuth app (`agent-reports/phase-9.md`'s original build pass) — only the
  "through the real public URL, from a real second account" variant is being skipped.

**Still open, not yet tested**:

- After a host reboot (or `tailscale down` / `tailscale up`), confirming the Funnel URL is still
  live without manually re-running `tailscale funnel` — the actual point of using `-bg` in
  section 5. Untested as of 2026-09-04; the Funnel has been running continuously since it was
  started, so this hasn't had an opportunity to be exercised yet.
