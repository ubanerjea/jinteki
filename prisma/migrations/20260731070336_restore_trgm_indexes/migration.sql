-- Restores the five pg_trgm GIN indexes that the previous migration
-- (20260731065236_add_formats_restrictions) accidentally dropped.
--
-- Root cause: these indexes were created by hand in the Phase 1 init
-- migration (CREATE INDEX ... USING GIN (col gin_trgm_ops)) because
-- Prisma's schema DSL has no way to express gin_trgm_ops. `prisma migrate
-- dev`'s auto-generated diff doesn't understand them, sees them as "extra"
-- relative to schema.prisma, and proposes dropping them on every migration
-- it generates. Three prior migrations
-- (20260728000126_add_sync_run_and_ruling_nrdb_id,
-- 20260728141013_add_rules_sync_type, 20260728143000_add_rule_mapping_fk)
-- each have a comment documenting that their auto-generated SQL had to be
-- hand-edited to strip out exactly these DROP INDEX statements before
-- applying. This migration's generation skipped that edit, so the DROP
-- INDEX statements went through and were applied to the live database.
--
-- Confirmed via `psql \di` that all five were actually gone (not just
-- present-in-file-but-unapplied) before writing this fix, and confirmed via
-- `\d` on the previous migration's file that it really did contain the drops
-- (this was not a pre-existing/environmental issue - it was introduced by
-- that migration).
--
-- See the warning comment now added directly in schema.prisma - every
-- future migration must be checked for these same spurious drops before
-- applying, since this will keep recurring as long as these indexes are
-- expressed as hand-written SQL rather than Prisma-native schema.

CREATE INDEX "Card_title_trgm_idx" ON "Card" USING GIN ("title" gin_trgm_ops);
CREATE INDEX "Card_text_trgm_idx" ON "Card" USING GIN ("text" gin_trgm_ops);
CREATE INDEX "Decklist_name_trgm_idx" ON "Decklist" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "RuleSection_title_trgm_idx" ON "RuleSection" USING GIN ("title" gin_trgm_ops);
CREATE INDEX "RuleSection_bodyText_trgm_idx" ON "RuleSection" USING GIN ("bodyText" gin_trgm_ops);
