import Link from "next/link";
import { notFound } from "next/navigation";

import {
  classifyRestrictionHistory,
  partitionRestrictionHistory,
} from "@/lib/restrictions";
import { getFormatCardStatus } from "@/lib/search/format-cards";
import {
  formatReleaseDate,
  groupSetsByCycle,
  packSearchHref,
} from "@/lib/sets";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function RestrictionRow({
  name,
  dateStart,
  status,
}: {
  name: string;
  dateStart: Date | null;
  status: "active" | "scheduled" | "past";
}) {
  return (
    <li className="flex items-center justify-between gap-2 py-2">
      <span className={status === "active" ? "font-semibold" : ""}>{name}</span>
      <span className="flex items-center gap-2 text-xs text-zinc-500">
        {dateStart && dateStart.toISOString().slice(0, 10)}
        {status === "active" && (
          <span className="rounded bg-foreground px-1.5 py-0.5 text-background">
            active
          </span>
        )}
        {status === "scheduled" && (
          <span className="rounded border border-zinc-400 px-1.5 py-0.5 text-zinc-500 dark:border-zinc-600 dark:text-zinc-400">
            scheduled
          </span>
        )}
      </span>
    </li>
  );
}

export default async function FormatDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const format = await prisma.format.findUnique({ where: { id } });
  if (!format) {
    notFound();
  }

  const restrictions = await prisma.restriction.findMany({
    where: { formatId: id },
    orderBy: { dateStart: "desc" },
  });
  const restrictionHistory = classifyRestrictionHistory(format, restrictions);
  const { current: currentRestrictions, past: pastRestrictions } =
    partitionRestrictionHistory(restrictionHistory);

  const cardPools = await prisma.cardPool.findMany({ where: { formatId: id } });
  const activeCardPool = format.activeCardPoolId
    ? (cardPools.find((p) => p.id === format.activeCardPoolId) ?? null)
    : null;
  const numberedRotations = cardPools
    .filter((p) => p.rotationOrdinal != null)
    .sort((a, b) => (b.rotationOrdinal ?? 0) - (a.rotationOrdinal ?? 0));

  const poolCycleIds = activeCardPool?.cardCycleIds ?? [];
  const poolPacks =
    poolCycleIds.length > 0
      ? await prisma.pack.findMany({
          where: { cardCycleId: { in: poolCycleIds } },
        })
      : [];
  const poolCycles =
    poolPacks.length > 0
      ? await prisma.cycle.findMany({
          where: {
            id: {
              in: [
                ...new Set(
                  poolPacks
                    .map((p) => p.cardCycleId)
                    .filter((cid): cid is string => Boolean(cid)),
                ),
              ],
            },
          },
        })
      : [];
  const groupedPool = groupSetsByCycle(poolPacks, poolCycles);
  const showPoolDetails =
    groupedPool.length > 0 || numberedRotations.length > 0;

  const cardStatus = await getFormatCardStatus(format.activeRestrictionId);

  const legalCardsHref = format.activeRestrictionId
    ? `/cards/advanced/results?format=${id}&banned=0&pageSize=30`
    : `/cards/advanced/results?format=${id}&pageSize=30`;
  const bannedCardsHref = `/cards/advanced/results?format=${id}&banned=1&pageSize=30`;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <Link href="/formats" className="text-sm underline">
          Back to Formats
        </Link>
        <Link href="/" className="text-sm underline">
          Home
        </Link>
      </div>

      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{format.name}</h1>
        {format.description && (
          <p className="whitespace-pre-line text-sm text-zinc-600 dark:text-zinc-400">
            {format.description}
          </p>
        )}
        <p className="text-sm">
          <Link href={legalCardsHref} className="underline">
            View cards currently legal in this format
          </Link>
        </p>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Restriction history</h2>
        {restrictionHistory.length > 0 ? (
          <>
            {currentRestrictions.length > 0 && (
              <ul className="flex flex-col divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
                {currentRestrictions.map(({ restriction, status }) => (
                  <RestrictionRow
                    key={restriction.id}
                    name={restriction.name}
                    dateStart={restriction.dateStart}
                    status={status}
                  />
                ))}
              </ul>
            )}
            {pastRestrictions.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer text-zinc-600 dark:text-zinc-400">
                  {pastRestrictions.length} earlier list
                  {pastRestrictions.length === 1 ? "" : "s"}
                </summary>
                <ul className="mt-1 flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
                  {pastRestrictions.map(({ restriction, status }) => (
                    <RestrictionRow
                      key={restriction.id}
                      name={restriction.name}
                      dateStart={restriction.dateStart}
                      status={status}
                    />
                  ))}
                </ul>
              </details>
            )}
          </>
        ) : (
          <p className="text-sm text-zinc-500">
            No ban/points list has ever applied to this format.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Card pool</h2>
        {activeCardPool ? (
          <p className="text-sm">
            Active card pool:{" "}
            <span className="font-semibold">{activeCardPool.name}</span>
            {activeCardPool.rotationOrdinal != null && (
              <span className="text-zinc-500">
                {" "}
                (rotation #{activeCardPool.rotationOrdinal})
              </span>
            )}
          </p>
        ) : (
          <p className="text-sm text-zinc-500">
            No card pool data recorded for this format.
          </p>
        )}

        {showPoolDetails && (
          <details className="text-sm">
            <summary className="cursor-pointer text-zinc-600 dark:text-zinc-400">
              Sets in this pool
            </summary>
            {groupedPool.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1">
                {groupedPool.map((row) =>
                  row.kind === "cycle" ? (
                    <li key={row.id}>
                      <div className="flex items-baseline justify-between gap-2 py-1">
                        <Link
                          href={packSearchHref(row.packs.map((p) => p.code))}
                          className="font-medium underline"
                        >
                          {row.name}
                        </Link>
                        <span className="text-xs text-zinc-500">
                          {row.size} · {formatReleaseDate(row.dateRelease)}
                        </span>
                      </div>
                      <ul className="ml-4 flex flex-col">
                        {row.packs.map((pack) => (
                          <li
                            key={pack.code}
                            className="flex items-baseline justify-between gap-2 py-0.5"
                          >
                            <Link
                              href={packSearchHref([pack.code])}
                              className="underline"
                            >
                              {pack.name}
                            </Link>
                            <span className="text-xs text-zinc-500">
                              {pack.size ?? ""} ·{" "}
                              {formatReleaseDate(pack.dateRelease)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ) : (
                    <li
                      key={row.pack.code}
                      className="flex items-baseline justify-between gap-2 py-1"
                    >
                      <Link
                        href={packSearchHref([row.pack.code])}
                        className="underline"
                      >
                        {row.pack.name}
                      </Link>
                      <span className="text-xs text-zinc-500">
                        {row.pack.size ?? ""} ·{" "}
                        {formatReleaseDate(row.pack.dateRelease)}
                      </span>
                    </li>
                  ),
                )}
              </ul>
            )}

            {numberedRotations.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-zinc-600 dark:text-zinc-400">
                  Rotation history
                </summary>
                <ul className="mt-1 flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
                  {numberedRotations.map((pool) => {
                    const isActive = pool.id === format.activeCardPoolId;
                    return (
                      <li
                        key={pool.id}
                        className="flex items-center justify-between gap-2 py-2"
                      >
                        <span className={isActive ? "font-semibold" : ""}>
                          {pool.name}{" "}
                          <span className="text-zinc-500">
                            (rotation #{pool.rotationOrdinal})
                          </span>
                        </span>
                        <span className="flex items-center gap-2 text-xs text-zinc-500">
                          {pool.rotationDateStart &&
                            pool.rotationDateStart.toISOString().slice(0, 10)}
                          {isActive && (
                            <span className="rounded bg-foreground px-1.5 py-0.5 text-background">
                              active
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </details>
            )}
          </details>
        )}
      </section>

      {(cardStatus.banned.length > 0 ||
        cardStatus.restricted.length > 0 ||
        cardStatus.points.length > 0) && (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">
            Currently banned / restricted / pointed
          </h2>

          {cardStatus.banned.length > 0 && (
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold text-zinc-500">
                <Link href={bannedCardsHref} className="underline">
                  Banned ({cardStatus.banned.length})
                </Link>
              </h3>
              <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                {cardStatus.banned.map((card) => (
                  <Link key={card.code} href={`/cards/${card.code}`} className="underline">
                    {card.title}
                  </Link>
                ))}
              </p>
            </div>
          )}

          {cardStatus.restricted.length > 0 && (
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold text-zinc-500">
                Restricted ({cardStatus.restricted.length})
              </h3>
              <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                {cardStatus.restricted.map((card) => (
                  <Link key={card.code} href={`/cards/${card.code}`} className="underline">
                    {card.title}
                  </Link>
                ))}
              </p>
            </div>
          )}

          {cardStatus.points.length > 0 && (
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold text-zinc-500">
                Points ({cardStatus.points.length})
              </h3>
              <ul className="flex flex-col gap-0.5 text-sm">
                {cardStatus.points.map((card) => (
                  <li key={card.code}>
                    <Link href={`/cards/${card.code}`} className="underline">
                      {card.title}
                    </Link>{" "}
                    <span className="text-zinc-500">
                      ({card.points} pt{card.points === 1 ? "" : "s"})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
