import type { SearchParamsInput } from "@/lib/search/types";

export function decklistRemoveFormId(cardCode: string): string {
  return `remove-card-${cardCode}`;
}

export function decklistOrderHref(
  basePath: string,
  searchParams: SearchParamsInput,
  value: string,
): string {
  const params = new URLSearchParams();
  for (const [key, v] of Object.entries(searchParams)) {
    if (key === "order" || key === "saved" || v === undefined) continue;
    if (Array.isArray(v)) {
      for (const item of v) params.append(key, item);
    } else {
      params.set(key, v);
    }
  }
  if (value) params.set("order", value);
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}
