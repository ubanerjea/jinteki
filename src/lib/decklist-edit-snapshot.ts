export type DecklistEditSlotSnapshot = {
  cardCode: string;
  quantity: number;
};

export type DecklistEditSnapshot = {
  name: string;
  notes: string;
  identityCode: string;
  isPublic: boolean;
  slots: DecklistEditSlotSnapshot[];
};

export function snapshotFromFormData(formData: FormData): DecklistEditSnapshot {
  const cardCodes = formData.getAll("cardCode").map(String);
  const quantities = formData.getAll("quantity").map((value) => Number(value));
  return {
    name: String(formData.get("name") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    identityCode: String(formData.get("identityCode") ?? ""),
    isPublic: formData.get("isPublic") === "1",
    slots: cardCodes.map((cardCode, i) => ({
      cardCode,
      quantity: quantities[i] ?? 0,
    })),
  };
}

export function readDecklistEditSnapshot(
  form: HTMLFormElement,
): DecklistEditSnapshot {
  return snapshotFromFormData(new FormData(form));
}

export function isDecklistEditDirty(
  saved: DecklistEditSnapshot,
  current: DecklistEditSnapshot,
): boolean {
  if (saved.name !== current.name) return true;
  if (saved.notes !== current.notes) return true;
  if (saved.identityCode !== current.identityCode) return true;
  if (saved.isPublic !== current.isPublic) return true;
  if (saved.slots.length !== current.slots.length) return true;
  const currentQty = new Map(
    current.slots.map((slot) => [slot.cardCode, slot.quantity]),
  );
  for (const slot of saved.slots) {
    if (currentQty.get(slot.cardCode) !== slot.quantity) return true;
  }
  return false;
}
