// Syncs Format + Restriction rows from NRDB (Most Wanted List /
// format-restriction data, PHASE_6_PLAN.md item 9). No FK dependency on
// Card/Faction/Pack - these are entirely new, independent tables - but runs
// after those in sync-all.ts purely to keep NRDB-sourced resources grouped
// together, same reasoning sync-rules.ts already uses.
//
// Both resources are small (6 formats, 56 restrictions - verified live via
// `meta.stats.total.count`) so this always does a full resync, same as
// factions/packs, rather than bothering with incremental filtering.
//
// Delete-cleanup: upsert alone never removes a row NRDB has since deleted
// (a restriction/format id disappearing entirely, as opposed to merely
// changing its active status) - reconciled here the same way
// `prisma/seed.ts` was fixed to do in 509eedb. Restrictions are deleted
// before formats (not the other way around) so an FK violation can't occur
// if a format itself were ever removed.

import { fileURLToPath } from "node:url";

import { SyncType, type Prisma } from "@prisma/client";

import { fetchAll } from "@/lib/nrdb/client";
import type { FormatResource, RestrictionResource } from "@/lib/nrdb/types";
import { prisma } from "@/lib/prisma";

import { withSyncRun } from "./sync-run";

export function mapFormat(
  resource: FormatResource,
): Prisma.FormatUncheckedCreateInput {
  const { id, attributes } = resource;
  return {
    id,
    name: attributes.name,
    activeRestrictionId: attributes.active_restriction_id ?? null,
    raw: JSON.parse(JSON.stringify(resource)) as Prisma.InputJsonValue,
  };
}

export function mapRestriction(
  resource: RestrictionResource,
): Prisma.RestrictionUncheckedCreateInput {
  const { id, attributes } = resource;
  return {
    id,
    name: attributes.name,
    formatId: attributes.format_id,
    dateStart: attributes.date_start ? new Date(attributes.date_start) : null,
    raw: JSON.parse(JSON.stringify(resource)) as Prisma.InputJsonValue,
  };
}

export async function runRestrictionsSync() {
  return withSyncRun(SyncType.RESTRICTIONS, async () => {
    const formats = await fetchAll<FormatResource>("/formats", {
      pageSize: 100,
    });
    for (const resource of formats) {
      const data = mapFormat(resource);
      await prisma.format.upsert({
        where: { id: data.id },
        update: data,
        create: data,
      });
    }
    await prisma.format.deleteMany({
      where: { id: { notIn: formats.map((f) => f.id) } },
    });

    const restrictions = await fetchAll<RestrictionResource>("/restrictions", {
      pageSize: 100,
    });
    // Restrictions FK into Format (`formatId`) - deleted first, in case a
    // format itself is ever removed, so no row is left dangling mid-cleanup.
    await prisma.restriction.deleteMany({
      where: { id: { notIn: restrictions.map((r) => r.id) } },
    });
    for (const resource of restrictions) {
      const data = mapRestriction(resource);
      await prisma.restriction.upsert({
        where: { id: data.id },
        update: data,
        create: data,
      });
    }

    return formats.length + restrictions.length;
  });
}

const isDirectRun =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  runRestrictionsSync()
    .then((run) => {
      console.log(
        `[sync:restrictions] ${run.status} - ${run.recordCount ?? 0} records`,
      );
      process.exit(run.status === "SUCCESS" ? 0 : 1);
    })
    .catch((error) => {
      console.error("[sync:restrictions] fatal error", error);
      process.exit(1);
    });
}
