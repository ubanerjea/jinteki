-- AlterTable
ALTER TABLE "Pack" ADD COLUMN     "cardCycleId" TEXT,
ADD COLUMN     "cardSetTypeId" TEXT,
ADD COLUMN     "dateRelease" TIMESTAMP(3),
ADD COLUMN     "position" INTEGER,
ADD COLUMN     "raw" JSONB,
ADD COLUMN     "size" INTEGER;

-- CreateTable
CREATE TABLE "Cycle" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dateRelease" TIMESTAMP(3),
    "position" INTEGER,
    "raw" JSONB NOT NULL,

    CONSTRAINT "Cycle_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Pack" ADD CONSTRAINT "Pack_cardCycleId_fkey" FOREIGN KEY ("cardCycleId") REFERENCES "Cycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
