import type { Prisma } from "@prisma/client";

import { canViewDecklist } from "@/lib/decklist-visibility";
import { plainTextFromNotes } from "@/lib/decklist-notes";
import { isIdentityTypeCode } from "@/lib/identity-cards";
import { prisma } from "@/lib/prisma";

export class DecklistPermissionError extends Error {
  constructor(message = "Not allowed") {
    super(message);
    this.name = "DecklistPermissionError";
  }
}

export class DecklistValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecklistValidationError";
  }
}

async function requireOwned(id: string, userId: string) {
  const decklist = await prisma.decklist.findUnique({ where: { id } });
  if (!decklist || decklist.ownerId !== userId) {
    throw new DecklistPermissionError();
  }
  return decklist;
}

export async function createOwnedDecklist(input: {
  userId: string;
  name: string;
  identityCode: string;
}): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new DecklistValidationError("Name is required");
  const identity = await prisma.card.findUnique({
    where: { code: input.identityCode },
    select: { code: true, typeCode: true },
  });
  if (!identity || !isIdentityTypeCode(identity.typeCode)) {
    throw new DecklistValidationError("A valid identity is required");
  }

  const now = new Date();
  const created = await prisma.decklist.create({
    data: {
      name,
      identityCode: identity.code,
      ownerId: input.userId,
      isPublic: false,
      raw: {},
      createdAt: now,
      updatedAt: now,
      cards: {
        create: { cardCode: identity.code, quantity: 1 },
      },
    },
    select: { id: true },
  });
  return created.id;
}

export async function cloneOwnedDecklist(input: {
  userId: string;
  sourceId: string;
}): Promise<string> {
  const source = await prisma.decklist.findUnique({
    where: { id: input.sourceId },
    include: { cards: true },
  });
  if (!source || !canViewDecklist(source, input.userId)) {
    throw new DecklistPermissionError();
  }

  const notes =
    source.notes?.trim() ||
    plainTextFromNotes(
      ((source.raw as { attributes?: { notes?: string } })?.attributes?.notes ??
        "") as string,
    ) ||
    null;

  const now = new Date();
  const created = await prisma.decklist.create({
    data: {
      name: `Copy of ${source.name}`,
      identityCode: source.identityCode,
      ownerId: input.userId,
      isPublic: false,
      notes,
      raw: {},
      createdAt: now,
      updatedAt: now,
      cards: {
        create: source.cards.map((c) => ({
          cardCode: c.cardCode,
          quantity: c.quantity,
        })),
      },
    },
    select: { id: true },
  });
  return created.id;
}

export async function updateOwnedDecklist(input: {
  userId: string;
  id: string;
  name: string;
  notes: string;
  identityCode: string;
  isPublic: boolean;
  slots: { cardCode: string; quantity: number }[];
}): Promise<void> {
  const existing = await requireOwned(input.id, input.userId);
  const name = input.name.trim();
  if (!name) throw new DecklistValidationError("Name is required");

  const identity = await prisma.card.findUnique({
    where: { code: input.identityCode },
    select: { code: true, typeCode: true },
  });
  if (!identity || !isIdentityTypeCode(identity.typeCode)) {
    throw new DecklistValidationError("A valid identity is required");
  }

  const slotMap = new Map<string, number>();
  for (const slot of input.slots) {
    const qty = Math.floor(slot.quantity);
    if (!Number.isFinite(qty) || qty < 1) {
      throw new DecklistValidationError("Quantity must be an integer ≥ 1");
    }
    slotMap.set(slot.cardCode, qty);
  }
  slotMap.delete(existing.identityCode);
  slotMap.set(identity.code, 1);

  const codes = [...slotMap.keys()];
  const known = await prisma.card.findMany({
    where: { code: { in: codes } },
    select: { code: true },
  });
  if (known.length !== codes.length) {
    throw new DecklistValidationError("Unknown card");
  }

  const cardRows: Prisma.DecklistCardUncheckedCreateInput[] = [...slotMap].map(
    ([cardCode, quantity]) => ({
      decklistId: input.id,
      cardCode,
      quantity,
    }),
  );

  await prisma.$transaction([
    prisma.decklist.update({
      where: { id: input.id },
      data: {
        name,
        notes: input.notes.trim() || null,
        identityCode: identity.code,
        isPublic: input.isPublic,
        updatedAt: new Date(),
      },
    }),
    prisma.decklistCard.deleteMany({ where: { decklistId: input.id } }),
    ...(cardRows.length > 0
      ? [prisma.decklistCard.createMany({ data: cardRows })]
      : []),
  ]);
}

export async function addOwnedDecklistCard(input: {
  userId: string;
  decklistId: string;
  cardCode: string;
  quantity: number;
}): Promise<void> {
  await requireOwned(input.decklistId, input.userId);
  const qty = Math.floor(input.quantity);
  if (!Number.isFinite(qty) || qty < 1) {
    throw new DecklistValidationError("Quantity must be an integer ≥ 1");
  }
  const card = await prisma.card.findUnique({
    where: { code: input.cardCode },
    select: { code: true },
  });
  if (!card) throw new DecklistValidationError("Unknown card");

  const existing = await prisma.decklistCard.findUnique({
    where: {
      decklistId_cardCode: {
        decklistId: input.decklistId,
        cardCode: input.cardCode,
      },
    },
  });
  if (existing) {
    await prisma.decklistCard.update({
      where: {
        decklistId_cardCode: {
          decklistId: input.decklistId,
          cardCode: input.cardCode,
        },
      },
      data: { quantity: existing.quantity + qty },
    });
  } else {
    await prisma.decklistCard.create({
      data: {
        decklistId: input.decklistId,
        cardCode: input.cardCode,
        quantity: qty,
      },
    });
  }
  await prisma.decklist.update({
    where: { id: input.decklistId },
    data: { updatedAt: new Date() },
  });
}

export async function removeOwnedDecklistCard(input: {
  userId: string;
  decklistId: string;
  cardCode: string;
}): Promise<void> {
  await requireOwned(input.decklistId, input.userId);
  await prisma.decklistCard.deleteMany({
    where: { decklistId: input.decklistId, cardCode: input.cardCode },
  });
  await prisma.decklist.update({
    where: { id: input.decklistId },
    data: { updatedAt: new Date() },
  });
}

export async function deleteOwnedDecklist(input: {
  userId: string;
  id: string;
}): Promise<void> {
  const existing = await prisma.decklist.findUnique({ where: { id: input.id } });
  if (!existing || existing.ownerId !== input.userId) {
    throw new DecklistPermissionError();
  }
  await prisma.decklist.delete({ where: { id: input.id } });
}
