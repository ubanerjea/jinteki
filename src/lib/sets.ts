// Cycle-grouping for /sets and /formats/[id]'s current-pool set table.
// Matches NRDB's /en/sets: multi-set cycles get a header row, single-set
// cycles are just the pack row. Header date is the latest child release,
// not Cycle.dateRelease; header size is the sum of child sizes.

export interface PackLike {
  code: string;
  name: string;
  size: number | null;
  dateRelease: Date | null;
  cardCycleId: string | null;
}

export interface CycleLike {
  id: string;
  name: string;
}

export type GroupedSetRow =
  | {
      kind: "cycle";
      id: string;
      name: string;
      size: number;
      dateRelease: Date | null;
      packs: PackLike[];
    }
  | { kind: "pack"; pack: PackLike };

export function compareDateDescNullsLast(
  a: Date | null,
  b: Date | null,
): number {
  if (a && b) return b.getTime() - a.getTime();
  if (a) return -1;
  if (b) return 1;
  return 0;
}

function latestDate(packs: PackLike[]): Date | null {
  let latest: Date | null = null;
  for (const pack of packs) {
    if (
      pack.dateRelease &&
      (!latest || pack.dateRelease.getTime() > latest.getTime())
    ) {
      latest = pack.dateRelease;
    }
  }
  return latest;
}

function sumSize(packs: PackLike[]): number {
  return packs.reduce((sum, pack) => sum + (pack.size ?? 0), 0);
}

function sortPacksNewestFirst(packs: PackLike[]): PackLike[] {
  return [...packs].sort((a, b) => {
    const byDate = compareDateDescNullsLast(a.dateRelease, b.dateRelease);
    if (byDate !== 0) return byDate;
    return a.name.localeCompare(b.name);
  });
}

export function groupSetsByCycle(
  packs: PackLike[],
  cycles: CycleLike[],
): GroupedSetRow[] {
  const cycleById = new Map(cycles.map((cycle) => [cycle.id, cycle]));
  const byCycle = new Map<string, PackLike[]>();
  const ungrouped: PackLike[] = [];

  for (const pack of packs) {
    if (pack.cardCycleId && cycleById.has(pack.cardCycleId)) {
      const list = byCycle.get(pack.cardCycleId) ?? [];
      list.push(pack);
      byCycle.set(pack.cardCycleId, list);
    } else {
      ungrouped.push(pack);
    }
  }

  type Sortable = {
    sortDate: Date | null;
    sortName: string;
    row: GroupedSetRow;
  };
  const groups: Sortable[] = [];

  for (const [cycleId, cyclePacks] of byCycle) {
    const sorted = sortPacksNewestFirst(cyclePacks);
    const cycle = cycleById.get(cycleId);
    if (!cycle) continue;
    if (sorted.length === 1) {
      groups.push({
        sortDate: sorted[0].dateRelease,
        sortName: sorted[0].name,
        row: { kind: "pack", pack: sorted[0] },
      });
    } else {
      groups.push({
        sortDate: latestDate(sorted),
        sortName: cycle.name,
        row: {
          kind: "cycle",
          id: cycle.id,
          name: cycle.name,
          size: sumSize(sorted),
          dateRelease: latestDate(sorted),
          packs: sorted,
        },
      });
    }
  }

  for (const pack of ungrouped) {
    groups.push({
      sortDate: pack.dateRelease,
      sortName: pack.name,
      row: { kind: "pack", pack },
    });
  }

  groups.sort((a, b) => {
    const byDate = compareDateDescNullsLast(a.sortDate, b.sortDate);
    if (byDate !== 0) return byDate;
    return a.sortName.localeCompare(b.sortName);
  });

  return groups.map((group) => group.row);
}

export function packSearchHref(codes: string[]): string {
  const params = new URLSearchParams();
  for (const code of codes) params.append("pack", code);
  params.set("pageSize", "30");
  return `/cards/advanced/results?${params.toString()}`;
}

export function formatReleaseDate(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}
