-- AlterTable
ALTER TABLE "Decklist" ADD COLUMN     "createdAt" TIMESTAMP(3),
ADD COLUMN     "nrdbUserId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Decklist_createdAt_idx" ON "Decklist"("createdAt");

-- CreateIndex
CREATE INDEX "Decklist_updatedAt_idx" ON "Decklist"("updatedAt");
