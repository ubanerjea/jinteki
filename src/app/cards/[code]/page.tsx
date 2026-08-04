import Link from "next/link";
import { notFound } from "next/navigation";

import { CardReference } from "@/components/card-reference";
import { FacetLink } from "@/components/facet-link";
import { FormatLink } from "@/components/format-link";
import { CardFavoriteToggle } from "@/components/favorite-toggle-form";
import { getCardImageUrl } from "@/lib/card-image";
import { renderCardText } from "@/lib/card-text";
import type { CardRestrictionsAttribute } from "@/lib/nrdb/types";
import { prisma } from "@/lib/prisma";
import { computeCardLegality, summarizeLegality } from "@/lib/restrictions";

import { auth } from "../../../../auth";

export const dynamic = "force-dynamic";

// Fields relevant to some subset of card types (cost, strength, MU, etc,
// per PHASE_4_PLAN.md: "whichever cost/strength/influence/etc. fields are
// relevant to that card's type"). Rather than branching per typeCode, every
// key here is looked up in `raw.attributes` and only rendered if present -
// achieves the same "only show what's relevant" outcome without hardcoding
// per-type field lists that would need updating whenever NRDB adds a type.
const ATTRIBUTE_FIELDS: { key: string; label: string }[] = [
  { key: "cost", label: "Cost" },
  { key: "strength", label: "Strength" },
  { key: "advancement_requirement", label: "Advancement Requirement" },
  { key: "agenda_points", label: "Agenda Points" },
  { key: "trash_cost", label: "Trash Cost" },
  { key: "influence_cost", label: "Influence" },
  { key: "memory_cost", label: "Memory (MU)" },
  { key: "base_link", label: "Base Link" },
  { key: "minimum_deck_size", label: "Minimum Deck Size" },
  { key: "influence_limit", label: "Influence Limit" },
];

export default async function CardDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  const card = await prisma.card.findUnique({
    where: { code },
    include: { faction: true, pack: true },
  });

  if (!card) {
    notFound();
  }

  const session = await auth();
  const favorited = session?.user
    ? Boolean(
        await prisma.cardFavorite.findUnique({
          where: { userId_cardCode: { userId: session.user.id, cardCode: code } },
        }),
      )
    : false;

  const attributes = (card.raw as { attributes?: Record<string, unknown> })
    .attributes ?? {};
  const narrativeText =
    typeof attributes.narrative_text === "string"
      ? attributes.narrative_text
      : null;

  const imageUrl = getCardImageUrl(card.raw, "large");

  const presentAttributes = ATTRIBUTE_FIELDS.filter(({ key }) => {
    const value = attributes[key];
    return value !== null && value !== undefined && value !== "";
  });

  // Item 2 (PHASE_6_PLAN.md): "Also printed in" - every pack this card was
  // ever printed in, per NRDB's `card_set_ids` (already available on the
  // `attributes` extracted above - no new query for the raw data itself).
  // Confirmed live against real synced rows (agent-reports/phase-6.md) that
  // every `card_set_ids` entry is literally the same string as `Pack.code`
  // (2460/2460 matched in a full cross-check) before building this.
  const cardSetIds = Array.isArray(attributes.card_set_ids)
    ? (attributes.card_set_ids as unknown[]).filter(
        (v): v is string => typeof v === "string",
      )
    : [];
  const printedInPacks =
    cardSetIds.length > 1
      ? await prisma.pack.findMany({
          where: { code: { in: cardSetIds } },
          orderBy: { name: "asc" },
        })
      : [];

  // Item 9: current legality/restriction status per format. Formats table
  // is tiny (6 rows) - always fetched in full, no filtering needed.
  const formats = await prisma.format.findMany();
  const legality = computeCardLegality(
    Array.isArray(attributes.format_ids)
      ? (attributes.format_ids as unknown[]).filter(
          (v): v is string => typeof v === "string",
        )
      : undefined,
    attributes.restrictions as CardRestrictionsAttribute | undefined,
    formats,
  );
  const legalityLines = summarizeLegality(legality);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <Link href="/cards" className="text-sm underline">
          Back to Cards
        </Link>
        <Link href="/" className="text-sm underline">
          Home
        </Link>
      </div>

      <div className="flex flex-col gap-6 sm:flex-row">
        {imageUrl && (
          // Hotlinked directly from NRDB's own CDN per PROJECT_PLAN.md ("no
          // local caching of images") - a plain <img>, not next/image,
          // deliberately: next/image's optimization pipeline would fetch
          // and re-encode through this app's own server, which is a form of
          // caching/processing the architecture decision explicitly opted
          // out of.
          <CardReference code={card.code} className="block h-fit w-[300px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={card.title}
              width={300}
              height={419}
              className="h-fit w-[300px] rounded"
            />
          </CardReference>
        )}

        <div className="flex flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardReference code={card.code}>
              <h1 className="text-2xl font-semibold">{card.title}</h1>
            </CardReference>
            <CardFavoriteToggle code={card.code} favorited={favorited} />
          </div>
          <p className="flex flex-wrap items-center gap-1 text-sm text-zinc-600 dark:text-zinc-400">
            <FacetLink kind="faction" value={card.factionCode} />
            <span>-</span>
            <FacetLink kind="type" value={card.typeCode} />
            <span>-</span>
            <FacetLink kind="side" value={card.sideCode} />
          </p>

          {card.keywords.length > 0 && (
            <p className="flex flex-wrap items-center gap-1 text-sm text-zinc-600 dark:text-zinc-400">
              Subtypes:{" "}
              {card.keywords.map((keyword) => (
                <FacetLink key={keyword} kind="keyword" value={keyword} />
              ))}
            </p>
          )}

          {presentAttributes.length > 0 && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
              {presentAttributes.map(({ key, label }) => (
                <div key={key}>
                  <dt className="text-zinc-500">{label}</dt>
                  <dd>{String(attributes[key])}</dd>
                </div>
              ))}
            </dl>
          )}

          {card.text && (
            <p className="whitespace-pre-line text-sm">
              {renderCardText(card.text)}
            </p>
          )}

          {narrativeText && (
            <p className="whitespace-pre-line text-sm italic text-zinc-500">
              {narrativeText}
            </p>
          )}

          {card.pack && (
            <p className="text-sm text-zinc-500">Pack: {card.pack.name}</p>
          )}

          {printedInPacks.length > 0 && (
            <p className="flex flex-wrap items-center gap-1 text-sm text-zinc-500">
              Also printed in:{" "}
              {printedInPacks.map((pack, i) => (
                <span key={pack.code}>
                  {i > 0 && ", "}
                  {/* /cards/advanced, not /cards, since Phase 7 - the pack
                      filter is visible and editable there. */}
                  <Link
                    href={`/cards/advanced?pack=${pack.code}`}
                    className="underline"
                  >
                    {pack.name}
                  </Link>
                </span>
              ))}
            </p>
          )}

          {legalityLines.length > 0 && (
            <div className="flex flex-col gap-0.5 text-sm text-zinc-500">
              {legalityLines.map((line) => (
                <p key={line.label} className="flex flex-wrap items-center gap-1">
                  <span>{line.label}:</span>
                  {line.entries.map((entry, i) => (
                    <span key={entry.formatId}>
                      {i > 0 && ", "}
                      <FormatLink formatId={entry.formatId} formatName={entry.formatName} />
                    </span>
                  ))}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
