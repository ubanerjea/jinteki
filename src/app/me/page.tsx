import Link from "next/link";
import { redirect } from "next/navigation";

import { CardReference } from "@/components/card-reference";
import { formatCode } from "@/lib/format";
import { prisma } from "@/lib/prisma";

import { auth } from "../../../auth";

export const dynamic = "force-dynamic";

export default async function MePage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/api/auth/signin");
  }

  const userId = session.user.id;
  const [owned, decklistFavorites, cardFavorites] = await Promise.all([
    prisma.decklist.findMany({
      where: { ownerId: userId },
      include: { identity: true },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    }),
    prisma.decklistFavorite.findMany({
      where: {
        userId,
        OR: [
          { decklist: { isPublic: true } },
          { decklist: { ownerId: userId } },
        ],
      },
      include: { decklist: { include: { identity: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.cardFavorite.findMany({
      where: { userId },
      include: { card: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">My decks</h1>
        <Link href="/" className="text-sm underline">
          Home
        </Link>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            My decklists ({owned.length})
          </h2>
          <Link href="/decklists/new" className="text-sm underline">
            New decklist
          </Link>
        </div>
        <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
          {owned.map((decklist) => (
            <li
              key={decklist.id}
              className="flex flex-wrap items-center justify-between gap-2 py-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/decklists/${decklist.id}`}
                  className="font-medium underline"
                >
                  {decklist.name}
                </Link>
                <span
                  className="rounded border border-zinc-300 px-1.5 py-0.5 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
                >
                  {decklist.isPublic ? "Public" : "Private"}
                </span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <CardReference code={decklist.identity.code}>
                  <Link
                    href={`/cards/${decklist.identity.code}`}
                    className="text-zinc-500 underline"
                  >
                    {decklist.identity.title}
                  </Link>
                </CardReference>
                <Link
                  href={`/decklists/${decklist.id}/edit`}
                  className="underline"
                >
                  Edit
                </Link>
              </div>
            </li>
          ))}
          {owned.length === 0 && (
            <li className="py-4 text-sm text-zinc-500">
              No decklists yet —{" "}
              <Link href="/decklists/new" className="underline">
                New decklist
              </Link>{" "}
              to start one, or save a copy from a list you are browsing.
            </li>
          )}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">
          Favorited decklists ({decklistFavorites.length})
        </h2>
        <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
          {decklistFavorites.map(({ decklist }) => (
            <li
              key={decklist.id}
              className="flex items-center justify-between py-2"
            >
              <Link
                href={`/decklists/${decklist.id}`}
                className="font-medium underline"
              >
                {decklist.name}
              </Link>
              <CardReference code={decklist.identity.code}>
                <Link
                  href={`/cards/${decklist.identity.code}`}
                  className="text-sm text-zinc-500 underline"
                >
                  {decklist.identity.title}
                </Link>
              </CardReference>
            </li>
          ))}
          {decklistFavorites.length === 0 && (
            <li className="py-4 text-sm text-zinc-500">
              No favorited decklists yet — favorite one from its decklist
              page.
            </li>
          )}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">
          Favorited cards ({cardFavorites.length})
        </h2>
        <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
          {cardFavorites.map(({ card }) => (
            <li key={card.code} className="flex items-center justify-between py-2">
              <CardReference code={card.code}>
                <Link href={`/cards/${card.code}`} className="font-medium underline">
                  {card.title}
                </Link>
              </CardReference>
              <span className="text-sm text-zinc-500">
                {formatCode(card.factionCode)} - {formatCode(card.typeCode)}
              </span>
            </li>
          ))}
          {cardFavorites.length === 0 && (
            <li className="py-4 text-sm text-zinc-500">
              No favorited cards yet - favorite one from its card page.
            </li>
          )}
        </ul>
      </section>
    </main>
  );
}
