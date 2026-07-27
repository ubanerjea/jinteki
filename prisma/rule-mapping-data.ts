// Card type/subtype/keyword -> comprehensive-rules-section mapping.
//
// This is the "code/seed file" from PROJECT_PLAN.md's architecture decision:
// the real mapping changes rarely and is small enough to review as a plain
// diff, so it's maintained here rather than as a DB-editable admin table.
//
// Phase 1 note: this is intentionally NOT the real curated mapping. It's a
// couple of obvious placeholder entries just to prove the seed mechanism
// (prisma/seed.ts) runs end-to-end. Populating this properly, alongside the
// rules-doc scraper that will actually populate RuleSection, is future work.
export interface RuleMappingEntry {
  key: string;
  ruleSectionId: string;
}

export const ruleMappingData: RuleMappingEntry[] = [
  { key: "Operation", ruleSectionId: "3.3" },
  { key: "Agenda", ruleSectionId: "3.2" },
];
