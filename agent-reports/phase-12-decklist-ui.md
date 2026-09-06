# Phase 12 follow-up — Decklist edit/view UI

Built against the **Follow-up: decklist edit/view UI (post-ship)** section of
`plans/PHASE_12_PLAN.md`. Presentation only: no schema, no search syntax, no
legality gate, no visual deckbuilder, no hover on `/cards`. Archived topical
plans were not used as spec.

## What was built

### 1. New decklist from `/decklists`

- **`src/app/decklists/page.tsx`** — heading row is now Search, **New
  decklist** (`href="/decklists/new"`), Home. No create form on the listing
  page. Unsigned hits still land on `/decklists/new`, which already redirects
  to sign-in.

### 2. Save button: dirty + click feedback

- **`src/lib/decklist-edit-snapshot.ts`** — `snapshotFromFormData`,
  `readDecklistEditSnapshot`, `isDecklistEditDirty`. Compares name, notes,
  identity, publish checkbox, and per-row quantities (order-independent).
- **`src/lib/decklist-edit-snapshot.test.ts`** — clean vs dirty; qty change;
  numeric-string qty; slot add/remove; extra `q`/`order`/`id` fields ignored.
- **`src/components/decklist-edit-form.tsx`** — client wrapper around the
  existing HTML form (not a fetch API). After hydration, Save is grey/disabled
  when the form matches the last-saved snapshot and black/enabled when dirty.
  While the Server Action is pending: label **Saving…**, button stays
  disabled. On success, `?saved=1` shows a **Saved** note next to the button
  until the form is dirty again. SSR / no-JS: Save stays enabled
  (`bg-foreground`).
- **`src/app/actions/decklists.ts`** — `updateDecklist` redirects to
  `/decklists/{id}/edit?saved=1`, preserving `q` and `order` when those hidden
  fields were posted.

Add/remove remain separate immediate POSTs.

`/decklists/new` **Create** is unchanged (native `required`, always the black
enabled button). The first edit view after Create starts clean.

### 3. Edit uses the view list, plus add / qty / remove

Shared module used by both `/decklists/[id]` and `/decklists/[id]/edit`:

- **`src/components/decklist-card-name.tsx`** — hover + `CardReference` +
  title `Link`.
- **`src/components/decklist-card-list.tsx`** — sort links, type/faction/set/
  name groupings, hoverable titles, set name, faction-type-side, influence
  pips. Edit rows add a leading qty input, hidden `cardCode` (so Save still
  replace-all-slots), and a **Remove** control. Sort links preserve `q` and
  drop `saved`.
- **`src/app/decklists/[id]/page.tsx`** — consumes the shared list; no second
  card-row implementation.
- **`src/app/decklists/[id]/edit/page.tsx`** — same list; no plain-text slot
  list; no **Remove cards** heading. Add-card search stays below; hits are
  title links with hover (`CardSummary.raw` is already on the search result).

Remove cannot be a nested `<form>` inside Save. Each Remove button uses
`form="remove-card-{code}"` pointing at a hidden sibling form rendered by
`DecklistSlotRemoveForms`. Qty inputs stay in the Save form.

### 4. Identity: larger type + visible thumbnail

- **`src/components/decklist-identity-header.tsx`** — shared by view and
  edit. Identity title is `text-lg underline`. Visible thumb from
  `getCardImageUrl(..., "medium")`, displayed 120px wide, plain `<img>` with
  the existing hotlink / `no-img-element` comment. `src={null}` skips the
  thumb and still shows the name. Hover-large on the name stays (`large`
  via `DecklistCardName`).

Edit keeps the identity `<select>` under this header. Thumb/title follow the
currently saved identity until Save.

### 5. Quantity before the name, same size as the name

View left cluster is `{qty} {title-link}` at the title's default size (not
`text-sm`), then small metadata on the right. Trailing `x{qty}` is gone.

Edit: qty number input in that leading slot (no `text-sm`), then linked
hoverable name, then metadata, then Remove.

Example from live HTML: `3 Bravado` then `Uprising Criminal - Event - Runner`.

### Other

- **`src/lib/decklist-view.ts`** — `formatInfluenceLabel` extracted so view
  and edit share the influence line.

## Deviations

- **Remove + Save form nesting.** Spec wants Remove as a POST of
  `removeDecklistCard` on each row, and qty/hidden `cardCode` on Save. Nested
  `<form>` is invalid HTML, so Remove submits a hidden sibling form via the
  `form` attribute. Persistence is unchanged (immediate POST, not folded into
  Save).
- **Edit shows count / influence / agenda** under the identity, matching the
  "same view as regular" principle. Spec called out the sectioned card list
  as the extract; stats came along as part of that shared header.
- **`updateDecklist` always redirects** to the edit URL with `saved=1`
  (plus `q`/`order` when present) rather than revalidating in place. Spec
  allowed either; redirect is how Saved is shown.
- **`useHasMounted`** is imported from `facet-picker.tsx` instead of
  duplicated (same hydration helper `simple-search-box.tsx` already uses).
- **New decklist** is immediately after Search, before Home.

No search syntax, schema, or archived topical plan was revived.

## Verification

### `pnpm exec tsc --noEmit`

Exit 0, no output. **PASS**

### `pnpm lint`

Exit 0 (`$ eslint`). **PASS**

(First run failed on `react-hooks/refs` for assigning `snapshotRef.current`
during render; switched to a `useCallback` that closes over `snapshot`. Clean
after that.)

### `pnpm test`

New/related files:

```
✓ src/lib/decklist-edit-snapshot.test.ts (10 tests)
✓ src/lib/decklist-view.test.ts (9 tests, including formatInfluenceLabel)
✓ src/lib/owned-decklists.test.ts (5 tests)
✓ src/components/card-hover-image.test.ts (4 tests)
```

Full `pnpm test`: **11 failures, all in `src/lib/search/decklists-advanced.test.ts`**,
pinned live counts vs the current DB (e.g. anarch 12298 vs pin 12201,
`format=standard` 74093 vs pin 73475). The same tests' live-oracle half still
agrees with `searchDecklistsAdvanced`; only the frozen pins are stale. Phase 12
verify recorded 74242 public decklists, then an incremental `pnpm sync:decklists`
moved the table to 74860 public. This follow-up did not touch search. **Not
caused by this UI work; pins not updated (out of scope).**

### Dev `pnpm dev` + curl

Dev server on :3000 (nothing else listening). Session cookie
`authjs.session-token=527797df-3059-4652-9f57-c606f3d83bcc` (user
`cms4y4wf60000qg1spcaonb6q`, same as phase-12 verify). Owned row
`cmtq24xag0001qgbohx4sgipf` (VIC custom).

| Check | Result |
|---|---|
| `GET /decklists` 200 contains `New decklist` and `href="/decklists/new"` | **PASS** |
| `GET /decklists/61e4dd61-dd12-4870-8668-2fbbc391eb7d` 200 | **PASS** |
| Identity thumb `https://card-images.netrunnerdb.com/v2/medium/35013.jpg` in the tree, `width="120"` | **PASS** |
| Identity title `class="text-lg underline"` (MuslihaT) | **PASS** |
| First slots: `<span>3</span>` then title link (`Bravado`, `Carpe Diem`, …); 24 qty-then-title rows | **PASS** |
| No trailing `>xN<` on those rows | **PASS** |
| `CardReference` present in the RSC payload | **PASS** |
| Unsigned `GET /decklists/{owned}/edit` → 307 `/api/auth/signin` | **PASS** |
| Signed `GET /decklists/cmtq24xag0001qgbohx4sgipf/edit` 200 | **PASS** |
| Edit: `CardReference`, qty input immediately before `DreamNet`, no `Remove cards` heading, `>Save<` button present, identity `text-lg` + medium thumb | **PASS** |
| Edit Save has no `disabled` in SSR HTML (no-JS stays enabled) | **PASS** |

### Production `pnpm build` + `pnpm start` + same curls

`pnpm build` compiled, typechecked, and listed `/decklists`, `/decklists/[id]`,
`/decklists/[id]/edit`, `/decklists/new` as dynamic. **PASS**

`pnpm start` on :3000. Same curls, same expected markup:

| Check | Result |
|---|---|
| `/decklists` New decklist / `/decklists/new` | **PASS** |
| Public decklist medium identity thumb, `text-lg`, `<span>3</span>` before Bravado, no `>xN<`, `CardReference` | **PASS** |
| Unsigned edit 307 `/api/auth/signin` | **PASS** |
| Signed edit: qty before DreamNet, no Remove cards, Save, CardReference, identity text-lg | **PASS** |

Dev and start processes were killed afterward. Nothing left listening on :3000.

## Unprovable from curl (browser gap)

Dirty / pending / Saved interaction needs a real browser:

- Save greying after hydration when the form matches the snapshot
- Turning black when name/notes/identity/publish/qty change
- **Saving…** + disabled while the Server Action is in flight
- **Saved** after redirect with `?saved=1`, then hidden once dirty again
- Hover show/hide, flip-to-left, stacking under the right-click popover

Do not treat those as proven. No-JS Save remaining enabled is intentional and
is visible in the SSR HTML (`bg-foreground`, no `disabled`).

## Unresolved / follow-ups

- `decklists-advanced.test.ts` pinned counts are stale vs the post-sync DB.
  Independent of this UI follow-up.
- Hover and dirty-Save still want a human look in a browser.

## Fix (same day): add/remove no longer auto-save

Add and Remove were immediate Server Action POSTs, so they never went through
Save (the button only tracked quantity edits on already-persisted rows).
With JS they now stage in working state: Add appends or bumps qty, Remove
drops the row, name/notes/identity/publish are controlled fields, and Save
is the write. No-JS still POSTs the old add/remove actions if JS never
hydrates. Spec updated in `plans/PHASE_12_PLAN.md` follow-up §2–3.
