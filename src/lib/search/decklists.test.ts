// Integration tests against the real, already-synced Postgres database
// (~74k decklists). See cards.test.ts's header comment for why this needs a
// real DB connection rather than fixtures.
//
// The old searchDecklists()/parseDecklistSearchParams() tests are gone along
// with the code they tested (PHASE_8_PLAN.md item 7/8) - this file now
// covers the four quick-view tab queries instead.

import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import {
  parseDecklistTab,
  searchDecklistsByTab,
  type DecklistTab,
} from "./decklists";

afterAll(async () => {
  await prisma.$disconnect();
});

describe("parseDecklistTab", () => {
  it("defaults to 'recent' when no tab param is present", () => {
    expect(parseDecklistTab({})).toBe("recent");
  });

  it("accepts each of the four real tab values", () => {
    for (const tab of ["recent", "updated", "week", "favorited"]) {
      expect(parseDecklistTab({ tab })).toBe(tab);
    }
  });

  it("falls back to 'recent' for an unrecognized value", () => {
    expect(parseDecklistTab({ tab: "popular" })).toBe("recent");
    expect(parseDecklistTab({ tab: "hottopics" })).toBe("recent");
    expect(parseDecklistTab({ tab: "halloffame" })).toBe("recent");
  });
});

describe("searchDecklistsByTab (real DB)", () => {
  describe("recent", () => {
    it("lists results and matches the real total row count", async () => {
      const directCount = await prisma.decklist.count({
        where: { isPublic: true },
      });
      const result = await searchDecklistsByTab({ tab: "recent" });
      expect(result.items.length).toBeGreaterThan(0);
      expect(result.total).toBe(directCount);
    });

    it("sorts strictly newest-first by createdAt", async () => {
      const result = await searchDecklistsByTab({ tab: "recent", pageSize: 50 });
      for (let i = 1; i < result.items.length; i++) {
        const prev = result.items[i - 1].createdAt;
        const cur = result.items[i].createdAt;
        expect(prev).not.toBeNull();
        expect(cur).not.toBeNull();
        expect((prev as Date).getTime()).toBeGreaterThanOrEqual(
          (cur as Date).getTime(),
        );
      }
    });

    it("matches a direct psql-equivalent ORDER BY against the real top row", async () => {
      const direct = await prisma.decklist.findFirst({
        where: { isPublic: true },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        select: { id: true },
      });
      const result = await searchDecklistsByTab({ tab: "recent", pageSize: 1 });
      expect(result.items[0]?.id).toBe(direct?.id);
    });
  });

  describe("updated", () => {
    it("sorts strictly newest-first by updatedAt, a genuinely different order from recent", async () => {
      const result = await searchDecklistsByTab({ tab: "updated", pageSize: 50 });
      for (let i = 1; i < result.items.length; i++) {
        const prev = result.items[i - 1].updatedAt;
        const cur = result.items[i].updatedAt;
        expect((prev as Date).getTime()).toBeGreaterThanOrEqual(
          (cur as Date).getTime(),
        );
      }

      const direct = await prisma.decklist.findFirst({
        where: { isPublic: true },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        select: { id: true },
      });
      expect(result.items[0]?.id).toBe(direct?.id);
    });
  });

  describe("week", () => {
    it("only includes decklists created in the last 7 days, matching a direct count", async () => {
      const directCount = await prisma.decklist.count({
        where: {
          isPublic: true,
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      });
      const result = await searchDecklistsByTab({ tab: "week", pageSize: 1 });
      expect(result.total).toBe(directCount);
      // Every returned row (if any) really falls inside the window.
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const full = await searchDecklistsByTab({ tab: "week", pageSize: 100 });
      expect(
        full.items.every(
          (d) => d.createdAt !== null && (d.createdAt as Date).getTime() >= weekAgo,
        ),
      ).toBe(true);
    });
  });

  describe("favorited", () => {
    it("empty state: 0 DecklistFavorite rows -> 0 results, not an error", async () => {
      const favoriteRows = await prisma.decklistFavorite.count();
      expect(favoriteRows).toBe(0); // today's real, default state
      const result = await searchDecklistsByTab({ tab: "favorited" });
      expect(result.total).toBe(0);
      expect(result.items).toHaveLength(0);
    });

    it("with real DecklistFavorite rows inserted, returns exactly those decklists with correct counts", async () => {
      // Uses two real, already-synced decklist rows and the real, already-
      // shipped ADMIN user (unmeel@gmail.com) so this exercises the real FK
      // relationships, not fixture ids - matching this project's no-mocking
      // convention. Two distinct users favorite the same decklist so its
      // favoriteCount (2) genuinely differs from the other's (1), pinning
      // the GROUP BY/count/ORDER BY together rather than just "some row
      // showed up."
      const user = await prisma.user.findUniqueOrThrow({
        where: { email: "unmeel@gmail.com" },
        select: { id: true },
      });
      const decklists = await prisma.decklist.findMany({
        take: 2,
        select: { id: true },
        orderBy: { id: "asc" },
      });
      expect(decklists.length).toBe(2);
      const [popular, single] = decklists;

      // A second, throwaway user row - DecklistFavorite's PK is
      // (userId, decklistId), so a second favorite on the *same* decklist
      // needs a second distinct user.
      const secondUser = await prisma.user.create({
        data: { email: "phase8-test-second-favoriter@example.invalid" },
      });

      try {
        await prisma.decklistFavorite.createMany({
          data: [
            { userId: user.id, decklistId: popular.id },
            { userId: secondUser.id, decklistId: popular.id },
            { userId: user.id, decklistId: single.id },
          ],
        });

        const result = await searchDecklistsByTab({ tab: "favorited", pageSize: 10 });
        expect(result.total).toBe(2);
        const byId = new Map(result.items.map((d) => [d.id, d.favoriteCount]));
        expect(byId.get(popular.id)).toBe(2);
        expect(byId.get(single.id)).toBe(1);
        // Higher favoriteCount sorts first.
        expect(result.items[0]?.id).toBe(popular.id);
      } finally {
        await prisma.decklistFavorite.deleteMany({
          where: { decklistId: { in: [popular.id, single.id] } },
        });
        await prisma.user.delete({ where: { id: secondUser.id } });
        // Left as found: 0 rows again.
        expect(await prisma.decklistFavorite.count()).toBe(0);
      }
    });
  });

  describe("private owned rows are hidden from public tabs", () => {
    it("a private owned row is absent until published", async () => {
      const user = await prisma.user.findUniqueOrThrow({
        where: { email: "unmeel@gmail.com" },
        select: { id: true },
      });
      const identity = await prisma.card.findFirstOrThrow({
        where: { typeCode: { in: ["corp_identity", "runner_identity"] } },
        select: { code: true },
      });
      const before = await searchDecklistsByTab({ tab: "recent", pageSize: 1 });
      const row = await prisma.decklist.create({
        data: {
          name: "phase12-tab-private",
          identityCode: identity.code,
          ownerId: user.id,
          isPublic: false,
          raw: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      try {
        const afterInsert = await searchDecklistsByTab({
          tab: "recent",
          pageSize: 1,
        });
        expect(afterInsert.total).toBe(before.total);
        const page = await searchDecklistsByTab({
          tab: "recent",
          pageSize: 50,
        });
        expect(page.items.some((d) => d.id === row.id)).toBe(false);

        await prisma.decklist.update({
          where: { id: row.id },
          data: { isPublic: true },
        });
        const published = await searchDecklistsByTab({
          tab: "recent",
          pageSize: 5,
        });
        expect(published.total).toBe(before.total + 1);
        expect(published.items.some((d) => d.id === row.id)).toBe(true);
      } finally {
        await prisma.decklist.delete({ where: { id: row.id } });
      }
    });
  });

  it("paginates correctly across tabs: page 2 continues where page 1 left off, no overlap", async () => {
    for (const tab of ["recent", "updated"] as DecklistTab[]) {
      const pageSize = 25;
      const page1 = await searchDecklistsByTab({ tab, page: 1, pageSize });
      const page2 = await searchDecklistsByTab({ tab, page: 2, pageSize });
      expect(page1.items).toHaveLength(pageSize);
      expect(page2.items).toHaveLength(pageSize);
      const page1Ids = new Set(page1.items.map((d) => d.id));
      const overlap = page2.items.filter((d) => page1Ids.has(d.id));
      expect(overlap).toHaveLength(0);
    }
  });
});
