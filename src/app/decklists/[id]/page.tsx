import Link from "next/link";
import { notFound } from "next/navigation";

import { cloneDecklist, deleteDecklist } from "@/app/actions/decklists";
import { DecklistCardList } from "@/components/decklist-card-list";
import {
  DecklistIdentityHeader,
  DecklistIdentityName,
} from "@/components/decklist-identity-header";
import { DecklistFavoriteToggle } from "@/components/favorite-toggle-form";
import { plainTextFromNotes } from "@/lib/decklist-notes";
import { canViewDecklist } from "@/lib/decklist-visibility";
import {
  deckAgendaPoints,
  deckInfluenceUsed,
  formatInfluenceLabel,
  influenceLimit,
} from "@/lib/decklist-view";
import type { DecklistResource } from "@/lib/nrdb/types";
import { prisma } from "@/lib/prisma";
import type { SearchParamsInput } from "@/lib/search/types";
import { firstParam } from "@/lib/search/types";

import { auth } from "../../../../auth";

export const dynamic = "force-dynamic";

export default async function DecklistDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParamsInput>;
}) {
  const { id } = await params;
  const rawParams = await searchParams;
  const order = firstParam(rawParams, "order")?.trim();

  const decklist = await prisma.decklist.findUnique({
    where: { id },
    include: {
      identity: true,
      cards: { include: { card: true } },
      owner: { select: { id: true, name: true } },
    },
  });

  const session = await auth();
  if (!decklist || !canViewDecklist(decklist, session?.user?.id)) {
    notFound();
  }
  const favorited = session?.user
    ? Boolean(
        await prisma.decklistFavorite.findUnique({
          where: { userId_decklistId: { userId: session.user.id, decklistId: id } },
        }),
      )
    : false;

  const deckCards = decklist.cards.filter(
    (dc) => dc.cardCode !== decklist.identityCode,
  );

  const totalCards = deckCards.reduce((sum, dc) => sum + dc.quantity, 0);
  const identityFaction = decklist.identity.factionCode;
  const usedInfluence = deckInfluenceUsed(deckCards, identityFaction);
  const limit = influenceLimit(decklist.identity.raw);
  const isCorp = decklist.identity.sideCode === "corp";
  const agendaPoints = isCorp ? deckAgendaPoints(deckCards) : null;

  const attributes = (decklist.raw as { attributes?: DecklistResource["attributes"] })
    .attributes;
  const createdAt = attributes?.created_at
    ? new Date(attributes.created_at).toISOString().slice(0, 10)
    : null;
  const userId = attributes?.user_id ?? null;
  const notesHtml = attributes?.notes?.trim() || null;
  const notesText =
    decklist.notes?.trim() ||
    (notesHtml ? plainTextFromNotes(notesHtml) : null);

  const influenceLabel = formatInfluenceLabel(usedInfluence, limit);

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
        <DecklistIdentityHeader identity={decklist.identity}>
          <h1 className="text-2xl font-semibold">{decklist.name}</h1>
          <DecklistIdentityName identity={decklist.identity} />
          <p className="text-sm text-zinc-500">
            {totalCards} card{totalCards === 1 ? "" : "s"}
          </p>
          <p className="text-sm text-zinc-500">{influenceLabel}</p>
          {agendaPoints != null && (
            <p className="text-sm text-zinc-500">
              Agenda points: {agendaPoints}
            </p>
          )}
          {decklist.ownerId ? (
            <p className="text-xs text-zinc-400">
              By {decklist.owner?.name ?? "a jinteki user"}
              {session?.user?.id === decklist.ownerId && (
                <>
                  {" "}
                  — {decklist.isPublic ? "Public" : "Private"}
                </>
              )}
            </p>
          ) : (
            (createdAt || userId) && (
              <p className="text-xs text-zinc-400">
                {createdAt && <>Submitted {createdAt}</>}
                {createdAt && userId && " "}
                {userId && <>(NRDB user {userId})</>}
                {" - "}
                <a
                  href={`https://netrunnerdb.com/en/decklist/${decklist.id}`}
                  className="underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  View on NetrunnerDB
                </a>
              </p>
            )
          )}
        </DecklistIdentityHeader>
        <div className="flex flex-col items-end gap-2">
          <DecklistFavoriteToggle id={decklist.id} favorited={favorited} />
          <form action={cloneDecklist.bind(null, decklist.id)}>
            <button
              type="submit"
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Save a copy to my decks
            </button>
          </form>
          {session?.user?.id === decklist.ownerId && (
            <div className="flex items-center gap-3 text-sm">
              <Link href={`/decklists/${id}/edit`} className="underline">
                Edit
              </Link>
              <form action={deleteDecklist.bind(null, decklist.id)}>
                <button type="submit" className="underline">
                  Delete
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      {notesText && (
        <p className="whitespace-pre-line rounded border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          {notesText}
        </p>
      )}

      <DecklistCardList
        cards={deckCards}
        identityFaction={identityFaction}
        order={order}
        searchParams={rawParams}
        basePath={`/decklists/${id}`}
      />
    </main>
  );
}
