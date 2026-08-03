import Link from "next/link";
import { notFound } from "next/navigation";

import { getFormatCardStatus } from "@/lib/search/format-cards";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// /formats/[id] detail page (format-descriptions-links-and-search-plan.md
// §4c). notFound() on a missing id, same pattern as /cards/[code]/page.tsx.
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

  // Restriction history: every ban-list/points-list snapshot this format has
  // ever had, newest first - the one matching Format.activeRestrictionId is
  // the currently active one (visually distinguished below).
  const restrictions = await prisma.restriction.findMany({
    where: { formatId: id },
    orderBy: { dateStart: "desc" },
  });

  // Stretch goal: which cards are currently banned/restricted/pointed here.
  // ram/system_gateway have no activeRestrictionId at all (no ban list) -
  // getFormatCardStatus returns all-empty groups in that case, not an error.
  const cardStatus = await getFormatCardStatus(format.activeRestrictionId);

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
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Restriction history</h2>
        {restrictions.length > 0 ? (
          <ul className="flex flex-col divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            {restrictions.map((restriction) => {
              const isActive = restriction.id === format.activeRestrictionId;
              return (
                <li
                  key={restriction.id}
                  className="flex items-center justify-between gap-2 py-2"
                >
                  <span className={isActive ? "font-semibold" : ""}>
                    {restriction.name}
                  </span>
                  <span className="flex items-center gap-2 text-xs text-zinc-500">
                    {restriction.dateStart &&
                      restriction.dateStart.toISOString().slice(0, 10)}
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
        ) : (
          <p className="text-sm text-zinc-500">
            No ban/points list has ever applied to this format.
          </p>
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
                Banned ({cardStatus.banned.length})
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
