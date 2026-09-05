import Link from "next/link";
import { notFound } from "next/navigation";

import { CardReference } from "@/components/card-reference";
import { DecklistFavoriteToggle } from "@/components/favorite-toggle-form";
import {
  compareBySet,
  compareByType,
  ORDER_COMPARATORS,
} from "@/lib/decklist-card-order";
import { plainTextFromNotes } from "@/lib/decklist-notes";
import {
  cardInfluenceUsed,
  deckAgendaPoints,
  deckInfluenceUsed,
  groupDecklistCards,
  influenceLimit,
  influencePips,
  sectionTitle,
} from "@/lib/decklist-view";
import { formatCode } from "@/lib/format";
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

  const deckCards = decklist.cards.filter(
    (dc) => dc.cardCode !== decklist.identityCode,
  );

  const packCodes = [
    ...new Set(
      deckCards
        .map((dc) => dc.card.packCode)
        .filter((code): code is string => Boolean(code)),
    ),
  ];
  const packs = await prisma.pack.findMany({
    where: { code: { in: packCodes } },
    select: { code: true, name: true, dateRelease: true },
  });
  const packMeta = new Map(
    packs.map((pack) => [
      pack.code,
      { dateRelease: pack.dateRelease, name: pack.name },
    ]),
  );
  const packNames = new Map(packs.map((pack) => [pack.code, pack.name]));

  const compare =
    order === "set"
      ? compareBySet(packMeta)
      : (order && ORDER_COMPARATORS[order]) || compareByType;

  const sortedCards = [...deckCards].sort(compare);
  const totalCards = sortedCards.reduce((sum, dc) => sum + dc.quantity, 0);
  const identityFaction = decklist.identity.factionCode;
  const usedInfluence = deckInfluenceUsed(sortedCards, identityFaction);
  const limit = influenceLimit(decklist.identity.raw);
  const isCorp = decklist.identity.sideCode === "corp";
  const agendaPoints = isCorp ? deckAgendaPoints(sortedCards) : null;

  const attributes = (decklist.raw as { attributes?: DecklistResource["attributes"] })
    .attributes;
  const createdAt = attributes?.created_at
    ? new Date(attributes.created_at).toISOString().slice(0, 10)
    : null;
  const userId = attributes?.user_id ?? null;
  const notesHtml = attributes?.notes?.trim() || null;
  const notesText = notesHtml ? plainTextFromNotes(notesHtml) : null;

  function orderHref(value: string): string {
    const params = new URLSearchParams();
    for (const [key, v] of Object.entries(rawParams)) {
      if (key === "order" || v === undefined) continue;
      if (Array.isArray(v)) {
        for (const item of v) params.append(key, item);
      } else {
        params.set(key, v);
      }
    }
    if (value) params.set("order", value);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }
  const activeOrder =
    order === "set" || (order && order in ORDER_COMPARATORS) ? order : "type";
  const orderLinks: { value: string; label: string }[] = [
    { value: "type", label: "Type" },
    { value: "faction", label: "Faction" },
    { value: "set", label: "Set" },
    { value: "name", label: "Name" },
  ];

  const influenceLabel =
    limit != null
      ? `Influence: ${influencePips(usedInfluence)}${usedInfluence > 0 ? " " : ""}${usedInfluence}/${limit}`
      : `Influence: ${influencePips(usedInfluence)}${usedInfluence > 0 ? " " : ""}${usedInfluence}`;

  function cardRow(
    dc: (typeof sortedCards)[number],
  ) {
    const packName = dc.card.packCode
      ? packNames.get(dc.card.packCode)
      : undefined;
    const pips = influencePips(
      cardInfluenceUsed(dc.card, identityFaction, dc.quantity),
    );
    return (
      <li
        key={dc.cardCode}
        className="flex items-center justify-between gap-3 py-1.5"
      >
        <CardReference code={dc.cardCode}>
          <Link href={`/cards/${dc.cardCode}`} className="underline">
            {dc.card.title}
          </Link>
        </CardReference>
        <span className="flex shrink-0 items-center gap-3 text-sm text-zinc-500">
          {packName && <span>{packName}</span>}
          <span>
            {formatCode(dc.card.factionCode)} - {formatCode(dc.card.typeCode)} -{" "}
            {formatCode(dc.card.sideCode)}
          </span>
          {pips && <span>{pips}</span>}
          <span>x{dc.quantity}</span>
        </span>
      </li>
    );
  }

  const grouped =
    activeOrder === "name"
      ? null
      : groupDecklistCards(
          sortedCards,
          (dc) =>
            activeOrder === "faction"
              ? dc.card.factionCode
              : activeOrder === "set"
                ? (dc.card.packCode ?? "")
                : dc.card.typeCode,
          (dc) =>
            activeOrder === "faction"
              ? formatCode(dc.card.factionCode)
              : activeOrder === "set"
                ? (dc.card.packCode
                    ? (packNames.get(dc.card.packCode) ?? formatCode(dc.card.packCode))
                    : "Unknown")
                : formatCode(dc.card.typeCode),
        );

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
            {totalCards} card{totalCards === 1 ? "" : "s"}
          </p>
          <p className="text-sm text-zinc-500">{influenceLabel}</p>
          {agendaPoints != null && (
            <p className="text-sm text-zinc-500">
              Agenda points: {agendaPoints}
            </p>
          )}
          {(createdAt || userId) && (
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
          )}
        </div>
        <DecklistFavoriteToggle id={decklist.id} favorited={favorited} />
      </div>

      {notesText && (
        <p className="whitespace-pre-line rounded border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          {notesText}
        </p>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">Cards</p>
        <p className="flex items-center gap-2 text-sm">
          <span className="text-zinc-500">Sort:</span>
          {orderLinks.map((link, i) => (
            <span key={link.value} className="flex items-center gap-2">
              {i > 0 && <span className="text-zinc-300 dark:text-zinc-700">|</span>}
              <Link
                href={`/decklists/${id}${orderHref(link.value)}`}
                className={
                  activeOrder === link.value
                    ? "font-semibold underline"
                    : "text-zinc-500 underline"
                }
              >
                {link.label}
              </Link>
            </span>
          ))}
        </p>
      </div>

      {grouped ? (
        <div className="flex flex-col gap-4">
          {grouped.map((group) => (
            <section key={group.key} className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">
                {sectionTitle(group.heading, group.quantitySum)}
              </h3>
              <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
                {group.cards.map(cardRow)}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
          {sortedCards.map(cardRow)}
        </ul>
      )}
    </main>
  );
}
