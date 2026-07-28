// Syncs Card rows from NRDB. Depends on factions/packs already existing
// (pnpm sync:factions must run first) since `Card.factionCode` and
// `Card.packCode` are FKs into those tables.

import { fileURLToPath } from "node:url";

import { SyncType, type Prisma } from "@prisma/client";

import { paginate } from "@/lib/nrdb/client";
import type { CardResource } from "@/lib/nrdb/types";
import { prisma } from "@/lib/prisma";

import { withSyncRun } from "./sync-run";

export function mapCard(resource: CardResource): Prisma.CardUncheckedCreateInput {
  const { id, attributes } = resource;
  const cardSetIds = attributes.card_set_ids ?? [];

  // NRDB v3's "cards" resource is de-duplicated across reprints:
  // `card_set_ids` lists every pack the card was ever printed in, newest
  // first (verified live against two multi-printing cards - "Sure Gamble"
  // and "Diesel" - both list their reprints first and end with "core_set",
  // their true original 2012 release, matching the card's own
  // `date_release`). Our schema models one pack per card (`Card.packCode`
  // is a single nullable FK, matching the old v2 API's per-printing shape),
  // so we take the *last* entry as a best-effort "originally released in"
  // pack. This is a heuristic based on observed ordering, not a documented
  // API guarantee.
  const packCode =
    cardSetIds.length > 0 ? cardSetIds[cardSetIds.length - 1] : null;

  return {
    code: id,
    title: attributes.title,
    typeCode: attributes.card_type_id,
    factionCode: attributes.faction_id,
    sideCode: attributes.side_id,
    text: attributes.text ?? null,
    // NRDB v3's `card_subtype_ids` (e.g. ["icebreaker", "killer"]) is the
    // direct equivalent of the old v2 API's pipe-separated `keywords`.
    keywords: attributes.card_subtype_ids ?? [],
    packCode,
    // Round-trip through JSON so the value is a plain JSON-safe structure
    // (no `undefined`, no exotic prototypes) before handing it to Prisma's
    // `Json` column.
    raw: JSON.parse(JSON.stringify(resource)) as Prisma.InputJsonValue,
  };
}

export async function runCardsSync() {
  return withSyncRun(SyncType.CARDS, async () => {
    let count = 0;
    for await (const page of paginate<CardResource>("/cards", {
      pageSize: 100,
    })) {
      for (const resource of page) {
        const data = mapCard(resource);
        await prisma.card.upsert({
          where: { code: data.code },
          update: data,
          create: data,
        });
        count += 1;
      }
    }
    return count;
  });
}

const isDirectRun =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  runCardsSync()
    .then((run) => {
      console.log(
        `[sync:cards] ${run.status} - ${run.recordCount ?? 0} records`,
      );
      process.exit(run.status === "SUCCESS" ? 0 : 1);
    })
    .catch((error) => {
      console.error("[sync:cards] fatal error", error);
      process.exit(1);
    });
}
