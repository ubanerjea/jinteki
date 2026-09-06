// Grouping, influence, and agenda arithmetic for /decklists/[id].

function attributes(raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const attrs = (raw as { attributes?: unknown }).attributes;
  if (!attrs || typeof attrs !== "object") return undefined;
  return attrs as Record<string, unknown>;
}

function numberAttr(raw: unknown, key: string): number | null {
  const value = attributes(raw)?.[key];
  return typeof value === "number" ? value : null;
}

export function cardInfluenceUsed(
  card: { factionCode: string; raw: unknown },
  identityFactionCode: string,
  quantity: number,
): number {
  if (card.factionCode === identityFactionCode) return 0;
  const cost = numberAttr(card.raw, "influence_cost");
  if (cost == null) return 0;
  return cost * quantity;
}

export function deckInfluenceUsed(
  cards: { quantity: number; card: { factionCode: string; raw: unknown } }[],
  identityFactionCode: string,
): number {
  return cards.reduce(
    (sum, row) =>
      sum + cardInfluenceUsed(row.card, identityFactionCode, row.quantity),
    0,
  );
}

export function influenceLimit(identityRaw: unknown): number | null {
  return numberAttr(identityRaw, "influence_limit");
}

export function deckAgendaPoints(
  cards: { quantity: number; card: { raw: unknown } }[],
): number {
  return cards.reduce((sum, row) => {
    const points = numberAttr(row.card.raw, "agenda_points");
    return sum + (points ?? 0) * row.quantity;
  }, 0);
}

export function influencePips(used: number): string {
  return used > 0 ? "●".repeat(used) : "";
}

export function formatInfluenceLabel(
  usedInfluence: number,
  limit: number | null,
): string {
  const pips = influencePips(usedInfluence);
  const prefix = `Influence: ${pips}${usedInfluence > 0 ? " " : ""}`;
  return limit != null
    ? `${prefix}${usedInfluence}/${limit}`
    : `${prefix}${usedInfluence}`;
}

export interface DecklistSection<T> {
  key: string;
  heading: string;
  quantitySum: number;
  cards: T[];
}

export function groupDecklistCards<T extends { quantity: number }>(
  cards: T[],
  keyOf: (card: T) => string,
  labelOf: (card: T) => string,
): DecklistSection<T>[] {
  const groups: DecklistSection<T>[] = [];
  for (const card of cards) {
    const key = keyOf(card);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.cards.push(card);
      last.quantitySum += card.quantity;
    } else {
      groups.push({
        key,
        heading: labelOf(card),
        quantitySum: card.quantity,
        cards: [card],
      });
    }
  }
  return groups;
}

export function sectionTitle(heading: string, quantitySum: number): string {
  return `${heading} (${quantitySum})`;
}
