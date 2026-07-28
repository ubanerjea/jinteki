-- Add the RULES value to the SyncType enum (Phase 3: rules-doc scraper /
-- pnpm sync:rules). Hand-written from `prisma migrate diff`'s output with
-- the AlterEnum line kept and the DropIndex statements deliberately
-- excluded - `migrate diff` doesn't understand the hand-written pg_trgm GIN
-- indexes (they aren't expressed via Prisma's schema syntax) and proposes
-- dropping all five of them every time it's run, same issue Phase 2 hit.
-- Those indexes must survive; see agent-reports/phase-2.md for the same note.

ALTER TYPE "SyncType" ADD VALUE 'RULES';
