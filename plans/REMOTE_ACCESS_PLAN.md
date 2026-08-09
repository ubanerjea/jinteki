# jinteki — Remote Access Plan

## Context

Today jinteki only runs on the owner's machine: Next.js bound to `localhost:3000`,
Postgres in Docker Compose bound to `localhost:5432`, and a GitHub OAuth app whose
callback URL is hardcoded to `http://localhost:3000/api/auth/callback/github`
(`.env.example`). `PROJECT_PLAN.md`'s "Deployment" section calls this out explicitly as
a deliberate, temporary choice ("Local-only for now ... Revisit once the core loop ...
is solid"). Nothing here proposes changing that decision — this doc is the "revisit"
it points at: an options survey for letting other people, on other machines, reach the
app and use its features (browse/search cards & decklists, rulings, rules glossary,
favorites, admin sync). The options below were surveyed with nothing chosen yet; see
"Decision" immediately below for what was picked and why.

This is deliberately **not** a `PHASE_N_PLAN.md` — it's a decision document to align on
an approach before any phase plan gets written for it.

## Decision

**Resolved 2026-08-09** — Option B, specifically **Tailscale Funnel**, plus a new
application-layer sign-in allowlist. Small known group now, deliberately architected so
widening to the public later is a config change (relax the allowlist), not a redeployment.
Full reasoning for every choice below is in
[`plans/design/REMOTE_ACCESS_DESIGN.md`](design/REMOTE_ACCESS_DESIGN.md); the build is
[`plans/PHASE_9_PLAN.md`](PHASE_9_PLAN.md). The options survey below is kept as-is for
reference — it's what the decision was made *from*, not rewritten to match the outcome.

## What "remote access" requires, regardless of which option is picked

These four things are shared prerequisites across every option below. Skipping any of
them is why "it works on my machine" often doesn't survive contact with a second
machine.

1. **A second, real GitHub OAuth App for the public URL.** Auth.js/GitHub OAuth apps
   are bound to one callback URL each. The existing dev OAuth app (callback
   `http://localhost:3000/...`) must stay pointed at localhost; a **separate** OAuth
   app, homepage + callback URL matching whatever public/shared URL is chosen, is
   needed alongside it. Its `AUTH_GITHUB_ID`/`AUTH_GITHUB_SECRET` are new secrets, not
   reused from `.env`.
2. **`AUTH_URL` (or a correctly configured reverse proxy) instead of
   `AUTH_TRUST_HOST=true`.** The comment in `.env.example` already flags this: blanket
   `AUTH_TRUST_HOST=true` trusts *any* `Host` header, which is fine on a machine only
   reachable as `localhost` but becomes a spoofable trust boundary the moment the app
   is reachable under a real hostname. Once there's a real public URL, set
   `AUTH_URL=https://<that-url>` explicitly instead.
3. **HTTPS.** GitHub OAuth doesn't strictly require it, but cookies (`next-auth`
   session cookie), browser mixed-content rules, and just not sending session tokens
   over plaintext to a WAN do. Every option below either gets HTTPS for free (managed
   PaaS, most tunnels) or needs it added explicitly (bare VPS).
4. **Secrets stay out of git.** `.env` is already gitignored — that doesn't change. What
   changes per-option is *where* the production secrets (`AUTH_SECRET`,
   `AUTH_GITHUB_ID/SECRET`, `DATABASE_URL`) live instead: a host's environment,
   a platform's secrets manager, etc. Generate a fresh `AUTH_SECRET` for the
   remote deployment — don't reuse the local dev one.

Two things that turn out **not** to be blockers:

- **Card images**: hotlinked directly from NRDB's CDN by the *browser*, not proxied
  through the app (`PROJECT_PLAN.md`, Data section). Remote users' browsers fetch them
  directly — no bandwidth or licensing exposure added by making the app reachable.
- **NRDB sync**: manual-only, admin-triggered (`PROJECT_PLAN.md`). Adding remote
  viewers doesn't add sync traffic to NRDB — only more people who can *browse already-
  synced data*.

One thing to size correctly: the current dev DB is **~650MB** (checked directly via
`pg_database_size`). That's small in absolute terms but rules out the smallest free-tier
hosted-Postgres offerings if a managed-DB option is chosen — worth checking the specific
provider's current free-tier cap before committing to one.

## Options

### Option A — LAN-only sharing

Bind `next dev`/`next start` to `0.0.0.0` instead of `localhost` and open port 3000 on
the host's firewall. Anyone on the same Wi-Fi/LAN reaches it via the host's local IP
(`http://192.168.x.x:3000`).

- **Reach**: same physical network only (home Wi-Fi, LAN party, same office).
- **Effort**: lowest — a `next dev -H 0.0.0.0` (or `next start -H 0.0.0.0`) flag, a
  firewall rule, and OAuth App #2 pointed at that LAN IP (fragile — breaks if DHCP
  reassigns the IP).
- **Cost**: none.
- **Caveats**: no HTTPS by default (LAN-only mitigates but doesn't eliminate the risk);
  the host machine must stay on and running `pnpm dev`/`pnpm start` for anyone else to
  reach it; only works for people physically nearby.
- **Good for**: showing the app to someone in the same room, quick playtesting.

### Option B — Tunnel to the existing local machine (Cloudflare Tunnel / ngrok / Tailscale Funnel) — **chosen (Tailscale Funnel sub-option)**

Keep everything exactly where it is (local Next.js, local Docker Postgres) and run a
tunnel client that punches a public HTTPS URL through to `localhost:3000`. No hosting
signup for the app or DB.

- **Reach**: anyone on the internet with the URL (or, with Tailscale specifically,
  see Option C for the private variant).
- **Effort**: low — install one tunnel tool, run one command, point OAuth App #2 at the
  tunnel's URL. Cloudflare Tunnel and Tailscale Funnel give a stable subdomain; ngrok's
  free tier gives a random one that changes on restart (breaking the OAuth callback
  URL each time) unless paid for a reserved domain.
- **Cost**: free tiers exist for all three; stable custom domains are usually a paid
  tier.
- **Caveats**: the app is only reachable while the host machine is on, Docker Postgres
  is running, and the tunnel process is alive — same fragility as dev mode, just now
  with a public face. Host machine's local resources (CPU, disk, home network upload
  bandwidth) serve every remote request.
- **Good for**: short-lived sharing — a demo, a few days of remote playtesting —
  without committing to real hosting.

### Option C — Tailscale private network (invite-only, no public exposure) — considered, not chosen

*Fits "small known group" today, but rejected: its access control is network-level (who can
reach the server at all), and "going public" later would mean standing up a whole separate
public deployment rather than widening a setting — see `plans/design/REMOTE_ACCESS_DESIGN.md`
Decision 2.*

Install Tailscale on the host and on each intended user's device; they join the same
private "tailnet" and reach the app via a stable Tailscale-assigned hostname
(`http://jinteki-host.tailnet-name.ts.net:3000`), never touching the public internet.

- **Reach**: only devices explicitly invited onto the tailnet — not the general public.
- **Effort**: low — install Tailscale on host + each user's machine, share the invite.
  Optionally enable Tailscale Serve for HTTPS + a cleaner URL.
- **Cost**: free for personal/small tailnets.
- **Caveats**: every viewer needs to install Tailscale and accept an invite — friction
  for casual sharing, but that friction *is* the access control. Same host-uptime
  dependency as Options A/B.
- **Good for**: a small, known group (e.g. a specific playgroup) who don't mind
  installing a client, when public exposure isn't wanted at all.

### Option D — Self-hosted VPS (full stack, own control)

Provision a small VPS (e.g. Hetzner, DigitalOcean, Linode), run the *entire* stack
there via Docker Compose (extend the existing `docker-compose.yml` to also build/run
the Next.js app alongside Postgres, or run `pnpm build && pnpm start` directly on the
box), and put a reverse proxy (Caddy is the low-effort choice — automatic Let's
Encrypt HTTPS from one `Caddyfile` line) in front for TLS + a real domain.

- **Reach**: public internet, real domain, always-on (independent of the owner's own
  machine).
- **Effort**: medium — provision the box, write an app `Dockerfile` (doesn't exist yet
  — today's `docker-compose.yml` only runs Postgres), wire up the reverse proxy, buy/
  point a domain, set up remote `pnpm prisma migrate deploy` for schema changes, decide
  a deploy method (manual `git pull` + rebuild, or a small CI job).
- **Cost**: ~$5–12/mo VPS + a few dollars/yr for a domain.
- **Caveats**: the owner is now responsible for OS patching, Postgres backups (nothing
  currently backs up the Docker volume), and uptime — this is "running a real server,"
  not "sharing a dev instance."
- **Good for**: a durable, always-on, fully-owned deployment with no per-seat platform
  lock-in, once the app is stable enough to be worth operating long-term.

### Option E — Managed PaaS (Vercel/Railway/Render for the app + Neon/Supabase/Railway for Postgres)

Deploy the Next.js app to a platform built for it (Vercel is the natural fit — same
company as Next.js, zero-config builds) and point it at a managed Postgres provider
(Neon or Supabase have serverless-friendly free tiers; Railway can host both app and DB
in one project).

- **Reach**: public internet, real domain (platform-provided subdomain or custom),
  always-on, scales without the owner managing servers.
- **Effort**: medium — mostly configuration, not infrastructure: connect the GitHub
  repo, set env vars in the platform's dashboard, point `DATABASE_URL` at the managed
  Postgres instance, run `pnpm prisma migrate deploy` against it once. No `Dockerfile`
  or OS admin needed.
- **Cost**: free tiers cover small/hobby usage on most of these; watch the ~650MB
  current DB size against whichever provider's free-tier storage cap, and note
  serverless Postgres (Neon) can have cold-start latency on the first query after
  idle.
- **Caveats**: less infrastructure control than a VPS (acceptable trade for this app);
  multiple moving pieces from different vendors (app host + DB host) instead of one.
- **Good for**: the lowest-operational-burden path to a real, durable, public
  deployment — no server to patch, backups typically handled by the DB provider.

## Comparison

| Option | Reach | Always-on? | HTTPS | Setup effort | Ongoing cost | Ongoing ops burden |
|---|---|---|---|---|---|---|
| A. LAN | Same network only | No (host must run) | No | Minimal | Free | None |
| B. Tunnel | Public URL | No (host must run) | Yes | Low | Free–low | Low |
| C. Tailscale | Invited devices only | No (host must run) | Optional | Low | Free | Low |
| D. VPS | Public, own domain | Yes | Yes (via Caddy) | Medium | ~$5–12/mo | Medium (patching, backups) |
| E. Managed PaaS | Public, own/platform domain | Yes | Yes | Medium | Free–low | Low (platform-managed) |

## Recommendation

Match the option to how long-lived and how public the sharing need actually is, rather
than jumping straight to "deploy it for real":

- **Just want to show someone today**: Option B (tunnel) — zero infrastructure change,
  reversible in one command.
- **A fixed small group, indefinitely, no public exposure wanted**: Option C
  (Tailscale) — access control is "who's on the tailnet," not a public URL to secure.
- **Ready to treat this as a real, durable app other people rely on**: Option E
  (managed PaaS) before Option D — same end state (public URL, always-on, real OAuth
  app) with materially less ops burden, and it's the natural on-ramp `PROJECT_PLAN.md`
  already gestures at ("Revisit once the core loop ... is solid"). Option D is worth
  revisiting later only if platform cost or control becomes a real constraint.

## Open questions — resolved

1. ~~Who is "other users" here...~~ **Resolved**: a small known group today, with the access
   mechanism deliberately chosen (app-layer allowlist, not network-layer) so it can widen to
   the public later without a redeployment. See design doc Decisions 1–2.
2. ~~If public: what domain...~~ **Resolved (deferred)**: no domain purchased — Tailscale
   Funnel's free `ts.net` address is used instead. Revisit only if/when a public move makes a
   branded domain worth it. See design doc Decision 4.
3. ~~Any budget ceiling...~~ **Resolved**: $0, as a direct consequence of decisions 3–4 (no
   VPS/PaaS, no domain). See design doc "Cost."
4. ~~Should this become a numbered phase plan...~~ **Resolved**: yes —
   [`plans/PHASE_9_PLAN.md`](PHASE_9_PLAN.md).
