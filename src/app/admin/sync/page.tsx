import { SyncType } from "@prisma/client";

import { requireAdmin } from "@/lib/require-admin";
import { getLatestRun } from "@/sync/sync-run";

import { SyncTriggerButton } from "./sync-trigger-button";

// Functional-only admin page (no styling polish - that's a later UI phase
// per PHASE_2_PLAN.md). Gated by requireAdmin(), same as the API route.
export const dynamic = "force-dynamic";

const SYNC_TYPES: { urlType: string; type: SyncType; label: string }[] = [
  { urlType: "factions-packs", type: SyncType.FACTIONS_PACKS, label: "Factions + Packs" },
  { urlType: "cards", type: SyncType.CARDS, label: "Cards" },
  { urlType: "decklists", type: SyncType.DECKLISTS, label: "Decklists" },
  { urlType: "rulings", type: SyncType.RULINGS, label: "Rulings" },
  { urlType: "rules", type: SyncType.RULES, label: "Rules (Comprehensive Rules glossary)" },
];

export default async function AdminSyncPage() {
  try {
    await requireAdmin();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return (
      <main>
        <h1>Admin - Sync</h1>
        <p>Access denied: {message}</p>
      </main>
    );
  }

  const latestRuns = await Promise.all(
    SYNC_TYPES.map(({ type }) => getLatestRun(type)),
  );

  return (
    <main>
      <h1>Admin - Sync</h1>
      <table border={1} cellPadding={8}>
        <thead>
          <tr>
            <th>Type</th>
            <th>Status</th>
            <th>Started</th>
            <th>Finished</th>
            <th>Records</th>
            <th>Error</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {SYNC_TYPES.map(({ urlType, label }, i) => {
            const run = latestRuns[i];
            return (
              <tr key={urlType}>
                <td>{label}</td>
                <td>{run?.status ?? "never run"}</td>
                <td>{run?.startedAt.toISOString() ?? "-"}</td>
                <td>{run?.finishedAt?.toISOString() ?? "-"}</td>
                <td>{run?.recordCount ?? "-"}</td>
                <td>{run?.errorMessage ?? "-"}</td>
                <td>
                  <SyncTriggerButton urlType={urlType} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
