# jinteki — Decklist Card Hover Image

Archived after Phase 12 shipped. Build spec remains `plans/PHASE_12_PLAN.md`
(section 3).

## Context

`/decklists/[id]` (`src/app/decklists/[id]/page.tsx`) is a text list: identity and
each slot are a title link wrapped in `CardReference` (right-click for rulings/rules).
The card image already exists — `getCardImageUrl(card.raw)` hotlinks NRDB's CDN, and
this page already loads `card.raw` via `include: { card: true }` — but nothing on the
page shows it. Reading a deck means either memorising the cards or clicking through
to `/cards/[code]` one at a time.

This is a hover preview of that already-resolved image, on this page only. No new
data, no schema, no sync, no new dependency.

## Scope

On `/decklists/[id]`, hovering a card name (identity line and every slot row) shows
that card's image next to the cursor/row. Left-click still goes to `/cards/[code]`.
Right-click still opens `CardReference`. Touch/no-JS is unchanged: the name is still
just a link.

## Approach

A new client component, `src/components/card-hover-image.tsx`, used only from this
page. **Not** an optional prop on `CardReference`. Hover-image and right-click-rulings
are different interactions with different data (a URL already in hand vs. a Server
Action fetch). Mixing them would either light this up on every card mention in the
app, or add a flag that this plan would then be the only caller of. Keep them nested,
not fused:

```tsx
<CardHoverImage src={getCardImageUrl(dc.card.raw, "large")} alt={dc.card.title}>
  <CardReference code={dc.cardCode}>
    <Link href={`/cards/${dc.cardCode}`} className="underline">
      {dc.card.title}
    </Link>
  </CardReference>
</CardHoverImage>
```

Same wrap on the identity `CardReference`. `src={null}` (the defensive miss in
`getCardImageUrl`) renders children only — no empty frame.

### Why a client component, not CSS `:hover`

A CSS-only `group-hover` `<img>` per row would work without JS, but it would put
~45–50 `<img>`s in the DOM on load (a typical Netrunner deck) and cannot keep the
preview inside the viewport at the bottom of a long list. `CardReference` already
requires JS for the interesting interaction on these same names; a no-JS user
already sees plain links. Mount the `<img>` on first mouse hover of that name so
the CDN request happens on demand, not for every slot on every page view.

### Interaction

- **Mouse only.** `pointerenter`/`pointerleave` with `pointerType === "mouse"`. A
  tap on a phone must still just follow the link; do not leave a stuck overlay.
- **Show** on pointer enter of the wrapping span; **hide** on pointer leave. The
  image is a preview, not a second hit target — moving onto the image itself may
  hide it, and that is fine.
- **Position** `fixed`, derived from the name's `getBoundingClientRect()`. Prefer
  the right of the name (the page is `max-w-3xl` centred, so desktop usually has
  empty margin there); flip to the left if it would overflow; clamp vertically so
  the bottom of a long list does not clip. Extract that math as a pure function
  and unit-test it — it is the only new logic that is not "setState on mouse".
- **`z-40`**, under `CardReference`'s existing `z-50`, so a right-click popover
  stacks on top of the preview without the two components talking to each other.
- **Display size 300px wide**, same as `/cards/[code]` and the card-search grid.
  Use `getCardImageUrl(..., "large")` so the bitmap is native at that width (do
  not upscale `small`/`tiny`). Height follows the card aspect (~419).
- **Plain `<img>`**, not `next/image`, same `eslint-disable-next-line
  @next/next/no-img-element` plus the existing "hotlink, no local caching"
  comment used on the detail page and in `card-results.tsx`.

No Server Action. The URL is computed on the server from `card.raw` already in
the query and passed as a prop. Do not call `getCardReferenceData` or otherwise
fetch on hover.

Do not change the list layout. It stays a text list in `max-w-3xl`; the image is
an overlay, not a second column and not a new `view=` mode.

## Testing

- Pure unit tests for the positioning helper: room on the right → place to the
  right; no room on the right → flip left; near the bottom of the viewport →
  clamp so the image stays on screen; near the top → do not go negative.
- No new query-layer tests. `getCardImageUrl` is unchanged. The Prisma include
  on this page is unchanged.

## Verification

Typecheck/lint clean, existing tests green, plus:

- **Dev `curl` of a real `/decklists/{id}`.** The rendered HTML/RSC payload
  contains `card-images.netrunnerdb.com` (the `src` prop must be in the tree,
  not fetched later) and still contains `CardReference` usage for those same
  names. Grep, don't paste the page. Pick a real synced id; the identity title
  and at least one slot title must both sit inside a hover wrapper.
- **Production `build` + `start` + the same curl.** This plan touches a route.
  Dev mode is not sufficient (`RESEARCH_AND_VERIFICATION_PRINCIPLES.md`).
- **A known-good image URL from that payload actually returns 200** from NRDB's
  CDN (`curl -I`), same check Phase 4 used for `sure_gamble`. Proof the prop is
  a real hotlink, not just a well-formed string.
- **No schema/sync/search files in the diff.**

The hover itself (mouse enter/leave, flip-to-left, stacking under the right-click
popover, touch-does-not-stick) needs a real browser, which this environment does
not have. Say so in the task report; do not claim the interaction "works" from
curl. Same caveat `CardReference` has carried since Phase 5.

## Deliberately not built

- Hover previews on `/cards`, `/cards/advanced/results`, `/favorites`, or
  anywhere else a card name is already wrapped in `CardReference`.
- Folding this into `CardReference` as an optional `imageUrl` prop.
- A CSS-only `:hover` implementation, a tooltip/popover library, or `next/image`.
- Prefetching every slot's image on page load.
- An inline image column, a grid/`view=` mode for the decklist, or a persistent
  preview pane that sits empty when nothing is hovered.
- Click-to-pin, keyboard focus preview, or making the overlay itself a link.
- Any change to `getCardImageUrl`, the decklist query, sort/grouping, or
  `CardReference`'s right-click behaviour.
