# Phase 1 — Foundation: Task Report

Scope built per `plans/PHASE_1_PLAN.md` (informed by `plans/PROJECT_PLAN.md`): a running Next.js app, Postgres via Docker Compose, the complete Prisma schema for every entity in the plan doc, a working seed mechanism, and Auth.js v5 wiring with GitHub as the sole provider. No NRDB sync, no rules scraper, no browsing/search UI, no tests — those are explicitly out of scope for this phase and were not built, per `plans/PHASE_1_PLAN.md`'s "Explicitly deferred to later phases" list.

## Environment notes (this machine, before any repo work)

This was a genuinely fresh Windows machine: neither `pnpm` nor Docker were installed, and WSL2 had no Linux distro. These gaps had to be resolved before any Phase 1 work could start:

- **pnpm**: `corepack enable` failed (`EPERM`, non-elevated shell can't write shims into `Program Files\nodejs`). Worked around with `npm install -g pnpm` (default prefix, `C:\Users\Unz\AppData\Roaming\npm`, already on `PATH` and user-writable) → pnpm 11.17.0.
- **Docker**: installed via `winget install --id Docker.DockerDesktop -e --silent --accept-package-agreements --accept-source-agreements` (Docker Desktop 4.83.0). The install genuinely required a system restart to finish enabling the WSL2/virtualization backend (`RebootPending` registry flag was `True` immediately after install, `com.docker.service` was `Stopped`). Work paused and this was reported as a blocker; **the repo owner restarted the machine**. After the restart, `RebootPending` was confirmed `False`, Docker Desktop was launched (`Start-Process`), and `docker info` was polled until it succeeded. Final state: Docker Engine 29.6.2, Docker Compose plugin v5.3.1, both healthy.

Neither of these is a deviation from scope — they're machine bootstrapping that had to happen before Phase 1 itself could begin — but they materially extended how this session went and are recorded here since the plan's "Verification" section assumes both tools already work.

## What was built

### 1. Next.js scaffold
- Ran `create-next-app@latest` (v16.2.12) with `--typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm --disable-git --no-agents-md`.
- **Deviation**: scaffolded into a scratch temp directory first, then moved the generated files into the repo root, rather than running the scaffolder directly in `C:\Users\Unz\git\jinteki`. Reason: the repo already contained `AGENTS.md`, `plans/`, `agent-reports/`, and `.git`, none of which are on `create-next-app`'s safelist of tolerated pre-existing files, and `--no-agents-md` was passed specifically so the scaffolder's own generated `AGENTS.md` wouldn't collide with the repo's existing convention file. `.git` was left untouched throughout (scaffolded with `--disable-git`).
- Result: `src/app/{layout,page}.tsx`, `src/app/globals.css`, `public/`, `next.config.ts`, `tsconfig.json` (with `@/*` → `./src/*`), `eslint.config.mjs`, `postcss.config.mjs`, Tailwind v4 via `@tailwindcss/postcss`.
- **pnpm supply-chain note**: pnpm 11's default security policy blocks native postinstall scripts (`sharp`, `unrs-resolver`, and later `@prisma/engines`, `prisma`, `esbuild`) unless explicitly allow-listed. Resolved via `pnpm-workspace.yaml`'s `allowBuilds` map (this is pnpm 11's current mechanism — the `package.json#pnpm.onlyBuiltDependencies` field that older docs describe is no longer read by this pnpm version).

### 2. Docker Compose + env — `docker-compose.yml`, `.env.example`, `.env`, `.gitignore`
- `docker-compose.yml`: single `postgres:16` service, named volume (`jinteki_postgres_data`), port 5432 published, credentials from env vars, a healthcheck (`pg_isready`).
- `.env.example`: committed, documents `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB`, matching `DATABASE_URL`, `AUTH_SECRET` (with generation instructions), and `AUTH_GITHUB_ID`/`AUTH_GITHUB_SECRET` with a comment block on how to create a GitHub OAuth App (Settings → Developer settings → OAuth Apps → New OAuth App, callback `http://localhost:3000/api/auth/callback/github`). Env var names were confirmed by reading `@auth/core`'s installed `setEnvDefaults` source (`node_modules/.pnpm/@auth+core@0.41.3/node_modules/@auth/core/lib/utils/env.js`), which derives `AUTH_<PROVIDERID>_ID`/`AUTH_<PROVIDERID>_SECRET` from each provider's id — not assumed from memory.
- `.env` (gitignored, not committed): real local Postgres credentials, a real generated `AUTH_SECRET` (via Node's `crypto.randomBytes(32).toString('base64')`), and blank `AUTH_GITHUB_ID`/`AUTH_GITHUB_SECRET`.
- `.gitignore`: the scaffold's default `.env*` rule would have also ignored `.env.example`; added `!.env.example` immediately after it so the example file is committable.

### 3. Prisma schema — `prisma/schema.prisma`
One migration (`prisma/migrations/20260727222007_init/`) covering every entity from the plan:
`Faction`, `Pack`, `Card` (raw `Json`, `keywords String[]`, FKs to `Faction`/`Pack`), `Decklist`, `DecklistCard`, `Ruling` (autoincrement `id`), `RuleSection`, `RuleMapping`, `User` (+ `role Role @default(USER)`, `enum Role { ADMIN USER }`), `Account`/`Session`/`VerificationToken` (standard `@auth/prisma-adapter` shape), `CardFavorite`, `DecklistFavorite`.

**The deliberate no-FK decision**: `RuleMapping.ruleSectionId` is a plain `String` column with no `@relation` to `RuleSection` — confirmed in the generated migration SQL (no `ALTER TABLE "RuleMapping" ADD CONSTRAINT ... FOREIGN KEY`). This is intentional per the plan's note that `RuleSection` stays empty until a later-phase scraper runs.

All other cross-entity references (`Card.factionCode` → `Faction`, `Card.packCode` → `Pack`, `Decklist.identityCode` → `Card`, etc.) **do** have real FK constraints, since those pairs are populated together by the same later-phase sync — only the `RuleMapping`/`RuleSection` pair has the timing mismatch the plan calls out.

`pg_trgm` + GIN indexes were added as hand-written raw SQL appended to the generated migration (`prisma migrate dev --create-only`, then edited before applying): `CREATE EXTENSION IF NOT EXISTS pg_trgm;` plus GIN trigram indexes on `Card.title`, `Card.text`, `Decklist.name`, `RuleSection.title`, `RuleSection.bodyText`.

**Deviation (significant, unplanned): Prisma major version pin.** `npm`'s "latest" `prisma`/`@prisma/client` resolved to **7.9.0**, which removed `datasource { url = env(...) }` support from `schema.prisma` entirely in favor of a new `prisma.config.ts` + driver-adapter model (`@prisma/adapter-pg` + a `Pool`) — a breaking architectural change released after the plan was written and after this assistant's knowledge cutoff. Adopting it would have meant an unplanned new dependency and config file not mentioned anywhere in `PHASE_1_PLAN.md`. Instead, pinned both packages to the latest stable **6.19.3**, which keeps the classic schema-with-`url` workflow the plan assumed. `pnpm prisma -v` confirms `prisma 6.19.3` / `@prisma/client 6.19.3` throughout. (Prisma does print a deprecation warning that `package.json#prisma` seed config will be removed in Prisma 7 — expected, and irrelevant since we're intentionally staying on 6.x.)

### 4. Seed — `prisma/rule-mapping-data.ts` + `prisma/seed.ts`
- `rule-mapping-data.ts`: exports `ruleMappingData: { key, ruleSectionId }[]`, seeded with exactly two placeholder entries (`Operation → "3.3"`, `Agenda → "3.2"`) — explicitly not the real curated mapping, matching the plan's "prove the mechanism, don't build the real thing" instruction.
- `seed.ts`: upserts each entry into `RuleMapping` (keyed on the `[key, ruleSectionId]` unique constraint), disconnects, exits non-zero on error.
- Wired via `package.json`'s `"prisma": { "seed": "tsx prisma/seed.ts" }`.

### 5. Auth.js v5
- `next-auth@5.0.0-beta.32` + `@auth/prisma-adapter@2.11.3`.
- `auth.ts` (repo root, per the plan): `PrismaAdapter(prisma)`, GitHub as sole provider, `session: { strategy: "database" }` (required for adapter-backed sessions), a `session` callback that copies `user.id`/`user.role` onto `session.user`.
- `src/app/api/auth/[...nextauth]/route.ts`: re-exports `GET`/`POST` from `auth.ts`'s `handlers`.
- `src/lib/prisma.ts`: standard dev-mode hot-reload-safe `PrismaClient` singleton.
- `types/next-auth.d.ts`: module augmentation typing `session.user.id`/`session.user.role` as `Role`.
- `src/lib/require-admin.ts`: `requireAdmin()` — checks `auth()` session exists and `role === "ADMIN"`, throws otherwise. **Not called from anywhere** (no admin routes exist yet, per scope). Contains a code comment documenting the one-off manual promotion path (`UPDATE "User" SET role = 'ADMIN' WHERE email = '...'`, or edit directly in Prisma Studio) since there's no in-app role-granting UI this phase.

## Verification — run for real, actual results

| Step | Result |
|---|---|
| `docker compose up -d` | **Pass.** `postgres:16` pulled, container `jinteki-postgres-1` created and started; polled `docker inspect -f '{{.State.Health.Status}}'` until `healthy` (reached within ~10s). `docker compose ps` confirms `Up ... (healthy)`, port `0.0.0.0:5432->5432/tcp`. |
| `pnpm prisma migrate dev` | **Pass.** Generated via `--create-only`, hand-edited to add the `pg_trgm`/GIN raw SQL, then applied. `npx prisma migrate status` afterward reports "Database schema is up to date!". |
| Table existence check | **Pass.** `docker compose exec postgres psql -U jinteki -d jinteki -c '\dt'` lists all 14 expected tables (`Account`, `Card`, `CardFavorite`, `Decklist`, `DecklistCard`, `DecklistFavorite`, `Faction`, `Pack`, `RuleMapping`, `RuleSection`, `Ruling`, `Session`, `User`, `VerificationToken`) plus Prisma's own `_prisma_migrations`. `\dx` confirms `pg_trgm` extension installed. `\di *trgm*` confirms all 5 GIN trigram indexes exist. (Used direct psql introspection rather than `pnpm prisma studio`, which is a GUI this agent can't click through — per the task's own allowance for that substitution.) |
| `pnpm prisma db seed` | **Pass.** `npx prisma db seed` → `Seeded 2 RuleMapping row(s).` Confirmed via `SELECT * FROM "RuleMapping";` — both `Operation`/`3.3` and `Agenda`/`3.2` rows present with generated `cuid()` ids. Succeeded despite `RuleSection` being empty, confirming the deferred-FK design works as intended. |
| `pnpm dev` + homepage smoke test | **Pass.** `npx next dev` (Turbopack) → "Ready in 404ms". `curl -i http://localhost:3000` → `HTTP/1.1 200 OK`. Also checked `curl http://localhost:3000/api/auth/providers` → `200`, body confirms the GitHub provider is correctly registered with the right `signinUrl`/`callbackUrl`. Server was then stopped (killed the process bound to port 3000). |
| `npx tsc --noEmit` (not in the plan's list, but run as a sanity check) | **Pass**, no errors. |
| `npx eslint .` (ditto) | **Pass**, no errors or warnings. |
| GitHub OAuth sign-in (full login flow) | **Not run — cannot be run by this agent.** No browser, and no real GitHub OAuth App credentials exist (`AUTH_GITHUB_ID`/`AUTH_GITHUB_SECRET` are blank in `.env`). The `/api/auth/providers` check above confirms the *wiring* is correct, but an actual sign-in creating `User`/`Account`/`Session` rows has not been attempted or claimed to pass. |

## Deviations from the plan, summarized

1. **Machine bootstrapping** (pnpm via `npm install -g` instead of corepack; Docker Desktop install requiring an owner-performed restart) — not scope deviations, but real friction not anticipated by the plan's "Verification" section, which assumes both tools already work.
2. **Scaffolding into a temp dir and moving files in**, instead of running `create-next-app` directly in the repo — because the repo already had non-safelisted files (`AGENTS.md`, `plans/`, `agent-reports/`).
3. **`pnpm-workspace.yaml` `allowBuilds` allow-list** for native postinstall scripts (`sharp`, `unrs-resolver`, `@prisma/engines`, `prisma`, `esbuild`) — required by pnpm 11's current security default; not present in older docs the plan may have been written against.
4. **Prisma pinned to 6.19.3 instead of "latest" (7.9.0)** — the single most significant deviation. Prisma 7 removed `schema.prisma`'s `datasource { url }` in favor of a `prisma.config.ts` + driver-adapter model. Adopting Prisma 7's new architecture wasn't in scope for this phase and isn't mentioned in the plan; pinning to the last 6.x keeps the classic workflow the plan assumed and avoids introducing unplanned dependencies/config.
5. **`package.json`'s `name` field** was corrected from the scaffold's default (`jinteki-scaffold`, taken from the temp directory's name) to `jinteki`.

No scope reduction: every model, index, and file from `PHASE_1_PLAN.md`'s list was built, including `Faction` and the `RuleMapping`/`RuleSection` no-FK decision.

## Left unresolved / requires the repo owner's manual action

1. **GitHub OAuth App creation** — this agent cannot create one (external account action). Instructions are in `.env.example`: GitHub → Settings → Developer settings → OAuth Apps → New OAuth App, callback `http://localhost:3000/api/auth/callback/github`. Once created, populate `AUTH_GITHUB_ID`/`AUTH_GITHUB_SECRET` in `.env` (not `.env.example`).
2. **First admin promotion** — after signing in once via GitHub (once the above is done), promote yourself via a one-off `UPDATE "User" SET role = 'ADMIN' WHERE email = '...';` or by editing the row in `pnpm prisma studio`. This is documented as a code comment in `src/lib/require-admin.ts`, not built as an in-app feature, per scope.
3. **Full GitHub OAuth login flow** was not, and could not be, exercised end-to-end by this agent (no browser, no real credentials). The route wiring and provider registration were verified instead (see verification table).
4. **Docker Desktop** is now installed and healthy on this machine, but note it's a real, persistent install (not a container/sandbox artifact) — worth knowing if this machine is shared or reimaged.
5. Nothing from `PHASE_1_PLAN.md`'s "Explicitly deferred to later phases" list was started: no NRDB sync scripts, no rules-doc scraper, no browsing/search UI, no favorites UI, no admin sync-trigger UI, no Vitest/tests.
6. Working tree was **not** committed or pushed, per instructions — `git status` at the end of this session shows `README.md` modified (by the scaffold) plus all the new files listed as untracked, ready for the owner's review.

## Key files (all under `C:\Users\Unz\git\jinteki`)

- `docker-compose.yml`, `.env.example`, `.env` (gitignored), `.gitignore`
- `prisma/schema.prisma`, `prisma/migrations/20260727222007_init/migration.sql`, `prisma/seed.ts`, `prisma/rule-mapping-data.ts`
- `auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/lib/prisma.ts`, `src/lib/require-admin.ts`, `types/next-auth.d.ts`
- `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`
- Standard Next.js scaffold: `src/app/{layout,page}.tsx`, `src/app/globals.css`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`, `public/`
