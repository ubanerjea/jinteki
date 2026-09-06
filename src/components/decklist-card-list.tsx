import { removeDecklistCard } from "@/app/actions/decklists";
import { DecklistCardListBody } from "@/components/decklist-card-list-body";
import { decklistRemoveFormId } from "@/lib/decklist-card-list-href";
import type { DecklistSlotRow } from "@/lib/decklist-edit-slots";
import { prisma } from "@/lib/prisma";
import type { SearchParamsInput } from "@/lib/search/types";

export type { DecklistSlotRow };

export function DecklistSlotRemoveForms({
  decklistId,
  cardCodes,
}: {
  decklistId: string;
  cardCodes: string[];
}) {
  return (
    <>
      {cardCodes.map((cardCode) => (
        <form
          key={cardCode}
          id={decklistRemoveFormId(cardCode)}
          action={removeDecklistCard}
          className="hidden"
        >
          <input type="hidden" name="decklistId" value={decklistId} />
          <input type="hidden" name="cardCode" value={cardCode} />
        </form>
      ))}
    </>
  );
}

export async function DecklistCardList({
  cards,
  identityFaction,
  order,
  searchParams,
  basePath,
}: {
  cards: DecklistSlotRow[];
  identityFaction: string;
  order: string | undefined;
  searchParams: SearchParamsInput;
  basePath: string;
}) {
  const packCodes = [
    ...new Set(
      cards
        .map((dc) => dc.card.packCode)
        .filter((code): code is string => Boolean(code)),
    ),
  ];
  const packs =
    packCodes.length > 0
      ? await prisma.pack.findMany({
          where: { code: { in: packCodes } },
          select: { code: true, name: true, dateRelease: true },
        })
      : [];
  const packMeta = new Map(
    packs.map((pack) => [
      pack.code,
      { dateRelease: pack.dateRelease, name: pack.name },
    ]),
  );
  const packNames = new Map(packs.map((pack) => [pack.code, pack.name]));

  return (
    <DecklistCardListBody
      cards={cards}
      identityFaction={identityFaction}
      order={order}
      searchParams={searchParams}
      basePath={basePath}
      packMeta={packMeta}
      packNames={packNames}
    />
  );
}
