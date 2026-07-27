// Seed script for jinteki — Phase 1.
//
// Only seeds RuleMapping from the curated data file. RuleSection itself is
// NOT seeded here: it has zero rows until the rules-doc scraper (a later
// phase) runs, per PHASE_1_PLAN.md. RuleMapping.ruleSectionId is a plain
// string column with no db-level FK to RuleSection for exactly that reason,
// so this seed is expected to succeed even with RuleSection empty.
import { PrismaClient } from "@prisma/client";
import { ruleMappingData } from "./rule-mapping-data";

const prisma = new PrismaClient();

async function main() {
  for (const entry of ruleMappingData) {
    await prisma.ruleMapping.upsert({
      where: {
        key_ruleSectionId: {
          key: entry.key,
          ruleSectionId: entry.ruleSectionId,
        },
      },
      update: {},
      create: entry,
    });
  }

  console.log(`Seeded ${ruleMappingData.length} RuleMapping row(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
