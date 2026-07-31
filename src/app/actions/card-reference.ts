"use server";

// Server Action backing the right-click CardReference popover
// (src/components/card-reference.tsx). A Server Action rather than a new
// REST endpoint per PHASE_5_PLAN.md: "avoids adding a new REST endpoint for
// what's fundamentally a read triggered by a client interaction."
//
// The rule-section resolution itself is delegated to the pure,
// independently-tested resolveRuleSectionIds() (src/lib/rule-section-resolution.ts)
// - this function's own job is just: look up the card, fetch its rulings,
// fetch the RuleMapping rows that could possibly apply (key IN
// [typeCode, ...keywords]), then hand the type/keywords + those mapping
// rows to the pure resolver and hydrate the resulting section ids back into
// full RuleSection rows.

import { prisma } from "@/lib/prisma";
import { resolveRuleSectionIds } from "@/lib/rule-section-resolution";

export interface CardReferenceCard {
  code: string;
  title: string;
  factionCode: string;
  typeCode: string;
  sideCode: string;
  keywords: string[];
}

export interface CardReferenceRuling {
  id: number;
  question: string | null;
  answer: string | null;
  textRuling: string | null;
  nsgRulesTeamVerified: boolean;
}

export interface CardReferenceRuleSection {
  id: string;
  title: string;
  bodyText: string;
}

export interface CardReferenceData {
  card: CardReferenceCard | null;
  rulings: CardReferenceRuling[];
  ruleSections: CardReferenceRuleSection[];
}

export async function getCardReferenceData(
  cardCode: string,
): Promise<CardReferenceData> {
  const card = await prisma.card.findUnique({
    where: { code: cardCode },
    select: {
      code: true,
      title: true,
      factionCode: true,
      typeCode: true,
      sideCode: true,
      keywords: true,
    },
  });

  if (!card) {
    return { card: null, rulings: [], ruleSections: [] };
  }

  const [rulings, candidateMappings] = await Promise.all([
    prisma.ruling.findMany({
      where: { cardCode: card.code },
      orderBy: { id: "asc" },
      select: {
        id: true,
        question: true,
        answer: true,
        textRuling: true,
        nsgRulesTeamVerified: true,
      },
    }),
    prisma.ruleMapping.findMany({
      where: { key: { in: [card.typeCode, ...card.keywords] } },
      include: {
        ruleSection: {
          select: { id: true, title: true, bodyText: true },
        },
      },
    }),
  ]);

  const sectionIds = resolveRuleSectionIds(card, candidateMappings);
  const sectionsById = new Map(
    candidateMappings.map((m) => [m.ruleSection.id, m.ruleSection]),
  );
  const ruleSections = sectionIds
    .map((id) => sectionsById.get(id))
    .filter((s): s is CardReferenceRuleSection => s !== undefined);

  return { card, rulings, ruleSections };
}
