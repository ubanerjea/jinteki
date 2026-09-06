import { DecklistCardName } from "@/components/decklist-card-name";
import { getCardImageUrl } from "@/lib/card-image";
import { formatCode } from "@/lib/format";

export type DecklistIdentity = {
  code: string;
  title: string;
  factionCode: string;
  raw: unknown;
};

export function DecklistIdentityName({
  identity,
}: {
  identity: DecklistIdentity;
}) {
  return (
    <p>
      <DecklistCardName
        code={identity.code}
        title={identity.title}
        raw={identity.raw}
        className="text-lg underline"
      />
      <span className="text-sm text-zinc-600 dark:text-zinc-400">
        {" "}
        ({formatCode(identity.factionCode)})
      </span>
    </p>
  );
}

export function DecklistIdentityHeader({
  identity,
  children,
}: {
  identity: DecklistIdentity;
  children: React.ReactNode;
}) {
  const thumbUrl = getCardImageUrl(identity.raw, "medium");
  return (
    <div className="flex items-start gap-4">
      {thumbUrl && (
        // Hotlinked, same no-next/image convention as
        // /cards/[code] - see that page for the full reasoning.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbUrl}
          alt={identity.title}
          width={120}
          height={168}
          className="h-auto w-[120px] rounded border border-zinc-200 dark:border-zinc-800"
        />
      )}
      <div className="flex min-w-0 flex-col gap-1">{children}</div>
    </div>
  );
}
