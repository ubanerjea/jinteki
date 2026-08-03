# Local Postgres backups

Ad-hoc `pg_dump` snapshots of the local `jinteki` database, taken before risky
schema experiments (e.g. testing a `prisma migrate dev` change) so they can be
undone quickly if something goes wrong.

**The `.dump` files themselves are gitignored** (`/prisma/pg_dump/*.dump` in
`.gitignore`) — this file (`README.md`) is the only thing in this directory
meant to be committed. Two reasons the dumps aren't tracked:

1. **Size.** A full dump is tens-to-hundreds of MB (`DecklistCard`/`Decklist`
   dominate — `pg_total_relation_size` showed 324 MB / 179 MB respectively
   out of a 525 MB database as of 2026-08-03). Git isn't built for that —
   every clone/fetch would pay for it forever, even after the file is later
   deleted from the working tree.
2. **Fully re-creatable.** Every table here is either synced from NRDB
   (`Card`, `Decklist`, `DecklistCard`, `Ruling`, `Format`, `Restriction`) or
   scraped from NSG's rules doc (`RuleSection`) — `pnpm sync:all` rebuilds
   all of it from scratch. The one thing a resync *can't* recreate is real
   local state: your actual signed-in `User`/`Account`/`Session` rows from
   going through GitHub OAuth for real, and any manual admin-role promotion —
   that's the main reason to keep one of these backups around before an
   experiment, rather than relying on resync alone.

## Taking a backup

From the repo root, with the `postgres` container running (`docker compose
ps` to check):

```bash
docker compose exec -T postgres pg_dump -U jinteki -d jinteki -Fc \
  > "prisma/pg_dump/jinteki_$(date -u +%Y%m%d%H%M%S).dump"
```

- `-Fc` (custom format): compressed, and restorable selectively/in parallel
  via `pg_restore` (unlike a plain `.sql` dump, which is bigger and can only
  be replayed straight through via `psql`).
- The `$(date ...)` suffix keeps multiple snapshots distinguishable if you
  take more than one — nothing here auto-deletes older ones, so remove old
  `.dump` files by hand once you're past needing them (they're gitignored,
  but still take up real disk space locally).

Sanity-check a dump is valid without restoring anything (lists its table of
contents):

```bash
docker compose exec -T postgres pg_restore --list < prisma/pg_dump/jinteki_<timestamp>.dump | head -20
```

## Restoring a backup

**This drops and replaces the entire live `jinteki` database** — only do
this if you actually want to discard whatever's in it right now (e.g. an
experiment went wrong and you want back exactly where a specific backup was
taken).

```bash
# Terminate other connections and drop/recreate the database first, since
# pg_restore can't drop a database that's in use (Next.js/Prisma likely
# still holds a connection pool open).
docker compose exec -T postgres psql -U jinteki -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'jinteki' AND pid <> pg_backend_pid();"
docker compose exec -T postgres psql -U jinteki -d postgres -c "DROP DATABASE jinteki;"
docker compose exec -T postgres psql -U jinteki -d postgres -c "CREATE DATABASE jinteki;"

# Restore from the dump (-1 wraps the whole restore in a single transaction
# - either it all applies or none of it does, no half-restored state).
docker compose exec -T postgres pg_restore -U jinteki -d jinteki -1 < prisma/pg_dump/jinteki_<timestamp>.dump
```

After restoring, verify it actually landed (same discipline as
`PROJECT_PLAN.md`'s "Phase verification standards" — don't trust a
successful-looking command alone):

```bash
docker compose exec -T postgres psql -U jinteki -d jinteki -c "\dt"
docker compose exec -T postgres psql -U jinteki -d jinteki -c "SELECT count(*) FROM \"Card\"; SELECT count(*) FROM \"Decklist\"; SELECT count(*) FROM \"User\";"
```

If the restored database predates a schema change you've since made locally
(e.g. it's missing a table/column a newer migration added), run
`npx prisma migrate deploy` afterward to bring it back up to date with
whatever's currently in `prisma/migrations/` — `pg_restore` only restores
what was in the dump, it doesn't know about migrations written after that
snapshot was taken.
