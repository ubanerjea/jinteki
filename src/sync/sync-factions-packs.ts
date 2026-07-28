// Syncs Faction and Pack rows from NRDB. Runs first in the dependency chain
// (factions + packs -> cards -> decklists -> rulings) since `Card` has FK
// dependencies on both `Faction` and `Pack`.
//
// NRDB's v3 API calls packs "card_sets" (e.g. "Core Set", "Kala Ghoda
// Shard") - distinct from "card_cycles", which group multiple card_sets
// together (e.g. the "Genesis" cycle contains six data packs). Our schema's
// `Pack` model matches card_sets one-to-one; cycles aren't synced/stored
// since nothing in the schema needs them.

import { fileURLToPath } from "node:url";

import { SyncType, type Prisma } from "@prisma/client";

import { fetchAll } from "@/lib/nrdb/client";
import type { CardSetResource, FactionResource } from "@/lib/nrdb/types";
import { prisma } from "@/lib/prisma";

import { withSyncRun } from "./sync-run";

export function mapFaction(
  resource: FactionResource,
): Prisma.FactionUncheckedCreateInput {
  const { id, attributes } = resource;
  // Schema only has a single free-text `description` column (no separate
  // `name`). NRDB distinguishes `name` (e.g. "Anarch") from `description`
  // (a flavor-text paragraph, empty/null for mini-factions and neutrals).
  // Fall back to `name` when description is blank so every faction still
  // gets a non-empty, human-readable value in that column.
  const description = attributes.description?.trim() || attributes.name;
  return { code: id, description };
}

export function mapPack(
  resource: CardSetResource,
): Prisma.PackUncheckedCreateInput {
  const { id, attributes } = resource;
  return { code: id, name: attributes.name };
}

export async function runFactionsPacksSync() {
  return withSyncRun(SyncType.FACTIONS_PACKS, async () => {
    const factions = await fetchAll<FactionResource>("/factions", {
      pageSize: 100,
    });
    for (const resource of factions) {
      const data = mapFaction(resource);
      await prisma.faction.upsert({
        where: { code: data.code },
        update: data,
        create: data,
      });
    }

    const packs = await fetchAll<CardSetResource>("/card_sets", {
      pageSize: 100,
    });
    for (const resource of packs) {
      const data = mapPack(resource);
      await prisma.pack.upsert({
        where: { code: data.code },
        update: data,
        create: data,
      });
    }

    return factions.length + packs.length;
  });
}

const isDirectRun =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  runFactionsPacksSync()
    .then((run) => {
      console.log(
        `[sync:factions] ${run.status} - ${run.recordCount ?? 0} records`,
      );
      process.exit(run.status === "SUCCESS" ? 0 : 1);
    })
    .catch((error) => {
      console.error("[sync:factions] fatal error", error);
      process.exit(1);
    });
}
