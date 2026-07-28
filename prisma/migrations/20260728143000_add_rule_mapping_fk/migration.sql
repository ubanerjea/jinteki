-- Activates the RuleMapping.ruleSectionId -> RuleSection.id foreign key,
-- deliberately deferred since Phase 1 (see schema.prisma's comment on
-- RuleSection/RuleMapping) until RuleSection actually had real rows.
--
-- Sequenced per PHASE_3_PLAN.md: `pnpm sync:rules` was run for real first
-- (119 RuleSection rows, confirmed via psql), then prisma/rule-mapping-data.ts
-- was replaced with the real curated mapping and reseeded (28 RuleMapping
-- rows, confirmed via psql that every ruleSectionId referenced resolves to a
-- real RuleSection.id - see verify-mapping.mjs's output in
-- agent-reports/phase-3.md), and only then is this FK added.
--
-- Hand-written from `prisma migrate diff`'s output with the AddForeignKey
-- line kept and the DropIndex statements deliberately excluded -
-- `migrate diff` doesn't understand the hand-written pg_trgm GIN indexes
-- (not expressed via Prisma's schema syntax) and proposes dropping all five
-- of them every time it's run - same issue hit in Phase 2's and this
-- phase's earlier RULES-enum migration. Those indexes must survive.

ALTER TABLE "RuleMapping" ADD CONSTRAINT "RuleMapping_ruleSectionId_fkey" FOREIGN KEY ("ruleSectionId") REFERENCES "RuleSection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
