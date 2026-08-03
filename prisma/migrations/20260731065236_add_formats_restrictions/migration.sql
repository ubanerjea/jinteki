-- AlterEnum
ALTER TYPE "SyncType" ADD VALUE 'RESTRICTIONS';

-- DropIndex
DROP INDEX "Card_text_trgm_idx";

-- DropIndex
DROP INDEX "Card_title_trgm_idx";

-- DropIndex
DROP INDEX "Decklist_name_trgm_idx";

-- DropIndex
DROP INDEX "RuleSection_bodyText_trgm_idx";

-- DropIndex
DROP INDEX "RuleSection_title_trgm_idx";

-- CreateTable
CREATE TABLE "Format" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "activeRestrictionId" TEXT,
    "raw" JSONB NOT NULL,

    CONSTRAINT "Format_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Restriction" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "formatId" TEXT NOT NULL,
    "dateStart" TIMESTAMP(3),
    "raw" JSONB NOT NULL,

    CONSTRAINT "Restriction_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Restriction" ADD CONSTRAINT "Restriction_formatId_fkey" FOREIGN KEY ("formatId") REFERENCES "Format"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
