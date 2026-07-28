// Syncs Decklist + DecklistCard rows from NRDB. Depends on Card already
// existing (pnpm sync:cards must run first) for `Decklist.identityCode` and
// `DecklistCard.cardCode` FKs.
//
// Incremental vs. full resync: NRDB has ~74k decklists (verified live via
// `meta.stats.total.count` on GET /decklists), by far the largest resource
// synced in this phase, and its `filter[updated_at][gte]=<ISO date>` param
// was confirmed to genuinely filter server-side (a far-future cutoff
// reliably returns a total count of 0, ruling out "the param is silently
// ignored and every row comes back anyway"). So: incremental. The first-ever
// run has no prior successful SyncRun to use as a cutoff and does a full
// paginated sync (accepted as slow per PHASE_2_PLAN.md); every run after
// that only re-fetches decklists updated since the last successful run's
// start time.
//
// IMPORTANT - stable sort required: /decklists has no deterministic default
// order. Discovered live during this phase's own verification run: a first
// full sync (no `sort` param, ~14 minutes wall clock at page[size]=200) came
// back with `recordCount: 74233` (matching NRDB's reported total) but only
// 47,814 distinct rows actually landed in the `Decklist` table - offset-based
// pagination against NRDB's unsorted, apparently-not-physically-stable
// ordering meant some decklists were fetched on multiple pages (in the worst
// case, processed *concurrently* by two different page batches, corrupting
// their DecklistCard rows via racing delete+recreate transactions on the same
// id) while others were never fetched at all. Fix: always sort by
// `created_at,id` - immutable per row, so paging forward in ascending order
// is safe against concurrent inserts/updates on NRDB's side (new decklists
// only ever land past whatever page we're currently on; already-visited
// decklists can't reappear later since their sort key can't change).

import { fileURLToPath } from "node:url";

import { SyncType, type Prisma } from "@prisma/client";

import { paginate } from "@/lib/nrdb/client";
import type { DecklistResource } from "@/lib/nrdb/types";
import { prisma } from "@/lib/prisma";

import { getLatestSuccessfulRun, withSyncRun } from "./sync-run";

export function mapDecklist(
  resource: DecklistResource,
): Prisma.DecklistUncheckedCreateInput {
  const { id, attributes } = resource;
  return {
    id,
    name: attributes.name,
    identityCode: attributes.identity_card_id,
    raw: JSON.parse(JSON.stringify(resource)) as Prisma.InputJsonValue,
  };
}

export function mapDecklistCards(
  resource: DecklistResource,
): Prisma.DecklistCardUncheckedCreateInput[] {
  const { id, attributes } = resource;
  const slots = attributes.card_slots ?? {};
  return Object.entries(slots).map(([cardCode, quantity]) => ({
    decklistId: id,
    cardCode,
    quantity: typeof quantity === "number" ? quantity : Number(quantity),
  }));
}

async function syncOneDecklist(resource: DecklistResource): Promise<void> {
  const decklistData = mapDecklist(resource);
  const cardRows = mapDecklistCards(resource);

  // Replace-all-slots-per-decklist inside one transaction: a decklist can be
  // edited on NRDB (cards added/removed/requantified) between syncs, so
  // upserting the Decklist row alone isn't enough - stale DecklistCard rows
  // from a previous sync need to go too.
  await prisma.$transaction([
    prisma.decklist.upsert({
      where: { id: decklistData.id },
      update: decklistData,
      create: decklistData,
    }),
    prisma.decklistCard.deleteMany({
      where: { decklistId: decklistData.id },
    }),
    ...(cardRows.length > 0
      ? [
          prisma.decklistCard.createMany({
            data: cardRows,
            skipDuplicates: true,
          }),
        ]
      : []),
  ]);
}

// NRDB has ~74k decklists total. Processing them one at a time, each with
// its own round-trip transaction, would take hours. NRDB itself is still
// only ever fetched one page at a time, sequentially (see `paginate`) - this
// concurrency is purely local: once a page of (up to 200) decklists has
// already been fetched, their DB writes run in parallel batches against our
// own Postgres instance, which has no rate limit to be polite about.
const LOCAL_WRITE_CONCURRENCY = 20;

// A single bad decklist (e.g. referencing a card code NRDB itself has since
// dropped/renamed, causing a DecklistCard FK violation) shouldn't take down
// the sync for the other ~74k. Skipped decklists are logged and excluded
// from the returned record count rather than aborting the whole run.
//
// Returns the ids that were successfully synced (not just a count) so the
// caller can dedupe across pages - belt-and-braces on top of the stable
// sort, in case NRDB's pagination is ever imperfect again.
async function syncPageConcurrently(
  page: DecklistResource[],
): Promise<string[]> {
  const syncedIds: string[] = [];
  for (let i = 0; i < page.length; i += LOCAL_WRITE_CONCURRENCY) {
    const batch = page.slice(i, i + LOCAL_WRITE_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((resource) => syncOneDecklist(resource)),
    );
    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      if (result.status === "fulfilled") {
        syncedIds.push(batch[j].id);
      } else {
        console.warn(
          `[sync:decklists] skipped decklist ${batch[j].id}:`,
          result.reason instanceof Error
            ? result.reason.message
            : result.reason,
        );
      }
    }
  }
  return syncedIds;
}

export async function runDecklistsSync() {
  return withSyncRun(SyncType.DECKLISTS, async () => {
    const lastSuccess = await getLatestSuccessfulRun(SyncType.DECKLISTS);
    const extraParams: [string, string][] = [["sort", "created_at,id"]];
    if (lastSuccess) {
      extraParams.push([
        "filter[updated_at][gte]",
        lastSuccess.startedAt.toISOString(),
      ]);
    }

    const syncedIds = new Set<string>();
    for await (const page of paginate<DecklistResource>("/decklists", {
      pageSize: 200,
      extraParams,
    })) {
      const ids = await syncPageConcurrently(page);
      for (const id of ids) syncedIds.add(id);
    }
    return syncedIds.size;
  });
}

const isDirectRun =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  runDecklistsSync()
    .then((run) => {
      console.log(
        `[sync:decklists] ${run.status} - ${run.recordCount ?? 0} records`,
      );
      process.exit(run.status === "SUCCESS" ? 0 : 1);
    })
    .catch((error) => {
      console.error("[sync:decklists] fatal error", error);
      process.exit(1);
    });
}
