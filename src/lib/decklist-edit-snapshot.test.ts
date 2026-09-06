import { describe, expect, it } from "vitest";

import {
  isDecklistEditDirty,
  snapshotFromFormData,
  type DecklistEditSnapshot,
} from "./decklist-edit-snapshot";

const saved: DecklistEditSnapshot = {
  name: "My Deck",
  notes: "hello",
  identityCode: "noise",
  isPublic: false,
  slots: [
    { cardCode: "sure_gamble", quantity: 3 },
    { cardCode: "diesel", quantity: 2 },
  ],
};

function formSnapshot(
  overrides: {
    name?: string;
    notes?: string;
    identityCode?: string;
    isPublic?: boolean;
    slots?: { cardCode: string; quantity: string | number }[];
    extra?: Record<string, string>;
  } = {},
): DecklistEditSnapshot {
  const formData = new FormData();
  formData.set("id", "deck-1");
  formData.set("name", overrides.name ?? saved.name);
  formData.set("notes", overrides.notes ?? saved.notes);
  formData.set("identityCode", overrides.identityCode ?? saved.identityCode);
  if (overrides.isPublic ?? saved.isPublic) {
    formData.set("isPublic", "1");
  }
  const slots = overrides.slots ?? saved.slots;
  for (const slot of slots) {
    formData.append("cardCode", slot.cardCode);
    formData.append("quantity", String(slot.quantity));
  }
  if (overrides.extra) {
    for (const [key, value] of Object.entries(overrides.extra)) {
      formData.set(key, value);
    }
  }
  return snapshotFromFormData(formData);
}

describe("isDecklistEditDirty", () => {
  it("is clean when the form matches the saved snapshot", () => {
    expect(isDecklistEditDirty(saved, formSnapshot())).toBe(false);
  });

  it("is clean for the same values even when slot order differs", () => {
    expect(
      isDecklistEditDirty(
        saved,
        formSnapshot({
          slots: [
            { cardCode: "diesel", quantity: 2 },
            { cardCode: "sure_gamble", quantity: 3 },
          ],
        }),
      ),
    ).toBe(false);
  });

  it("is clean when quantity arrives as a numeric string", () => {
    expect(
      isDecklistEditDirty(
        saved,
        formSnapshot({
          slots: [
            { cardCode: "sure_gamble", quantity: "3" },
            { cardCode: "diesel", quantity: "2" },
          ],
        }),
      ),
    ).toBe(false);
  });

  it("ignores extra form fields such as q, order, and id", () => {
    expect(
      isDecklistEditDirty(
        saved,
        formSnapshot({ extra: { q: "noise", order: "set" } }),
      ),
    ).toBe(false);
  });

  it("is dirty when the name changes", () => {
    expect(isDecklistEditDirty(saved, formSnapshot({ name: "Other" }))).toBe(
      true,
    );
  });

  it("is dirty when notes change", () => {
    expect(isDecklistEditDirty(saved, formSnapshot({ notes: "bye" }))).toBe(
      true,
    );
  });

  it("is dirty when identity changes", () => {
    expect(
      isDecklistEditDirty(saved, formSnapshot({ identityCode: "kate" })),
    ).toBe(true);
  });

  it("is dirty when the publish checkbox changes", () => {
    expect(isDecklistEditDirty(saved, formSnapshot({ isPublic: true }))).toBe(
      true,
    );
  });

  it("is dirty when a quantity changes", () => {
    expect(
      isDecklistEditDirty(
        saved,
        formSnapshot({
          slots: [
            { cardCode: "sure_gamble", quantity: 2 },
            { cardCode: "diesel", quantity: 2 },
          ],
        }),
      ),
    ).toBe(true);
  });

  it("is dirty when a slot is added or removed", () => {
    expect(
      isDecklistEditDirty(
        saved,
        formSnapshot({
          slots: [
            ...saved.slots,
            { cardCode: "easy_mark", quantity: 1 },
          ],
        }),
      ),
    ).toBe(true);
    expect(
      isDecklistEditDirty(
        saved,
        formSnapshot({ slots: [saved.slots[0]] }),
      ),
    ).toBe(true);
  });
});
