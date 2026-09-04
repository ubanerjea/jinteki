// Runs all seven syncs in dependency order: factions+packs -> cards ->
// decklists -> rulings -> rules -> restrictions -> card-pools. Stops
// (non-zero exit) on the first failure rather than continuing on to steps
// whose FK dependencies didn't finish syncing. "rules" and "restrictions"
// have no FK dependency on the other four (RuleSection is scraped from
// rules.nullsignal.games, and Format/Restriction are wholly new independent
// tables, per PHASE_6_PLAN.md item 9) - both are placed after those simply
// to keep NRDB-sourced resources grouped together. "card-pools" MUST run
// after "restrictions" specifically (not just grouped-together placement) -
// CardPool.formatId is a real FK into Format, and restrictions.ts is what
// upserts Format rows (PHASE_10_PLAN.md §2).

import { runCardPoolsSync } from "./sync-card-pools";
import { runCardsSync } from "./sync-cards";
import { runDecklistsSync } from "./sync-decklists";
import { runFactionsPacksSync } from "./sync-factions-packs";
import { runRestrictionsSync } from "./sync-restrictions";
import { runRulesSync } from "./sync-rules";
import { runRulingsSync } from "./sync-rulings";

const steps: [string, () => Promise<{ status: string; recordCount: number | null }>][] = [
  ["factions+packs", runFactionsPacksSync],
  ["cards", runCardsSync],
  ["decklists", runDecklistsSync],
  ["rulings", runRulingsSync],
  ["rules", runRulesSync],
  ["restrictions", runRestrictionsSync],
  ["card-pools", runCardPoolsSync],
];

async function main() {
  for (const [label, run] of steps) {
    console.log(`== sync:all - starting ${label} ==`);
    const result = await run();
    console.log(
      `== sync:all - ${label}: ${result.status} (${result.recordCount ?? 0} records) ==`,
    );
    if (result.status !== "SUCCESS") {
      console.error(`sync:all aborted - ${label} failed`);
      process.exit(1);
    }
  }
  console.log("== sync:all - all steps succeeded ==");
  process.exit(0);
}

main().catch((error) => {
  console.error("[sync:all] fatal error", error);
  process.exit(1);
});
