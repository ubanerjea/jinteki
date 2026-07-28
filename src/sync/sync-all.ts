// Runs all four syncs in dependency order: factions+packs -> cards ->
// decklists -> rulings. Stops (non-zero exit) on the first failure rather
// than continuing on to steps whose FK dependencies didn't finish syncing.

import { runCardsSync } from "./sync-cards";
import { runDecklistsSync } from "./sync-decklists";
import { runFactionsPacksSync } from "./sync-factions-packs";
import { runRulingsSync } from "./sync-rulings";

const steps: [string, () => Promise<{ status: string; recordCount: number | null }>][] = [
  ["factions+packs", runFactionsPacksSync],
  ["cards", runCardsSync],
  ["decklists", runDecklistsSync],
  ["rulings", runRulingsSync],
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
