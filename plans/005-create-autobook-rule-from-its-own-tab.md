# Plan 005: Let the Auto-book tab create a rule

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: the files below were part of an uncommitted
> redesign on top of commit `29a327a`, so `git diff 29a327a..HEAD` will NOT show
> their current state. Open each and confirm the "Current state" excerpts match
> the live code before editing. On a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt (UX / discoverability)
- **Planned at**: commit `29a327a`, 2026-06-20 (working tree dirty — see drift check)

## Why this matters

The Auto-book tab owns AutoBook rules — it lists them, toggles them, deletes
them — but it **cannot create one**. The only way to make a rule is to open a
class in the Schedule tab and choose "Auto-book weekly". The Auto-book tab's own
empty state has to send the user away ("Open a class in the schedule and
choose…"). The surface responsible for a thing can't perform its primary action,
which violates *Recognition rather than recall* and hurts discoverability — the
user has to already know rules are born inside a different tab's dialog. Adding an
"Add rule" entry on the Auto-book tab co-locates creation with management. The
underlying mutation already exists and is reused as-is, so this is purely a new
entry point, not new booking logic.

## Current state

- `src/app/dashboard/auto-book-rules.tsx` — the Auto-book tab. Lists rules via
  `api.autoBookRules.listMine`; has an empty state that points the user
  elsewhere; no create affordance.
- `src/app/dashboard/class-detail.tsx` — already creates a rule from a class via
  `api.autoBookRules.createFromClass({ pid, date })` (the existing mutation to
  reuse).
- `src/app/dashboard/training-log.tsx` — contains the **pattern to mirror**: a
  "pick a current-week class from a `NativeSelect`, then submit `(pid, date)`"
  dialog (`PickClassPanel` + `AddLogDialog`).

The mutation to reuse (`class-detail.tsx:268,281-291`):

```tsx
const createRule = useMutation(api.autoBookRules.createFromClass);
// …
createRule({ pid: cls.pid, date: cls.date })
  .then(() => setState({ kind: "done" }))
  .catch(/* … */);
```

It derives the rule's weekday + start time + name match from the class identified
by `(pid, date)`, so the creator only needs to pass a current-week class's
`pid` + `date` — exactly what the training-log picker already collects.

The empty state to update (`auto-book-rules.tsx:200-214`):

```tsx
) : rules.length === 0 ? (
  <EmptyState.Root>
    <EmptyState.Content>
      <EmptyState.Indicator>
        <LuRepeat2 />
      </EmptyState.Indicator>
      <Stack gap="1" textAlign="center">
        <EmptyState.Title>No auto-book rules yet</EmptyState.Title>
        <EmptyState.Description>
          Open a class in the schedule and choose “Auto-book weekly” — the
          app books it for you every week.
        </EmptyState.Description>
      </Stack>
    </EmptyState.Content>
  </EmptyState.Root>
) : (
```

The pattern to mirror (`training-log.tsx:276-371`, `PickClassPanel`) builds its
options from the shared week cache:

```tsx
const week = useQuery(api.classes.weekClasses, {});
// …
const options = week.days.flatMap((day) =>
  day.classes.map((cls) => ({
    key: `${cls.pid}|${cls.date}`,
    cls,
    label: `${day.weekday} ${cls.date} · ${cls.startTime} · ${cls.name}`,
  })),
);
```

…and the dialog wrapper to mirror (`training-log.tsx:375-442`, `AddLogDialog`):
`Dialog.Root` (`size={{ base: "full", md: "lg" }}`, `motionPreset="slide-in-bottom"`,
`Dialog.Content colorPalette="teal"`), with the body mounted only while `open`.

And the tab header pattern with an "Add" button (`training-log.tsx:646-666`): a
`Flex` header with the heading on the left and a `<Button onClick={() => setAdding(true)}><LuPlus /> Add log</Button>`
on the right (`w={{ base: "full", md: "auto" }}`).

Constraints (quoted):
- `CONTEXT.md` "AutoBook rule": *"A standing, recurring-weekly instruction to book
  a class… matched each week by weekday, start time, and name."* Use this
  vocabulary in copy ("rule", "weekly"), not "subscription"/"schedule".
- `DESIGN.md` §5 Buttons: one solid-teal primary per surface; the "Add rule"
  button is that primary. Dialogs use the existing full-screen-sheet-on-mobile
  pattern.
- ADR-0001 truthfulness: a rule books **future** weeks; creating/deleting a rule
  never places or cancels a Booking immediately. The existing tab copy already
  says this — don't contradict it.

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Lint      | `npm run lint`     | exit 0, no errors   |
| Typecheck | `npx tsc --noEmit` | exit 0, no errors   |
| Build     | `npm run build`    | compiles, exit 0    |

## Scope

**In scope**:
- `src/app/dashboard/auto-book-rules.tsx`

**Out of scope**:
- `convex/autoBookRules.ts` and the `createFromClass` mutation — reuse as-is; do
  NOT change server logic, validation, or the "future weeks only" semantics.
- `class-detail.tsx`'s in-dialog "Auto-book weekly" path — leave it; this plan
  ADDS a second entry point, it does not move the existing one.
- `training-log.tsx` — it's the reference pattern only; do not edit it.
- Bulk/multi-rule creation — out of scope (one rule per add, mirroring the
  existing single-add UX).

## Git workflow

- Branch: `advisor/005-autobook-create`.
- One commit (or one per step); conventional-commit style. Suggested:
  `feat(ui): add rule creation to the Auto-book tab`.
- Do NOT push or open a PR unless asked.

## Steps

### Step 1: Add an `AddRuleDialog` to `auto-book-rules.tsx`

Create a dialog component inside `auto-book-rules.tsx` (not a new file) that
mirrors `training-log.tsx`'s `PickClassPanel` + `AddLogDialog`, but submits to
the AutoBook mutation. Shape:

- Props: `{ open: boolean; onClose: () => void }`.
- Inside (mounted only while `open`):
  - `const week = useQuery(api.classes.weekClasses, {});`
  - `const createRule = useMutation(api.autoBookRules.createFromClass);`
  - Local state: `selected` (the `"pid|date"` key), `busy`, `error`.
  - While `week === undefined`: a centered `<Spinner />`.
  - If there are zero classes this week: an `info` `Alert` explaining no classes
    are available to base a rule on right now.
  - Else a `Field.Root` + `NativeSelect` of the week's classes (reuse the
    `options` mapping shown in Current state), and a solid primary
    `<Button>Add rule</Button>` that calls
    `createRule({ pid, date })` for the picked class, then `onClose()` on success;
    on error set `error` and surface it in an `Alert status="error"`.
  - `busy` disables the button while the mutation is in flight (mirror
    `PickClassPanel`'s `busy` handling exactly).
- Wrap in the same `Dialog.Root`/`Portal`/`Dialog.Content colorPalette="teal"`
  scaffold as `AddLogDialog`, with `Dialog.Header` title "Add auto-book rule",
  a `Dialog.CloseTrigger` `CloseButton`, and a `Dialog.Footer` with an outline
  "Close" button.

Add the needed imports to the file's `@chakra-ui/react` import (e.g. `Button`,
`CloseButton`, `Dialog`, `Field`, `NativeSelect`, `Portal`, `Spinner`) and
`LuPlus` to the `react-icons/lu` import — add only what isn't already imported.

### Step 2: Add the "Add rule" button to the tab header

In the `AutoBookRules` component, wrap the existing heading block in a header
`Flex` (mirror `training-log.tsx:646-666`) with an "Add rule" primary button on
the right that opens the dialog. Add `const [adding, setAdding] = useState(false);`
(`useState` is already imported) and render `<AddRuleDialog open={adding} onClose={() => setAdding(false)} />`
at the end of the returned `Stack`.

Button: `<Button w={{ base: "full", md: "auto" }} flexShrink="0" onClick={() => setAdding(true)}><LuPlus /> Add rule</Button>`.

### Step 3: Update the empty state to offer creation here

In the `rules.length === 0` empty state, change the description so it no longer
sends the user to another tab, and add an action button that opens the same
dialog. Target copy (keeps `CONTEXT.md` vocabulary):

- Title: keep `No auto-book rules yet`.
- Description: e.g. *"Add a weekly rule and the app books that class for you the
  day before — every week."*
- Add `<EmptyState.Content>`-level action: a primary
  `<Button onClick={() => setAdding(true)}><LuPlus /> Add rule</Button>`.

(Keep using `setAdding` from Step 2 so the empty-state button and header button
open the same dialog.)

### Step 4: Verify

**Verify**:
```bash
npm run lint && npx tsc --noEmit && npm run build && grep -n "Open a class in the schedule" src/app/dashboard/auto-book-rules.tsx
```
Expected: the three build commands exit 0; the `grep` returns **no matches**
(the "go elsewhere" copy is gone).

## Test plan

No component test harness exists (no `@testing-library/*`; `npm test` is Vitest
over `convex/**` and the `createFromClass` mutation is already covered by
`convex/autoBookRules.test.ts`). Verify the new entry point manually:

1. `npm run dev`, sign in, complete pool details, open the Auto-book tab.
2. With no rules: confirm the empty state shows an "Add rule" button (no
   "open a class in the schedule" text).
3. Click "Add rule" → pick a current-week class → "Add rule" → the dialog closes
   and the new rule appears in the list with its weekday/time.
4. Confirm the existing Schedule → class → "Auto-book weekly" path still works
   and produces an identical rule (same mutation).

## Done criteria

ALL must hold:

- [ ] `grep -n "Open a class in the schedule" src/app/dashboard/auto-book-rules.tsx`
      returns no matches
- [ ] The Auto-book tab has an "Add rule" primary button (header) that opens a
      class-picker dialog calling `api.autoBookRules.createFromClass`
- [ ] The empty state offers creation in-place (no cross-tab redirect)
- [ ] `npm run lint`, `npx tsc --noEmit`, `npm run build` all exit 0
- [ ] No file other than `src/app/dashboard/auto-book-rules.tsx` is modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- The empty-state block or the `createFromClass` usage doesn't match the
  "Current state" excerpts.
- `api.autoBookRules.createFromClass` is not found (run
  `grep -rn "createFromClass" convex/autoBookRules.ts` — expect a match; if the
  mutation is named differently, STOP rather than guessing).
- A picked class needs more than `{ pid, date }` to create a rule (the mutation
  signature differs from the class-detail usage) — STOP and report the real
  signature.

## Maintenance notes

- The picker is limited to the **current week's** classes (the only schedule the
  app caches — ADR-0002). That's acceptable because a rule matches by
  weekday+time+name and recurs; any week's instance of the class seeds the same
  rule. If multi-week schedules are ever cached, this picker can widen.
- Reviewer: confirm the new dialog reuses `createFromClass` unchanged (no new
  booking logic), and that the two creation paths (here and class-detail) produce
  identical rules.
- Deliberately deferred: bulk "add several rules at once" (Alex/power-user
  accelerator) — noted in the audit, out of scope for this plan.
