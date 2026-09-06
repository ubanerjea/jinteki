import { afterAll, describe, expect, it } from "vitest";

import { isIdentityTypeCode } from "@/lib/identity-cards";
import { prisma } from "@/lib/prisma";

import {
  addOwnedDecklistCard,
  cloneOwnedDecklist,
  createOwnedDecklist,
  deleteOwnedDecklist,
  DecklistPermissionError,
  DecklistValidationError,
  updateOwnedDecklist,
} from "./owned-decklists";

afterAll(async () => {
  await prisma.$disconnect();
});

describe("owned decklists (real DB)", () => {
  it("create writes an identity DecklistCard qty 1 with a real identity typeCode", async () => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: "unmeel@gmail.com" },
      select: { id: true },
    });
    const identity = await prisma.card.findFirstOrThrow({
      where: { typeCode: { in: ["corp_identity", "runner_identity"] } },
      select: { code: true, typeCode: true },
    });
    expect(isIdentityTypeCode(identity.typeCode)).toBe(true);

    let id: string | undefined;
    try {
      id = await createOwnedDecklist({
        userId: user.id,
        name: "phase12-create-test",
        identityCode: identity.code,
      });
      const row = await prisma.decklist.findUniqueOrThrow({
        where: { id },
        include: { cards: true },
      });
      expect(row.ownerId).toBe(user.id);
      expect(row.isPublic).toBe(false);
      expect(row.identityCode).toBe(identity.code);
      expect(row.cards).toEqual([
        { decklistId: id, cardCode: identity.code, quantity: 1 },
      ]);
      expect(isIdentityTypeCode(identity.typeCode)).toBe(true);
    } finally {
      if (id) await prisma.decklist.delete({ where: { id } }).catch(() => {});
    }
  });

  it("clone copies slots, sets owner, and stays private", async () => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: "unmeel@gmail.com" },
      select: { id: true },
    });
    const source = await prisma.decklist.findFirstOrThrow({
      where: { isPublic: true },
      include: { cards: true },
      orderBy: { id: "asc" },
    });
    expect(source.cards.length).toBeGreaterThan(0);

    let copyId: string | undefined;
    try {
      copyId = await cloneOwnedDecklist({
        userId: user.id,
        sourceId: source.id,
      });
      expect(copyId).not.toBe(source.id);
      const copy = await prisma.decklist.findUniqueOrThrow({
        where: { id: copyId },
        include: { cards: true },
      });
      expect(copy.ownerId).toBe(user.id);
      expect(copy.isPublic).toBe(false);
      expect(copy.name).toBe(`Copy of ${source.name}`);
      expect(copy.identityCode).toBe(source.identityCode);
      const sourceSlots = source.cards
        .map((c) => `${c.cardCode}:${c.quantity}`)
        .sort();
      const copySlots = copy.cards
        .map((c) => `${c.cardCode}:${c.quantity}`)
        .sort();
      expect(copySlots).toEqual(sourceSlots);
    } finally {
      if (copyId) {
        await prisma.decklist.delete({ where: { id: copyId } }).catch(() => {});
      }
    }
  });

  it("update and delete refuse when ownerId is another user or null", async () => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: "unmeel@gmail.com" },
      select: { id: true },
    });
    const nrdb = await prisma.decklist.findFirstOrThrow({
      where: { ownerId: null },
      select: { id: true, identityCode: true },
    });
    await expect(
      deleteOwnedDecklist({ userId: user.id, id: nrdb.id }),
    ).rejects.toBeInstanceOf(DecklistPermissionError);
    await expect(
      updateOwnedDecklist({
        userId: user.id,
        id: nrdb.id,
        name: "nope",
        notes: "",
        identityCode: nrdb.identityCode,
        isPublic: false,
        slots: [],
      }),
    ).rejects.toBeInstanceOf(DecklistPermissionError);

    const other = await prisma.user.create({
      data: { email: "phase12-other-owner@example.invalid" },
    });
    const identity = await prisma.card.findFirstOrThrow({
      where: { typeCode: { in: ["corp_identity", "runner_identity"] } },
      select: { code: true },
    });
    let id: string | undefined;
    try {
      id = await createOwnedDecklist({
        userId: other.id,
        name: "phase12-other-owned",
        identityCode: identity.code,
      });
      await expect(
        deleteOwnedDecklist({ userId: user.id, id }),
      ).rejects.toBeInstanceOf(DecklistPermissionError);
      expect(await prisma.decklist.findUnique({ where: { id } })).not.toBeNull();
    } finally {
      if (id) await prisma.decklist.delete({ where: { id } }).catch(() => {});
      await prisma.user.delete({ where: { id: other.id } });
    }
  });

  it("add rejects an unknown cardCode", async () => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: "unmeel@gmail.com" },
      select: { id: true },
    });
    const identity = await prisma.card.findFirstOrThrow({
      where: { typeCode: { in: ["corp_identity", "runner_identity"] } },
      select: { code: true },
    });
    let id: string | undefined;
    try {
      id = await createOwnedDecklist({
        userId: user.id,
        name: "phase12-add-unknown",
        identityCode: identity.code,
      });
      await expect(
        addOwnedDecklistCard({
          userId: user.id,
          decklistId: id,
          cardCode: "not_a_real_card_code",
          quantity: 1,
        }),
      ).rejects.toBeInstanceOf(DecklistValidationError);
    } finally {
      if (id) await prisma.decklist.delete({ where: { id } }).catch(() => {});
    }
  });

  it("clone refuses a private source the user cannot view", async () => {
    const owner = await prisma.user.create({
      data: { email: "phase12-private-source@example.invalid" },
    });
    const stranger = await prisma.user.findUniqueOrThrow({
      where: { email: "unmeel@gmail.com" },
      select: { id: true },
    });
    const identity = await prisma.card.findFirstOrThrow({
      where: { typeCode: { in: ["corp_identity", "runner_identity"] } },
      select: { code: true },
    });
    let id: string | undefined;
    try {
      id = await createOwnedDecklist({
        userId: owner.id,
        name: "phase12-secret",
        identityCode: identity.code,
      });
      await expect(
        cloneOwnedDecklist({ userId: stranger.id, sourceId: id }),
      ).rejects.toBeInstanceOf(DecklistPermissionError);
    } finally {
      if (id) await prisma.decklist.delete({ where: { id } }).catch(() => {});
      await prisma.user.delete({ where: { id: owner.id } });
    }
  });
});
