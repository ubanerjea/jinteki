# jinteki

Android: Netrunner card database, decklists, rulings, and comprehensive-rules glossary. See [`plans/PROJECT_PLAN.md`](plans/PROJECT_PLAN.md) for the full architecture and scope.

## Prerequisites

- Node.js + [pnpm](https://pnpm.io/)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for Postgres)

## Working directory

Unless noted otherwise, every command below must be run from the repo root (`C:\Users\Unz\git\jinteki`) — that's where `package.json`, `docker-compose.yml`, and `.env` live, and what `pnpm`/`docker compose` resolve relative to.

## Setup

```bash
pnpm install
docker compose up -d
pnpm prisma migrate deploy
pnpm prisma db seed
```

Copy `.env.example` to `.env` and fill in real values (Postgres credentials, `AUTH_SECRET`, GitHub OAuth app credentials) before running the app.

## Running the app

### Dev mode (normal day-to-day use)

Hot reload, easier debugging. Use this unless you specifically need to test the production build.

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

**To stop:** `Ctrl+C` in the terminal it's running in.

**If you don't have that terminal** (e.g. it was started in another session/window), find and kill whatever is bound to port 3000. These are plain PowerShell/OS commands — they work from *any* directory, not just the repo root:

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen | Select-Object OwningProcess
Stop-Process -Id <PID from above> -Force
```

### Production mode (verifying the real build artifact)

No hot reload — rebuild after every code change. Use this to confirm the actual deployable bundle works, not just that it compiles.

```bash
pnpm build
pnpm start
```

Stop the same way as dev mode above.

### Checking whether it's up

Works regardless of dev or production mode — makes a real HTTP request rather than just checking that a process exists:

```powershell
Invoke-WebRequest -Uri http://localhost:3000 -UseBasicParsing | Select-Object StatusCode
```

`StatusCode 200` means the app is up and serving requests. If it errors out (e.g. "Unable to connect"), nothing is listening on port 3000.

## Viewing the Postgres database

### Managing the container

Run from the repo root (needs `docker-compose.yml`):

| Task | Command |
|---|---|
| View running Docker containers | `docker ps` |
| Check Postgres is up (healthy) | `docker compose ps` |
| Start an existing (stopped) container | `docker compose start` |
| Stop the container | `docker compose stop` |
| Compose up (create/recreate + start, picking up any `docker-compose.yml` changes) | `docker compose up -d` |

The Docker container publishes port 5432 to the host, so any Postgres client works, not just tools run inside the container.

| Method | Where to run it | Command / connection |
|---|---|---|
| **Prisma Studio** (recommended — no extra install) | Repo root | `pnpm prisma studio` → opens `http://localhost:5555` |
| **psql inside the container** | Repo root (needs `docker-compose.yml`) | `docker compose exec postgres psql -U jinteki -d jinteki` |
| **External GUI client** (pgAdmin, TablePlus, DBeaver, etc.) | Anywhere — it's a separate app, not a repo command | Host `localhost`, port `5432`, db `jinteki`, user/password from `.env` |

## Project docs

- [`plans/PROJECT_PLAN.md`](plans/PROJECT_PLAN.md) — architecture and scope decisions
- [`plans/PHASE_1_PLAN.md`](plans/PHASE_1_PLAN.md), [`plans/PHASE_2_PLAN.md`](plans/PHASE_2_PLAN.md) — phase build plans
- [`agent-reports/`](agent-reports/) — what was actually built and verified per phase
