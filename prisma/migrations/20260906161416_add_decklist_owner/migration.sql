-- AlterTable
ALTER TABLE "Decklist" ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "ownerId" TEXT;

-- CreateIndex
CREATE INDEX "Decklist_ownerId_idx" ON "Decklist"("ownerId");

-- AddForeignKey
ALTER TABLE "Decklist" ADD CONSTRAINT "Decklist_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
