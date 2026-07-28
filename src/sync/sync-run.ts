// SyncRun bookkeeping shared by every sync module and by the admin
// trigger surface (API route + page), so a run started from the CLI and one
// started from the browser look identical in the log table.

import { SyncStatus, type SyncRun, type SyncType } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export async function startSyncRun(type: SyncType): Promise<SyncRun> {
  return prisma.syncRun.create({
    data: { type, status: SyncStatus.RUNNING },
  });
}

export async function finishSyncRunSuccess(
  id: string,
  recordCount: number,
): Promise<SyncRun> {
  return prisma.syncRun.update({
    where: { id },
    data: {
      status: SyncStatus.SUCCESS,
      finishedAt: new Date(),
      recordCount,
    },
  });
}

export async function finishSyncRunFailure(
  id: string,
  error: unknown,
): Promise<SyncRun> {
  const message = error instanceof Error ? error.message : String(error);
  return prisma.syncRun.update({
    where: { id },
    data: {
      status: SyncStatus.FAILED,
      finishedAt: new Date(),
      // Keep this bounded - some upstream errors embed full HTML error pages.
      errorMessage: message.slice(0, 4000),
    },
  });
}

/**
 * Runs `fn`, wrapping it in a SyncRun row: creates a RUNNING row up front,
 * marks it SUCCESS with the returned record count on success, marks it
 * FAILED with the error message on failure (and rethrows, so `pnpm sync:all`
 * / CI can tell the run failed).
 */
export async function withSyncRun(
  type: SyncType,
  fn: () => Promise<number>,
): Promise<SyncRun> {
  const run = await startSyncRun(type);
  try {
    const recordCount = await fn();
    return await finishSyncRunSuccess(run.id, recordCount);
  } catch (error) {
    await finishSyncRunFailure(run.id, error);
    throw error;
  }
}

export async function getLatestSuccessfulRun(
  type: SyncType,
): Promise<SyncRun | null> {
  return prisma.syncRun.findFirst({
    where: { type, status: SyncStatus.SUCCESS },
    orderBy: { startedAt: "desc" },
  });
}

export async function getLatestRun(type: SyncType): Promise<SyncRun | null> {
  return prisma.syncRun.findFirst({
    where: { type },
    orderBy: { startedAt: "desc" },
  });
}
