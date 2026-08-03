import Link from "next/link";
import { notFound } from "next/navigation";

import { CardReference } from "@/components/card-reference";
import { DecklistFavoriteToggle } from "@/components/favorite-toggle-form";
import { compareByType, ORDER_COMPARATORS } from "@/lib/decklist-card-order";
import { plainTextFromNotes } from "@/lib/decklist-notes";
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
  const compare = (order && ORDER_COMPARATORS[order]) || compareByType;

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

  const sortedCards = [...deckCards].sort(compare);
  const totalCards = sortedCards.reduce((sum, dc) => sum + dc.quantity, 0);

  // Items 3/4: author, creation date, and free-text notes - same
  // cast-and-read-from-raw pattern /cards/[code] already uses for
  // `attributes` (no new abstraction needed for a handful of fields).
  const attributes = (decklist.raw as { attributes?: DecklistResource["attributes"] })
    .attributes;
  const createdAt = attributes?.created_at
    ? new Date(attributes.created_at).toISOString().slice(0, 10)
    : null;
  const userId = attributes?.user_id ?? null;
  const notesHtml = attributes?.notes?.trim() || null;
  const notesText = notesHtml ? plainTextFromNotes(notesHtml) : null;

  // Item 7: plain links (not a <select>/form), mirroring /cards' List/Grid
  // toggle precedent - a small local href-builder rather than a shared
  // abstraction, since this is the only other use site so far.
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
  const activeOrder = order && order in ORDER_COMPARATORS ? order : "type";
  const orderLinks: { value: string; label: string }[] = [
    { value: "type", label: "Type" },
    { value: "faction", label: "Faction" },
    { value: "name", label: "Name" },
  ];

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
          {/* Item 3: author + creation date, inert text (not a link into
              jinteki - user_id is an NRDB user id, no synced NRDB-user table
              to join against). The NRDB permalink is a deliberate, narrow
              exception to "don't link out" - it links to the canonical
              source record itself, not a substitute for in-house content. */}
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

      {/* Item 4: notes/description, rendered as sanitized plain text - see
          src/lib/decklist-notes.ts for why this isn't renderCardText() or
          dangerouslySetInnerHTML. */}
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
