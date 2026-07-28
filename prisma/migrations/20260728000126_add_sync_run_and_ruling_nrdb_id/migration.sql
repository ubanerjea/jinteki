-- Phase 2: add SyncRun log table and Ruling.nrdbId natural key.
--
-- Generated via `prisma migrate diff` against the live dev database and
-- hand-trimmed: the raw `prisma migrate diff` output also proposed dropping
-- the five pg_trgm GIN indexes added by hand in the Phase 1 migration
-- (Card_title_trgm_idx, Card_text_trgm_idx, Decklist_name_trgm_idx,
-- RuleSection_title_trgm_idx, RuleSection_bodyText_trgm_idx). Those aren't
-- expressed in schema.prisma via Prisma's native index syntax, so the diff
-- tool doesn't know about them and treats them as drift to be removed. That
-- DropIndex block has been deliberately excluded from this file - those
-- indexes must stay.
--
-- Ruling table has zero rows at the time this migration is written (no sync
-- has run yet), so ADD COLUMN ... NOT NULL is safe without a default/backfill.

-- CreateEnum
CREATE TYPE "SyncType" AS ENUM ('FACTIONS_PACKS', 'CARDS', 'DECKLISTS', 'RULINGS');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');

-- AlterTable
ALTER TABLE "Ruling" ADD COLUMN     "nrdbId" INTEGER NOT NULL;

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL,
    "type" "SyncType" NOT NULL,
    "status" "SyncStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "recordCount" INTEGER,
    "errorMessage" TEXT,

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SyncRun_type_status_startedAt_idx" ON "SyncRun"("type", "status", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Ruling_nrdbId_key" ON "Ruling"("nrdbId");
