import Link from "next/link";
import { SyncType } from "@prisma/client";

import { requireAdmin } from "@/lib/require-admin";
import { getLatestRun } from "@/sync/sync-run";

import { SyncTriggerButton } from "./sync-trigger-button";

// Restyled in Phase 5 to match the rest of the app's Tailwind conventions
// (PHASE_5_PLAN.md: "the existing functionality ... doesn't need to
// change, just look consistent with everything else built since"). Gated
// by requireAdmin(), same as the API route - the gating logic itself is
// unchanged from Phase 2.
export const dynamic = "force-dynamic";

const SYNC_TYPES: { urlType: string; type: SyncType; label: string }[] = [
  { urlType: "factions-packs", type: SyncType.FACTIONS_PACKS, label: "Factions + Packs" },
  { urlType: "cards", type: SyncType.CARDS, label: "Cards" },
  { urlType: "decklists", type: SyncType.DECKLISTS, label: "Decklists" },
  { urlType: "rulings", type: SyncType.RULINGS, label: "Rulings" },
  { urlType: "rules", type: SyncType.RULES, label: "Rules (Comprehensive Rules glossary)" },
];

const STATUS_STYLES: Record<string, string> = {
  SUCCESS: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  FAILED: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  RUNNING: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
};

function StatusBadge({ status }: { status: string | undefined }) {
  const style =
    (status && STATUS_STYLES[status]) ??
    "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${style}`}>
      {status ?? "never run"}
    </span>
  );
}

export default async function AdminSyncPage() {
  try {
    await requireAdmin();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-6 py-10">
        <h1 className="text-2xl font-semibold">Admin - Sync</h1>
        <p className="text-sm text-red-600 dark:text-red-400">
          Access denied: {message}
        </p>
      </main>
    );
  }

  const latestRuns = await Promise.all(
    SYNC_TYPES.map(({ type }) => getLatestRun(type)),
  );

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Admin - Sync</h1>
        <Link href="/" className="text-sm underline">
          Home
        </Link>
      </div>

      <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Started</th>
              <th className="px-4 py-2 font-medium">Finished</th>
              <th className="px-4 py-2 font-medium">Records</th>
              <th className="px-4 py-2 font-medium">Error</th>
              <th className="px-4 py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {SYNC_TYPES.map(({ urlType, label }, i) => {
              const run = latestRuns[i];
              return (
                <tr key={urlType}>
                  <td className="px-4 py-2 font-medium">{label}</td>
                  <td className="px-4 py-2">
                    <StatusBadge status={run?.status} />
                  </td>
                  <td className="px-4 py-2 text-zinc-500">
                    {run?.startedAt.toISOString() ?? "-"}
                  </td>
                  <td className="px-4 py-2 text-zinc-500">
                    {run?.finishedAt?.toISOString() ?? "-"}
                  </td>
                  <td className="px-4 py-2 text-zinc-500">
                    {run?.recordCount ?? "-"}
                  </td>
                  <td className="max-w-xs truncate px-4 py-2 text-red-600 dark:text-red-400">
                    {run?.errorMessage ?? "-"}
                  </td>
                  <td className="px-4 py-2">
                    <SyncTriggerButton urlType={urlType} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
