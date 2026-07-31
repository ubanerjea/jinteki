import { toggleCardFavorite, toggleDecklistFavorite } from "@/app/actions/favorites";

// Plain progressive-enhancement forms (bound Server Actions, no client JS
// required for correctness) per PHASE_5_PLAN.md's "Server Actions, gated by
// the session-check helper" - see src/app/actions/favorites.ts for the
// action implementations and why they're plain forms rather than
// client-side fetch calls.
const buttonClass =
  "rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800";

export function CardFavoriteToggle({
  code,
  favorited,
}: {
  code: string;
  favorited: boolean;
}) {
  const action = toggleCardFavorite.bind(null, code);
  return (
    <form action={action}>
      <button type="submit" className={buttonClass}>
        {favorited ? "★ Favorited" : "☆ Favorite"}
      </button>
    </form>
  );
}

export function DecklistFavoriteToggle({
  id,
  favorited,
}: {
  id: string;
  favorited: boolean;
}) {
  const action = toggleDecklistFavorite.bind(null, id);
  return (
    <form action={action}>
      <button type="submit" className={buttonClass}>
        {favorited ? "★ Favorited" : "☆ Favorite"}
      </button>
    </form>
  );
}
