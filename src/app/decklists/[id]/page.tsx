import Link from "next/link";
import { notFound } from "next/navigation";

import { CardReference } from "@/components/card-reference";
import { DecklistFavoriteToggle } from "@/components/favorite-toggle-form";
import { formatCode } from "@/lib/format";
import { prisma } from "@/lib/prisma";

import { auth } from "../../../../auth";

export const dynamic = "force-dynamic";

export default async function DecklistDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const decklist = await prisma.decklist.findUnique({
    where: { id },
    include: {
      identity: true,
      cards: { include: { card: true } },
    },
  });

  if (!decklist) {
    notFound();
  }

  const session = await auth();
  const favorited = session?.user
    ? Boolean(
        await prisma.decklistFavorite.findUnique({
          where: { userId_decklistId: { userId: session.user.id, decklistId: id } },
        }),
      )
    : false;

  // NRDB's own `card_slots` data includes the identity as a slot (confirmed
  // directly against raw decklist JSON: `num_cards` matches the slot-quantity
  // sum only when the identity's row is excluded) - a faithful sync, but the
  // identity is already shown above, so exclude it here to avoid showing it
  // twice in the deck's card list.
  const deckCards = decklist.cards.filter(
    (dc) => dc.cardCode !== decklist.identityCode,
  );

  const sortedCards = [...deckCards].sort((a, b) => {
    if (a.card.typeCode !== b.card.typeCode) {
      return a.card.typeCode.localeCompare(b.card.typeCode);
    }
    return a.card.title.localeCompare(b.card.title);
  });
  const totalCards = sortedCards.reduce((sum, dc) => sum + dc.quantity, 0);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <Link href="/decklists" className="text-sm underline">
          Back to Decklists
        </Link>
        <Link href="/" className="text-sm underline">
          Home
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{decklist.name}</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Identity:{" "}
            <CardReference code={decklist.identity.code}>
              <Link
                href={`/cards/${decklist.identity.code}`}
                className="underline"
              >
                {decklist.identity.title}
              </Link>
            </CardReference>{" "}
            ({formatCode(decklist.identity.factionCode)})
          </p>
          <p className="text-sm text-zinc-500">
            {totalCards} card{totalCards === 1 ? "" : "s"} total
          </p>
        </div>
        <DecklistFavoriteToggle id={decklist.id} favorited={favorited} />
      </div>

      <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
        {sortedCards.map((dc) => (
          <li
            key={dc.cardCode}
            className="flex items-center justify-between py-1.5"
          >
            <CardReference code={dc.cardCode}>
              <Link href={`/cards/${dc.cardCode}`} className="underline">
                {dc.card.title}
              </Link>
            </CardReference>
            <span className="text-sm text-zinc-500">x{dc.quantity}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
