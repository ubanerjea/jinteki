-- AlterEnum
ALTER TYPE "SyncType" ADD VALUE 'CARD_POOLS';

-- AlterTable
ALTER TABLE "Format" ADD COLUMN     "activeCardPoolId" TEXT;

-- CreateTable
CREATE TABLE "CardPool" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "formatId" TEXT NOT NULL,
    "cardCycleIds" TEXT[],
    "rotationOrdinal" INTEGER,
    "rotationDateStart" TIMESTAMP(3),
    "raw" JSONB NOT NULL,

    CONSTRAINT "CardPool_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CardPool" ADD CONSTRAINT "CardPool_formatId_fkey" FOREIGN KEY ("formatId") REFERENCES "Format"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
