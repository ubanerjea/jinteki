// Syncs Faction, Cycle, and Pack rows from NRDB. Runs first in the
// dependency chain (factions + cycles + packs -> cards -> decklists ->
// rulings) since `Card` has FK dependencies on `Faction` and `Pack`, and
// `Pack.cardCycleId` FKs to `Cycle`.
//
// NRDB's v3 API calls packs "card_sets" (e.g. "Core Set", "Kala Ghoda
// Shard") and groups them into "card_cycles" (e.g. Borealis contains
// Midnight Sun, Parhelion, and the Midnight Sun Booster Pack). Our `Pack`
// model matches card_sets one-to-one; `Cycle` matches card_cycles.

import { fileURLToPath } from "node:url";

import { SyncType, type Prisma } from "@prisma/client";

import { fetchAll } from "@/lib/nrdb/client";
import type {
  CardSetResource,
  CycleResource,
  FactionResource,
} from "@/lib/nrdb/types";
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

export function mapCycle(
  resource: CycleResource,
): Prisma.CycleUncheckedCreateInput {
  const { id, attributes } = resource;
  return {
    id,
    name: attributes.name,
    dateRelease: attributes.date_release
      ? new Date(attributes.date_release)
      : null,
    position: attributes.position ?? null,
    raw: JSON.parse(JSON.stringify(resource)) as Prisma.InputJsonValue,
  };
}

export function mapPack(
  resource: CardSetResource,
): Prisma.PackUncheckedCreateInput {
  const { id, attributes } = resource;
  return {
    code: id,
    name: attributes.name,
    dateRelease: attributes.date_release
      ? new Date(attributes.date_release)
      : null,
    size: attributes.size ?? null,
    cardCycleId: attributes.card_cycle_id || null,
    cardSetTypeId: attributes.card_set_type_id || null,
    position: attributes.position ?? null,
    raw: JSON.parse(JSON.stringify(resource)) as Prisma.InputJsonValue,
  };
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

    const cycles = await fetchAll<CycleResource>("/card_cycles", {
      pageSize: 100,
    });
    for (const resource of cycles) {
      const data = mapCycle(resource);
      await prisma.cycle.upsert({
        where: { id: data.id },
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

    // Upsert never removes a row NRDB has since deleted. Packs are not
    // deleted here: Card.packCode still FKs to Pack, and this sync runs
    // before cards. Cycles with no remaining packs can go.
    await prisma.cycle.deleteMany({
      where: {
        id: { notIn: cycles.map((c) => c.id) },
        packs: { none: {} },
      },
    });

    return factions.length + cycles.length + packs.length;
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
