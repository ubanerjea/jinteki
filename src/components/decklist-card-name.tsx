import Link from "next/link";

import { CardHoverImage } from "@/components/card-hover-image";
import { CardReference } from "@/components/card-reference";
import { getCardImageUrl } from "@/lib/card-image";

export function DecklistCardName({
  code,
  title,
  raw,
  className = "underline",
}: {
  code: string;
  title: string;
  raw: unknown;
  className?: string;
}) {
  return (
    <CardHoverImage src={getCardImageUrl(raw, "large")} alt={title}>
      <CardReference code={code}>
        <Link href={`/cards/${code}`} className={className}>
          {title}
        </Link>
      </CardReference>
    </CardHoverImage>
  );
}
