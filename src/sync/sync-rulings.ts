// Syncs Ruling rows from NRDB. Depends on Card already existing (pnpm
// sync:cards must run first) for `Ruling.cardCode`'s FK.
//
// Rulings are small (886 total, verified live via `meta.stats.total.count`
// on GET /rulings) so this always does a full resync rather than bothering
// with incremental filtering - upserting ~900 rows every run is cheap.
//
// Idempotency note: NRDB's "rulings" resource has a numeric `id` (e.g.
// "62907") that our local `Ruling.id` (an autoincrement PK) can't be upserted
// against directly - the autoincrement id isn't known until after insert.
// `Ruling.nrdbId` (added this phase, see the migration) stores NRDB's id and
// is the actual upsert key.

import { fileURLToPath } from "node:url";

import { SyncType, type Prisma } from "@prisma/client";

import { paginate } from "@/lib/nrdb/client";
import type { RulingResource } from "@/lib/nrdb/types";
import { prisma } from "@/lib/prisma";

import { withSyncRun } from "./sync-run";

export function mapRuling(
  resource: RulingResource,
): Prisma.RulingUncheckedCreateInput {
  const { id, attributes } = resource;
  return {
    nrdbId: Number(id),
    cardCode: attributes.card_id,
    question: attributes.question ?? null,
    answer: attributes.answer ?? null,
    textRuling: attributes.text_ruling ?? null,
    nsgRulesTeamVerified: attributes.nsg_rules_team_verified ?? false,
  };
}

export async function runRulingsSync() {
  return withSyncRun(SyncType.RULINGS, async () => {
    let count = 0;
    for await (const page of paginate<RulingResource>("/rulings", {
      pageSize: 100,
    })) {
      for (const resource of page) {
        const data = mapRuling(resource);
        await prisma.ruling.upsert({
          where: { nrdbId: data.nrdbId },
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
  runRulingsSync()
    .then((run) => {
      console.log(
        `[sync:rulings] ${run.status} - ${run.recordCount ?? 0} records`,
      );
      process.exit(run.status === "SUCCESS" ? 0 : 1);
    })
    .catch((error) => {
      console.error("[sync:rulings] fatal error", error);
      process.exit(1);
    });
}
