import Link from "next/link";
import { redirect } from "next/navigation";

import { CardReference } from "@/components/card-reference";
import { formatCode } from "@/lib/format";
import { prisma } from "@/lib/prisma";

import { auth } from "../../../auth";

export const dynamic = "force-dynamic";

// Signed-in-only page (PHASE_5_PLAN.md: "redirect to sign-in if not
// authenticated") listing the current user's favorited cards and
// decklists. Card rows go through CardReference (same shared component
// used everywhere else a card is mentioned) so right-click still works
// here too.
export default async function FavoritesPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/api/auth/signin");
  }

  const [cardFavorites, decklistFavorites] = await Promise.all([
    prisma.cardFavorite.findMany({
      where: { userId: session.user.id },
      include: { card: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.decklistFavorite.findMany({
      where: { userId: session.user.id },
      include: { decklist: { include: { identity: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Favorites</h1>
        <Link href="/" className="text-sm underline">
          Home
        </Link>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">
          Cards ({cardFavorites.length})
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

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">
          Decklists ({decklistFavorites.length})
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
              No favorited decklists yet - favorite one from its decklist
              page.
            </li>
          )}
        </ul>
      </section>
    </main>
  );
}
