# Plan 006: Lighten the class-detail dialog footer

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `src/app/dashboard/class-detail.tsx` was part of
> an uncommitted redesign on top of commit `29a327a`, so `git diff 29a327a..HEAD`
> will NOT show its current state. Open the file and confirm the "Current state"
> excerpts match the live code before editing. On a mismatch, STOP.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt (UX / cognitive load) — **most subjective plan in this set**
- **Planned at**: commit `29a327a`, 2026-06-20 (working tree dirty — see drift check)

## Why this matters

On a phone the class-detail dialog is a full-screen bottom sheet
(`size={{ base: "full" }}`). Its footer stacks, vertically: the **Book now**
block (button + outcome alert + a standing help paragraph), the **Auto-book
weekly** block (button + alert + a second standing help paragraph), and a
**Close** button. Two always-on help paragraphs are the bulk of that height, and
they **both** restate the same fact — the pool's confirmation email holds the
only cancel link. The result is a tall scroll on a small screen with the same
caveat said twice. Trimming the duplication shortens the footer and reduces
cognitive load without losing any truthful information (ADR-0001's cancel-link
caveat stays — once). This is a polish change; keep it conservative.

## Current state

- `src/app/dashboard/class-detail.tsx` — the class detail dialog. Three things
  render in the footer region.

`BookNow`'s standing help (`class-detail.tsx:244-247`) — **keep this one** (it is
the canonical statement of the cancel-link truth, next to the primary action):

```tsx
<Text fontSize="xs" color="fg.muted">
  The pool emails a confirmation with the only working cancel link —
  bookings can&apos;t be cancelled in the app.
</Text>
```

`AutoBookWeekly`'s standing help (`class-detail.tsx:325-329`) — this repeats the
cancel caveat; trim it to the scheduling fact only:

```tsx
<Text fontSize="xs" color="fg.muted">
  Books “{cls.name}” every {weekday} at {cls.startTime} from next week on.
  Disabling or deleting the rule stops future bookings but never cancels a
  booking already placed.
</Text>
```

The footer scaffold (`class-detail.tsx:442-465`) — keep its structure and the
Close button (see scope note on why Close stays):

```tsx
<Dialog.Footer flexDirection="column" alignItems="stretch" gap="4">
  {bookable ? (
    <BookNow key={cls._id} cls={cls} />
  ) : (
    <Alert.Root status="info"> … finished … </Alert.Root>
  )}
  <AutoBookWeekly key={`autobook-${cls._id}`} cls={cls} />
  <Button variant="outline" colorPalette="gray" onClick={onClose}
    w={{ base: "full", sm: "auto" }}
    alignSelf={{ base: "stretch", sm: "flex-end" }}>
    Close
  </Button>
</Dialog.Footer>
```

Constraints (quoted):
- ADR-0001 / `PRODUCT.md` "Truthful by default": the cancel-link caveat must
  remain visible **somewhere** in this dialog. After this change it stays in
  `BookNow`'s help (and the Auto-book tab itself also states it). Do not delete
  it outright.
- `DESIGN.md` §4 "Flat by default" / §5: no new surfaces or shadows; this is copy
  + spacing only.
- `CONTEXT.md` "AutoBook rule": keep the "future weeks", "never cancels a placed
  booking" meaning in the trimmed text.

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Lint      | `npm run lint`     | exit 0, no errors   |
| Typecheck | `npx tsc --noEmit` | exit 0, no errors   |
| Build     | `npm run build`    | compiles, exit 0    |

## Scope

**In scope**:
- `src/app/dashboard/class-detail.tsx`

**Out of scope**:
- The footer **Close** button — **keep it**. On the mobile full-screen sheet it
  is the one thumb-reachable close affordance (the header `CloseTrigger` X sits
  at the top of the screen, out of thumb reach). Removing it would regress
  *Thumb-first*. Do not touch it.
- `BookNow`'s standing help paragraph — keep verbatim.
- The booking logic, the live-availability block, the `DataList`, and the
  success/error alerts — leave all behavior unchanged.
- The desktop layout — the win is mobile height; don't redesign the `sm`+ view.

## Git workflow

- Branch: `advisor/006-detail-footer`.
- One commit; conventional-commit style. Suggested:
  `refactor(ui): de-duplicate the class-detail footer help text`.
- Do NOT push or open a PR unless asked.

## Steps

### Step 1: Trim the Auto-book standing help to the scheduling fact

In `AutoBookWeekly` (`class-detail.tsx:325-329`), shorten the standing `<Text>`
so it states only the scheduling fact and the "stops future bookings" effect,
dropping the duplicated cancel-link caveat (which `BookNow` already shows).
Target:

```tsx
<Text fontSize="xs" color="fg.muted">
  Books “{cls.name}” every {weekday} at {cls.startTime} from next week on —
  disabling or deleting the rule only stops future bookings.
</Text>
```

This keeps the `CONTEXT.md` meaning (future weeks; never cancels a placed
booking) while removing the second copy of the cancel-link sentence.

### Step 2: Confirm the cancel-link truth still appears exactly once in this file

**Verify**:
```bash
grep -c "only working cancel link" src/app/dashboard/class-detail.tsx
```
Expected: `1` (it remains in `BookNow`'s help, removed from `AutoBookWeekly`).

### Step 3: Verify the build

**Verify**:
```bash
npm run lint && npx tsc --noEmit && npm run build
```
Expected: all exit 0.

## Test plan

No component test harness exists (no `@testing-library/*`; `npm test` is Vitest
over `convex/**`). Verify manually:

1. `npm run dev`, open a bookable class on a narrow viewport (DevTools mobile,
   e.g. 390px wide).
2. Confirm the footer is visibly shorter and the cancel-link caveat appears once
   (under Book now), with the Auto-book help reduced to the scheduling line.
3. Confirm Book now and Auto-book weekly still work and the Close button is still
   present and reachable at the bottom of the sheet.

## Done criteria

ALL must hold:

- [ ] `grep -c "only working cancel link" src/app/dashboard/class-detail.tsx`
      prints `1`
- [ ] The `AutoBookWeekly` standing help no longer repeats the cancel-link
      caveat (now the scheduling line only)
- [ ] The footer `Close` button is unchanged and still present
- [ ] `npm run lint`, `npx tsc --noEmit`, `npm run build` all exit 0
- [ ] No file other than `src/app/dashboard/class-detail.tsx` is modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- The `AutoBookWeekly` or `BookNow` help text doesn't match the "Current state"
  excerpts.
- After Step 1, `grep -c "only working cancel link"` returns `0` (you removed the
  wrong copy) or `2` (you didn't remove the duplicate) — fix before proceeding.
- The change appears to require restructuring the footer layout or removing
  Close to get a meaningful height win — STOP; that is a larger design decision
  than this polish plan authorizes.

## Maintenance notes

- This is the conservative, low-risk slice of a broader "footer is heavy"
  observation. A larger redesign (e.g. collapsing the two help texts into a
  single shared note, or a tabbed Book/Auto-book footer) was deliberately not
  attempted here — it's subjective and higher-risk.
- Reviewer: the one thing to guard is that the cancel-link truth (ADR-0001) is
  never fully removed from the dialog — Step 2's grep enforces it.
