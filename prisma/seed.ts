// Seed script for jinteki.
//
// Only seeds RuleMapping from the curated data file. RuleSection itself is
// NOT seeded here - it's populated by the rules-doc scraper (`pnpm
// sync:rules`, added in Phase 3), not this seed script.
//
// Phase 3: RuleMapping.ruleSectionId now has a real db-level FK to
// RuleSection (added once RuleSection had real rows - see the migration and
// PHASE_3_PLAN.md), so `pnpm sync:rules` must be run at least once before
// this seed can succeed - every ruleSectionId referenced in
// rule-mapping-data.ts must already exist as a real RuleSection row.
import { PrismaClient } from "@prisma/client";
import { formatDescriptionData } from "./format-description-data";
import { ruleMappingData } from "./rule-mapping-data";

const prisma = new PrismaClient();

async function main() {
  for (const entry of ruleMappingData) {
    // `note` is documentation-only (see rule-mapping-data.ts) - not a real
    // RuleMapping column, so it's deliberately excluded from the write.
    const data = { key: entry.key, ruleSectionId: entry.ruleSectionId };
    await prisma.ruleMapping.upsert({
      where: {
        key_ruleSectionId: {
          key: data.key,
          ruleSectionId: data.ruleSectionId,
        },
      },
      update: {},
      create: data,
    });
  }

  // Reconcile: delete any RuleMapping row whose (key, ruleSectionId) pair is
  // no longer present in ruleMappingData - otherwise a removed entry leaves
  // a silent orphan row behind (upsert alone never deletes).
  const { count: deletedCount } = await prisma.ruleMapping.deleteMany({
    where: {
      NOT: {
        OR: ruleMappingData.map((entry) => ({
          key: entry.key,
          ruleSectionId: entry.ruleSectionId,
        })),
      },
    },
  });

  console.log(
    `Seeded ${ruleMappingData.length} RuleMapping row(s), deleted ${deletedCount} orphaned row(s).`,
  );

  // Format.description: hand-curated prose (see format-description-data.ts
  // for why - NRDB's API has no description field to sync). Format rows
  // themselves are created/reconciled entirely by
  // src/sync/sync-restrictions.ts, not this seed - so this only ever
  // *updates* an existing row's description, never creates or deletes a
  // Format row. `updateMany` (rather than `update`) is deliberate: it's a
  // no-op instead of throwing if sync:restrictions hasn't run yet and the
  // row doesn't exist, so seed order relative to the sync isn't load-bearing.
  let updatedFormatCount = 0;
  for (const entry of formatDescriptionData) {
    const { count } = await prisma.format.updateMany({
      where: { id: entry.id },
      data: { description: entry.description },
    });
    updatedFormatCount += count;
  }

  console.log(
    `Updated description on ${updatedFormatCount}/${formatDescriptionData.length} Format row(s).`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
