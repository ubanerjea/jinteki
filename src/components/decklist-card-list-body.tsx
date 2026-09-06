"use client";

import Link from "next/link";

import { DecklistCardName } from "@/components/decklist-card-name";
import {
  compareBySet,
  compareByType,
  ORDER_COMPARATORS,
  type PackSortMeta,
} from "@/lib/decklist-card-order";
import type { DecklistSlotRow } from "@/lib/decklist-edit-slots";
import {
  cardInfluenceUsed,
  groupDecklistCards,
  influencePips,
  sectionTitle,
} from "@/lib/decklist-view";
import {
  decklistOrderHref,
  decklistRemoveFormId,
} from "@/lib/decklist-card-list-href";
import { formatCode } from "@/lib/format";
import type { SearchParamsInput } from "@/lib/search/types";

const ORDER_LINKS: { value: string; label: string }[] = [
  { value: "type", label: "Type" },
  { value: "faction", label: "Faction" },
  { value: "set", label: "Set" },
  { value: "name", label: "Name" },
];

export function DecklistCardListBody({
  cards,
  identityFaction,
  order,
  searchParams,
  basePath,
  packMeta,
  packNames,
  edit = false,
  onRemove,
  onQuantityChange,
}: {
  cards: DecklistSlotRow[];
  identityFaction: string;
  order: string | undefined;
  searchParams: SearchParamsInput;
  basePath: string;
  packMeta: Map<string, PackSortMeta>;
  packNames: Map<string, string>;
  edit?: boolean;
  onRemove?: (cardCode: string) => void;
  onQuantityChange?: (cardCode: string, quantity: number) => void;
}) {
  const compare =
    order === "set"
      ? compareBySet(packMeta)
      : (order && ORDER_COMPARATORS[order]) || compareByType;

  const sortedCards = [...cards].sort(compare);
  const activeOrder =
    order === "set" || (order && order in ORDER_COMPARATORS) ? order : "type";

  function cardRow(dc: DecklistSlotRow) {
    const packName = dc.card.packCode
      ? packNames.get(dc.card.packCode)
      : undefined;
    const pips = influencePips(
      cardInfluenceUsed(dc.card, identityFaction, dc.quantity),
    );
    return (
      <li
        key={dc.cardCode}
        className="flex flex-wrap items-center justify-between gap-3 py-1.5"
      >
        <span className="flex min-w-0 items-center gap-2">
          {edit ? (
            <>
              <input type="hidden" name="cardCode" value={dc.cardCode} />
              {onQuantityChange ? (
                <input
                  type="number"
                  name="quantity"
                  min={1}
                  value={dc.quantity}
                  onChange={(event) =>
                    onQuantityChange(dc.cardCode, Number(event.target.value))
                  }
                  aria-label={`Quantity of ${dc.card.title}`}
                  className="w-14 rounded border border-zinc-300 px-1 py-0.5 dark:border-zinc-700 dark:bg-zinc-900"
                />
              ) : (
                <input
                  type="number"
                  name="quantity"
                  min={1}
                  defaultValue={dc.quantity}
                  aria-label={`Quantity of ${dc.card.title}`}
                  className="w-14 rounded border border-zinc-300 px-1 py-0.5 dark:border-zinc-700 dark:bg-zinc-900"
                />
              )}
            </>
          ) : (
            <span>{dc.quantity}</span>
          )}
          <DecklistCardName
            code={dc.cardCode}
            title={dc.card.title}
            raw={dc.card.raw}
          />
        </span>
        <span className="flex shrink-0 items-center gap-3 text-sm text-zinc-500">
          {packName && <span>{packName}</span>}
          <span>
            {formatCode(dc.card.factionCode)} - {formatCode(dc.card.typeCode)} -{" "}
            {formatCode(dc.card.sideCode)}
          </span>
          {pips && <span>{pips}</span>}
          {edit && (
            <button
              type={onRemove ? "button" : "submit"}
              form={onRemove ? undefined : decklistRemoveFormId(dc.cardCode)}
              onClick={onRemove ? () => onRemove(dc.cardCode) : undefined}
              className="underline"
            >
              Remove
            </button>
          )}
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
                ? dc.card.packCode
                  ? (packNames.get(dc.card.packCode) ??
                    formatCode(dc.card.packCode))
                  : "Unknown"
                : formatCode(dc.card.typeCode),
        );

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">Cards</p>
        <p className="flex items-center gap-2 text-sm">
          <span className="text-zinc-500">Sort:</span>
          {ORDER_LINKS.map((link, i) => (
            <span key={link.value} className="flex items-center gap-2">
              {i > 0 && (
                <span className="text-zinc-300 dark:text-zinc-700">|</span>
              )}
              <Link
                href={decklistOrderHref(basePath, searchParams, link.value)}
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
    </>
  );
}
