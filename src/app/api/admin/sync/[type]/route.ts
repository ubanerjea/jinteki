import { NextResponse } from "next/server";
import { SyncType, type SyncRun } from "@prisma/client";

import { requireAdmin } from "@/lib/require-admin";
import { runCardsSync } from "@/sync/sync-cards";
import { runDecklistsSync } from "@/sync/sync-decklists";
import { runFactionsPacksSync } from "@/sync/sync-factions-packs";
import { runRulingsSync } from "@/sync/sync-rulings";

// URL-friendly kebab-case keys -> the matching SyncType + run function.
// `factions-packs` (not `factions`) since that one script upserts both
// Faction and Pack rows in a single SyncRun, per PHASE_2_PLAN.md.
const SYNC_HANDLERS: Record<
  string,
  { type: SyncType; run: () => Promise<SyncRun> }
> = {
  "factions-packs": {
    type: SyncType.FACTIONS_PACKS,
    run: runFactionsPacksSync,
  },
  cards: { type: SyncType.CARDS, run: runCardsSync },
  decklists: { type: SyncType.DECKLISTS, run: runDecklistsSync },
  rulings: { type: SyncType.RULINGS, run: runRulingsSync },
};

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ type: string }> },
) {
  try {
    await requireAdmin();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    const status = message.startsWith("Not authenticated") ? 401 : 403;
    return NextResponse.json({ error: message }, { status });
  }

  const { type } = await params;
  const handler = SYNC_HANDLERS[type];
  if (!handler) {
    return NextResponse.json(
      {
        error: `Unknown sync type: "${type}". Expected one of: ${Object.keys(SYNC_HANDLERS).join(", ")}.`,
      },
      { status: 400 },
    );
  }

  try {
    const run = await handler.run();
    return NextResponse.json(
      { run },
      { status: run.status === "SUCCESS" ? 200 : 500 },
    );
  } catch (error) {
    // runXSync() already recorded the SyncRun as FAILED before rethrowing -
    // this just turns that into an HTTP response instead of a 500 crash page.
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
