export type DecklistSlotCard = {
  title: string;
  typeCode: string;
  factionCode: string;
  sideCode: string;
  packCode: string | null;
  raw: unknown;
};

export type DecklistSlotRow = {
  cardCode: string;
  quantity: number;
  card: DecklistSlotCard;
};

export function addDecklistSlot(
  slots: DecklistSlotRow[],
  incoming: DecklistSlotRow,
): DecklistSlotRow[] {
  const qty = Math.max(1, Math.floor(incoming.quantity) || 1);
  const existing = slots.find((slot) => slot.cardCode === incoming.cardCode);
  if (!existing) {
    return [...slots, { ...incoming, quantity: qty }];
  }
  return slots.map((slot) =>
    slot.cardCode === incoming.cardCode
      ? { ...slot, quantity: slot.quantity + qty }
      : slot,
  );
}

export function removeDecklistSlot(
  slots: DecklistSlotRow[],
  cardCode: string,
): DecklistSlotRow[] {
  return slots.filter((slot) => slot.cardCode !== cardCode);
}

export function setDecklistSlotQuantity(
  slots: DecklistSlotRow[],
  cardCode: string,
  quantity: number,
): DecklistSlotRow[] {
  const qty = Math.max(1, Math.floor(quantity) || 1);
  return slots.map((slot) =>
    slot.cardCode === cardCode ? { ...slot, quantity: qty } : slot,
  );
}
