import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { updateDecklist } from "@/app/actions/decklists";
import { DecklistCardName } from "@/components/decklist-card-name";
import { DecklistSlotRemoveForms } from "@/components/decklist-card-list";
import {
  DecklistAddCardButton,
  DecklistEditCardList,
  DecklistEditIdentityField,
  DecklistEditNameField,
  DecklistEditNotesField,
  DecklistEditProvider,
  DecklistEditPublishField,
  DecklistEditSaveButton,
  DecklistEditStats,
  type DecklistPackMetaJson,
} from "@/components/decklist-edit-form";
import {
  DecklistIdentityHeader,
  DecklistIdentityName,
} from "@/components/decklist-identity-header";
import { formatCode } from "@/lib/format";
import { listIdentityCards } from "@/lib/identity-cards";
import { prisma } from "@/lib/prisma";
import { searchCards } from "@/lib/search/cards";
import { firstParam, type SearchParamsInput } from "@/lib/search/types";

import { auth } from "../../../../../auth";

export const dynamic = "force-dynamic";

const INPUT_CLASS =
  "rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900";

export default async function EditDecklistPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParamsInput>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/api/auth/signin");
  }

  const { id } = await params;
  const rawParams = await searchParams;
  const q = firstParam(rawParams, "q")?.trim() || "";
  const order = firstParam(rawParams, "order")?.trim();
  const saved = firstParam(rawParams, "saved") === "1";

  const [decklist, identities, packs] = await Promise.all([
    prisma.decklist.findUnique({
      where: { id },
      include: { identity: true, cards: { include: { card: true } } },
    }),
    listIdentityCards(),
    prisma.pack.findMany({
      select: { code: true, name: true, dateRelease: true },
    }),
  ]);

  if (!decklist || decklist.ownerId !== session.user.id) {
    notFound();
  }

  const slots = decklist.cards.filter((dc) => dc.cardCode !== decklist.identityCode);
  const hits = q ? await searchCards({ q, pageSize: 20 }) : null;
  const isCorp = decklist.identity.sideCode === "corp";

  const snapshot = {
    name: decklist.name,
    notes: decklist.notes ?? "",
    identityCode: decklist.identityCode,
    isPublic: decklist.isPublic,
    slots: slots.map((dc) => ({
      cardCode: dc.cardCode,
      quantity: dc.quantity,
    })),
  };

  const initialSlots = slots.map((dc) => ({
    cardCode: dc.cardCode,
    quantity: dc.quantity,
    card: {
      title: dc.card.title,
      typeCode: dc.card.typeCode,
      factionCode: dc.card.factionCode,
      sideCode: dc.card.sideCode,
      packCode: dc.card.packCode,
      raw: dc.card.raw,
    },
  }));

  const packJson: DecklistPackMetaJson = Object.fromEntries(
    packs.map((pack) => [
      pack.code,
      {
        name: pack.name,
        dateRelease: pack.dateRelease ? pack.dateRelease.toISOString() : null,
      },
    ]),
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Edit decklist</h1>
        <Link href={`/decklists/${id}`} className="text-sm underline">
          View
        </Link>
      </div>

      <DecklistEditProvider
        snapshot={snapshot}
        saved={saved}
        initialSlots={initialSlots}
        identityCode={decklist.identityCode}
      >
        <form
          id="decklist-edit"
          action={updateDecklist}
          className="flex flex-col gap-4"
        >
          <input type="hidden" name="id" value={id} />
          {q && <input type="hidden" name="q" value={q} />}
          {order && <input type="hidden" name="order" value={order} />}
          <DecklistEditNameField className={INPUT_CLASS} />
          <DecklistEditNotesField className={INPUT_CLASS} />

          <DecklistIdentityHeader identity={decklist.identity}>
            <DecklistIdentityName identity={decklist.identity} />
            <DecklistEditStats
              identityFaction={decklist.identity.factionCode}
              identityRaw={decklist.identity.raw}
              isCorp={isCorp}
            />
            <DecklistEditIdentityField
              className={INPUT_CLASS}
              options={identities.map((card) => ({
                code: card.code,
                title: card.title,
                factionLabel: formatCode(card.factionCode),
              }))}
            />
          </DecklistIdentityHeader>

          <DecklistEditPublishField />

          <DecklistEditCardList
            identityFaction={decklist.identity.factionCode}
            order={order}
            searchParams={rawParams}
            basePath={`/decklists/${id}/edit`}
            packs={packJson}
          />

          <div className="flex items-center gap-3">
            <DecklistEditSaveButton />
          </div>
        </form>

        <DecklistSlotRemoveForms
          decklistId={id}
          cardCodes={slots.map((dc) => dc.cardCode)}
        />

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Add a card</h2>
          <form method="get" className="flex flex-wrap items-center gap-2">
            {order && <input type="hidden" name="order" value={order} />}
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Search cards"
              className={`min-w-0 flex-1 ${INPUT_CLASS}`}
            />
            <button
              type="submit"
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
            >
              Search
            </button>
          </form>
          {hits && (
            <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
              {hits.items.map((card) => (
                <li
                  key={card.code}
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <DecklistCardName
                      code={card.code}
                      title={card.title}
                      raw={card.raw}
                    />
                    <span className="text-sm text-zinc-500">
                      ({formatCode(card.factionCode)} · {formatCode(card.typeCode)})
                    </span>
                  </span>
                  <DecklistAddCardButton
                    decklistId={id}
                    className={INPUT_CLASS}
                    card={{
                      code: card.code,
                      title: card.title,
                      typeCode: card.typeCode,
                      factionCode: card.factionCode,
                      sideCode: card.sideCode,
                      packCode: card.packCode,
                      raw: card.raw,
                    }}
                  />
                </li>
              ))}
              {hits.items.length === 0 && (
                <li className="py-2 text-sm text-zinc-500">No cards found.</li>
              )}
            </ul>
          )}
        </section>
      </DecklistEditProvider>
    </main>
  );
}
