"use client";

// Client session for the edit page: slot add/remove/qty stay in working
// state until Save. Add/remove server actions still exist as a no-JS
// fallback (the forms POST if JS never hydrates). With JS they are
// preventDefault'd and staged here instead.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { useFormStatus } from "react-dom";

import { addDecklistCard } from "@/app/actions/decklists";
import { DecklistCardListBody } from "@/components/decklist-card-list-body";
import { useHasMounted } from "@/components/facet-picker";
import type { PackSortMeta } from "@/lib/decklist-card-order";
import {
  isDecklistEditDirty,
  type DecklistEditSnapshot,
} from "@/lib/decklist-edit-snapshot";
import {
  addDecklistSlot,
  removeDecklistSlot,
  setDecklistSlotQuantity,
  type DecklistSlotRow,
} from "@/lib/decklist-edit-slots";
import {
  deckAgendaPoints,
  deckInfluenceUsed,
  formatInfluenceLabel,
  influenceLimit,
} from "@/lib/decklist-view";
import type { SearchParamsInput } from "@/lib/search/types";

export type DecklistPackMetaJson = Record<
  string,
  { name: string; dateRelease: string | null }
>;

type AddableCard = {
  code: string;
  title: string;
  typeCode: string;
  factionCode: string;
  sideCode: string;
  packCode: string | null;
  raw: unknown;
};

function mapsFromPackJson(json: DecklistPackMetaJson): {
  packMeta: Map<string, PackSortMeta>;
  packNames: Map<string, string>;
} {
  const packMeta = new Map<string, PackSortMeta>();
  const packNames = new Map<string, string>();
  for (const [code, value] of Object.entries(json)) {
    packNames.set(code, value.name);
    packMeta.set(code, {
      name: value.name,
      dateRelease: value.dateRelease ? new Date(value.dateRelease) : null,
    });
  }
  return { packMeta, packNames };
}

function slotsSnapshot(slots: DecklistSlotRow[]): DecklistEditSnapshot["slots"] {
  return slots.map((slot) => ({
    cardCode: slot.cardCode,
    quantity: slot.quantity,
  }));
}

const DecklistEditContext = createContext<{
  dirty: boolean;
  hasMounted: boolean;
  saved: boolean;
  slots: DecklistSlotRow[];
  addCard: (card: AddableCard, quantity: number) => void;
  removeCard: (cardCode: string) => void;
  setQuantity: (cardCode: string, quantity: number) => void;
  identityCode: string;
  setIdentityCode: (code: string) => void;
  metadataDirty: {
    name: string;
    notes: string;
    isPublic: boolean;
  };
  setName: (name: string) => void;
  setNotes: (notes: string) => void;
  setIsPublic: (value: boolean) => void;
} | null>(null);

function useDecklistEdit() {
  const ctx = useContext(DecklistEditContext);
  if (!ctx) {
    throw new Error("DecklistEditProvider is required");
  }
  return ctx;
}

export function DecklistEditProvider({
  snapshot,
  saved,
  initialSlots,
  identityCode: initialIdentity,
  children,
}: {
  snapshot: DecklistEditSnapshot;
  saved: boolean;
  initialSlots: DecklistSlotRow[];
  identityCode: string;
  children: React.ReactNode;
}) {
  const hasMounted = useHasMounted();
  const [slots, setSlots] = useState(initialSlots);
  const [identityCode, setIdentityCode] = useState(initialIdentity);
  const [name, setName] = useState(snapshot.name);
  const [notes, setNotes] = useState(snapshot.notes);
  const [isPublic, setIsPublic] = useState(snapshot.isPublic);

  const dirty = isDecklistEditDirty(snapshot, {
    name,
    notes,
    identityCode,
    isPublic,
    slots: slotsSnapshot(slots),
  });

  const addCard = useCallback((card: AddableCard, quantity: number) => {
    if (card.code === identityCode) return;
    setSlots((current) =>
      addDecklistSlot(current, {
        cardCode: card.code,
        quantity,
        card: {
          title: card.title,
          typeCode: card.typeCode,
          factionCode: card.factionCode,
          sideCode: card.sideCode,
          packCode: card.packCode,
          raw: card.raw,
        },
      }),
    );
  }, [identityCode]);

  const removeCard = useCallback((cardCode: string) => {
    setSlots((current) => removeDecklistSlot(current, cardCode));
  }, []);

  const setQuantity = useCallback((cardCode: string, quantity: number) => {
    setSlots((current) => setDecklistSlotQuantity(current, cardCode, quantity));
  }, []);

  const ctx = useMemo(
    () => ({
      dirty,
      hasMounted,
      saved,
      slots,
      addCard,
      removeCard,
      setQuantity,
      identityCode,
      setIdentityCode,
      metadataDirty: { name, notes, isPublic },
      setName,
      setNotes,
      setIsPublic,
    }),
    [
      dirty,
      hasMounted,
      saved,
      slots,
      addCard,
      removeCard,
      setQuantity,
      identityCode,
      name,
      notes,
      isPublic,
    ],
  );

  return (
    <DecklistEditContext.Provider value={ctx}>
      {children}
    </DecklistEditContext.Provider>
  );
}

export function DecklistEditSaveButton() {
  const { pending } = useFormStatus();
  const { dirty, hasMounted, saved } = useDecklistEdit();
  const disabled = pending || (hasMounted && !dirty);
  return (
    <>
      <button
        type="submit"
        disabled={disabled}
        className={
          disabled
            ? "rounded bg-zinc-300 px-4 py-1.5 text-sm font-medium text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400"
            : "rounded bg-foreground px-4 py-1.5 text-sm font-medium text-background"
        }
      >
        {pending ? "Saving…" : "Save"}
      </button>
      {saved && !dirty && !pending && (
        <span className="text-sm text-zinc-500">Saved</span>
      )}
    </>
  );
}

export function DecklistEditCardList({
  identityFaction,
  order,
  searchParams,
  basePath,
  packs,
}: {
  identityFaction: string;
  order: string | undefined;
  searchParams: SearchParamsInput;
  basePath: string;
  packs: DecklistPackMetaJson;
}) {
  const { slots, removeCard, setQuantity, hasMounted } = useDecklistEdit();
  const { packMeta, packNames } = useMemo(
    () => mapsFromPackJson(packs),
    [packs],
  );
  return (
    <DecklistCardListBody
      cards={slots}
      identityFaction={identityFaction}
      order={order}
      searchParams={searchParams}
      basePath={basePath}
      packMeta={packMeta}
      packNames={packNames}
      edit
      onRemove={hasMounted ? removeCard : undefined}
      onQuantityChange={hasMounted ? setQuantity : undefined}
    />
  );
}

export function DecklistEditStats({
  identityFaction,
  identityRaw,
  isCorp,
}: {
  identityFaction: string;
  identityRaw: unknown;
  isCorp: boolean;
}) {
  const { slots } = useDecklistEdit();
  const totalCards = slots.reduce((sum, slot) => sum + slot.quantity, 0);
  const usedInfluence = deckInfluenceUsed(slots, identityFaction);
  const limit = influenceLimit(identityRaw);
  const agendaPoints = isCorp ? deckAgendaPoints(slots) : null;
  return (
    <>
      <p className="text-sm text-zinc-500">
        {totalCards} card{totalCards === 1 ? "" : "s"}
      </p>
      <p className="text-sm text-zinc-500">
        {formatInfluenceLabel(usedInfluence, limit)}
      </p>
      {agendaPoints != null && (
        <p className="text-sm text-zinc-500">Agenda points: {agendaPoints}</p>
      )}
    </>
  );
}

export function DecklistEditNameField({
  className,
}: {
  className: string;
}) {
  const { metadataDirty, setName } = useDecklistEdit();
  return (
    <label className="flex flex-col gap-1 text-sm">
      Name
      <input
        type="text"
        name="name"
        required
        value={metadataDirty.name}
        onChange={(event) => setName(event.target.value)}
        className={className}
      />
    </label>
  );
}

export function DecklistEditNotesField({
  className,
}: {
  className: string;
}) {
  const { metadataDirty, setNotes } = useDecklistEdit();
  return (
    <label className="flex flex-col gap-1 text-sm">
      Notes
      <textarea
        name="notes"
        rows={4}
        value={metadataDirty.notes}
        onChange={(event) => setNotes(event.target.value)}
        className={className}
      />
    </label>
  );
}

export function DecklistEditIdentityField({
  className,
  options,
}: {
  className: string;
  options: { code: string; title: string; factionLabel: string }[];
}) {
  const { identityCode, setIdentityCode } = useDecklistEdit();
  return (
    <label className="flex flex-col gap-1 text-sm">
      Identity
      <select
        name="identityCode"
        required
        value={identityCode}
        onChange={(event) => setIdentityCode(event.target.value)}
        className={className}
      >
        {options.map((card) => (
          <option key={card.code} value={card.code}>
            {card.title} ({card.factionLabel})
          </option>
        ))}
      </select>
    </label>
  );
}

export function DecklistEditPublishField() {
  const { metadataDirty, setIsPublic } = useDecklistEdit();
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        name="isPublic"
        value="1"
        checked={metadataDirty.isPublic}
        onChange={(event) => setIsPublic(event.target.checked)}
      />
      Publish (list this deck on /decklists)
    </label>
  );
}

export function DecklistAddCardButton({
  card,
  decklistId,
  className,
}: {
  card: AddableCard;
  decklistId: string;
  className: string;
}) {
  const { addCard, hasMounted, identityCode } = useDecklistEdit();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    if (!hasMounted) return;
    event.preventDefault();
    if (card.code === identityCode) return;
    const form = event.currentTarget;
    const qty = Number(new FormData(form).get("quantity") ?? 1);
    addCard(card, qty);
  }

  return (
    <form
      action={addDecklistCard}
      onSubmit={onSubmit}
      className="flex items-center gap-2"
    >
      <input type="hidden" name="decklistId" value={decklistId} />
      <input type="hidden" name="cardCode" value={card.code} />
      <input
        type="number"
        name="quantity"
        min={1}
        defaultValue={1}
        className={`${className} w-16`}
      />
      <button type="submit" className="text-sm underline">
        Add
      </button>
    </form>
  );
}
