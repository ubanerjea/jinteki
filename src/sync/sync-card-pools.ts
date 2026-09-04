// Syncs CardPool rows from NRDB's `card_pools` resource (PHASE_10_PLAN.md
// §2) - "rotation" data, a DIFFERENT NRDB resource from `card_sets` (=
// Pack, see sync-factions-packs.ts's header comment) and from `card_cycles`.
//
// Runs after sync-restrictions.ts in sync-all.ts (not before) since
// CardPool.formatId is a real FK into Format - Format rows must already
// exist. Also fetches `rotations.json` from netrunner-cards-json (a repo
// file on GitHub, not an api.netrunnerdb.com resource - a separate fetch,
// same "plain fetch() against an external host" pattern sync-rules.ts
// already uses for rules.nullsignal.games) to label the subset of card
// pools that are genuinely one of NSG's seven numbered "Nth Rotation"
// events. See prisma/schema.prisma's CardPool model comment for why this
// can't be derived from the NRDB API alone (rotation_2020/"Salvaged
// Memories" breaks any naive sequential-name-matching approach, and no
// numeric ordinal field exists anywhere in the v3 API).
//
// Small resource (30 rows total across all formats, confirmed live
// 2026-09-04) - always a full resync, same reasoning restrictions/formats/
// factions/packs already use.

import { fileURLToPath } from "node:url";

import { SyncType, type Prisma } from "@prisma/client";

import { fetchAll } from "@/lib/nrdb/client";
import type { CardPoolResource } from "@/lib/nrdb/types";
import { prisma } from "@/lib/prisma";

import { withSyncRun } from "./sync-run";

export const ROTATIONS_JSON_URL =
  "https://raw.githubusercontent.com/Null-Signal-Games/netrunner-cards-json/main/rotations.json";

export interface RotationJsonEntry {
  code: string; // e.g. "rotation-2017" (dash-separated - NOT the card_pools id format)
  date_start: string;
  name: string; // e.g. "First Rotation"
  rotated: string[];
}

export interface RotationInfo {
  ordinal: number;
  dateStart: string;
}

/**
 * Builds a lookup from card_pools id ("rotation_2017", underscore) to its
 * rotation ordinal/date, keyed by transforming rotations.json's own `code`
 * field ("rotation-2017", dash) into the matching card_pools id shape.
 * Ordinal is the entry's 1-based position in the array - rotations.json is
 * itself already in chronological order (confirmed live: First through
 * Seventh Rotation, in that order, 7 entries) so this needs no separate date
 * sort.
 */
export function buildRotationLookup(
  entries: RotationJsonEntry[],
): Map<string, RotationInfo> {
  const lookup = new Map<string, RotationInfo>();
  entries.forEach((entry, index) => {
    const cardPoolId = entry.code.replaceAll("-", "_");
    lookup.set(cardPoolId, { ordinal: index + 1, dateStart: entry.date_start });
  });
  return lookup;
}

export async function fetchRotationLookup(): Promise<Map<string, RotationInfo>> {
  const res = await fetch(ROTATIONS_JSON_URL);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch rotations.json: ${res.status} ${res.statusText}`,
    );
  }
  const entries = (await res.json()) as RotationJsonEntry[];
  return buildRotationLookup(entries);
}

export function mapCardPool(
  resource: CardPoolResource,
  rotationLookup: Map<string, RotationInfo>,
): Prisma.CardPoolUncheckedCreateInput {
  const { id, attributes } = resource;
  const rotation = rotationLookup.get(id);
  return {
    id,
    name: attributes.name,
    formatId: attributes.format_id,
    cardCycleIds: attributes.card_cycle_ids,
    rotationOrdinal: rotation?.ordinal ?? null,
    rotationDateStart: rotation ? new Date(rotation.dateStart) : null,
    raw: JSON.parse(JSON.stringify(resource)) as Prisma.InputJsonValue,
  };
}

export async function runCardPoolsSync() {
  return withSyncRun(SyncType.CARD_POOLS, async () => {
    const rotationLookup = await fetchRotationLookup();

    const cardPools = await fetchAll<CardPoolResource>("/card_pools", {
      pageSize: 100,
    });

    // Upsert alone never removes a row NRDB has since deleted - same
    // delete-cleanup reasoning as sync-restrictions.ts.
    await prisma.cardPool.deleteMany({
      where: { id: { notIn: cardPools.map((c) => c.id) } },
    });
    for (const resource of cardPools) {
      const data = mapCardPool(resource, rotationLookup);
      await prisma.cardPool.upsert({
        where: { id: data.id },
        update: data,
        create: data,
      });
    }

    return cardPools.length;
  });
}

const isDirectRun =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  runCardPoolsSync()
    .then((run) => {
      console.log(
        `[sync:card-pools] ${run.status} - ${run.recordCount ?? 0} records`,
      );
      process.exit(run.status === "SUCCESS" ? 0 : 1);
    })
    .catch((error) => {
      console.error("[sync:card-pools] fatal error", error);
      process.exit(1);
    });
}
