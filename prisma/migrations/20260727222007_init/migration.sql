-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'USER');

-- CreateTable
CREATE TABLE "Faction" (
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "Faction_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "Pack" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Pack_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "Card" (
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "typeCode" TEXT NOT NULL,
    "factionCode" TEXT NOT NULL,
    "sideCode" TEXT NOT NULL,
    "text" TEXT,
    "keywords" TEXT[],
    "packCode" TEXT,
    "raw" JSONB NOT NULL,

    CONSTRAINT "Card_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "Decklist" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "identityCode" TEXT NOT NULL,
    "raw" JSONB NOT NULL,

    CONSTRAINT "Decklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecklistCard" (
    "decklistId" TEXT NOT NULL,
    "cardCode" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "DecklistCard_pkey" PRIMARY KEY ("decklistId","cardCode")
);

-- CreateTable
CREATE TABLE "Ruling" (
    "id" SERIAL NOT NULL,
    "cardCode" TEXT NOT NULL,
    "question" TEXT,
    "answer" TEXT,
    "textRuling" TEXT,
    "nsgRulesTeamVerified" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ruling_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleSection" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "anchor" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,

    CONSTRAINT "RuleSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleMapping" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "ruleSectionId" TEXT NOT NULL,

    CONSTRAINT "RuleMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "CardFavorite" (
    "userId" TEXT NOT NULL,
    "cardCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardFavorite_pkey" PRIMARY KEY ("userId","cardCode")
);

-- CreateTable
CREATE TABLE "DecklistFavorite" (
    "userId" TEXT NOT NULL,
    "decklistId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DecklistFavorite_pkey" PRIMARY KEY ("userId","decklistId")
);

-- CreateIndex
CREATE INDEX "RuleMapping_key_idx" ON "RuleMapping"("key");

-- CreateIndex
CREATE UNIQUE INDEX "RuleMapping_key_ruleSectionId_key" ON "RuleMapping"("key", "ruleSectionId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_factionCode_fkey" FOREIGN KEY ("factionCode") REFERENCES "Faction"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_packCode_fkey" FOREIGN KEY ("packCode") REFERENCES "Pack"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decklist" ADD CONSTRAINT "Decklist_identityCode_fkey" FOREIGN KEY ("identityCode") REFERENCES "Card"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecklistCard" ADD CONSTRAINT "DecklistCard_decklistId_fkey" FOREIGN KEY ("decklistId") REFERENCES "Decklist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecklistCard" ADD CONSTRAINT "DecklistCard_cardCode_fkey" FOREIGN KEY ("cardCode") REFERENCES "Card"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ruling" ADD CONSTRAINT "Ruling_cardCode_fkey" FOREIGN KEY ("cardCode") REFERENCES "Card"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardFavorite" ADD CONSTRAINT "CardFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardFavorite" ADD CONSTRAINT "CardFavorite_cardCode_fkey" FOREIGN KEY ("cardCode") REFERENCES "Card"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecklistFavorite" ADD CONSTRAINT "DecklistFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecklistFavorite" ADD CONSTRAINT "DecklistFavorite_decklistId_fkey" FOREIGN KEY ("decklistId") REFERENCES "Decklist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Trigram search support (pg_trgm + GIN indexes)
-- Prisma's schema DSL can't express trigram indexes natively, so these are
-- added here as raw SQL, per PHASE_1_PLAN.md.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "Card_title_trgm_idx" ON "Card" USING GIN ("title" gin_trgm_ops);
CREATE INDEX "Card_text_trgm_idx" ON "Card" USING GIN ("text" gin_trgm_ops);
CREATE INDEX "Decklist_name_trgm_idx" ON "Decklist" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "RuleSection_title_trgm_idx" ON "RuleSection" USING GIN ("title" gin_trgm_ops);
CREATE INDEX "RuleSection_bodyText_trgm_idx" ON "RuleSection" USING GIN ("bodyText" gin_trgm_ops);
