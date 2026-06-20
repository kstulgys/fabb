# Plan 004: Mark "Today" in the week schedule

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `src/app/dashboard/week-calendar.tsx` was part of
> an uncommitted redesign on top of commit `29a327a`, so `git diff 29a327a..HEAD`
> will NOT show its current state. Open the file and confirm the "Current state"
> excerpts match the live code before editing. On a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt (UX / glanceability)
- **Planned at**: commit `29a327a`, 2026-06-20 (working tree dirty — see drift check)

## Why this matters

The core job-to-be-done (`PRODUCT.md`) is mid-week, one-handed: *"check that
tomorrow's spot is secured."* The week schedule renders all seven days
Monday→Sunday with identical headings and **no marker for today** — the user has
to read each `YYYY-MM-DD` date to locate where "now" is. That fights two stated
principles: **Thumb-first** and **Glanceable progress**. A small, on-system
"Today" marker on the current day's heading lets the eye land on the relevant day
instantly. The per-class finished/in-progress/upcoming status is already
computed; only the *day-level* "you are here" cue is missing.

## Current state

- `src/app/dashboard/week-calendar.tsx` — renders the Mon–Sun week, grouped by
  day. Each day has a `date` (`"YYYY-MM-DD"`) and a `weekday` label.

Imports today (`week-calendar.tsx:14-20`, abbreviated):

```tsx
import { useQuery } from "convex/react";
import { LuCalendarDays, LuClock, LuFlame } from "react-icons/lu";
import { classStatus } from "../../../convex/week";
```

The day heading being rendered (`week-calendar.tsx:138-145`):

```tsx
{week.days.map((day) => (
  <Stack gap="2" key={day.date}>
    <Heading size="sm">
      {day.weekday}{" "}
      <Span color="fg.muted" fontWeight="normal">
        · {day.date}
      </Span>
    </Heading>
    {day.classes.length === 0 ? (
```

Available helpers (already in this project, pure + client-safe — `classStatus`
from the same module is already imported here):

- `convex/week.ts:98` — `export function todayDate(now: Date): string` → the
  `"YYYY-MM-DD"` civil date of "today" in Europe/Vilnius.
- `convex/week.ts:109` — `export function resolveClock(now?: number): Date` →
  returns `new Date()` when called with no argument.

So `todayDate(resolveClock())` yields today's date string in the same Vilnius
calendar the rest of the app uses, directly comparable to `day.date`.

Design constraints (quoted):
- `DESIGN.md` §2 "The One Voice Rule": teal marks "what's live"; a "Today" cue is
  a legitimate teal use. Use `colorPalette="teal"` / `teal.fg`, no new color.
- `DESIGN.md` §5 Badge: *"compact… `subtle` variant, low saturation; never a loud
  full-solid chip on a resting row."* Use `variant="subtle"`.
- `Badge` is already used in this file (e.g. the time pill) — match that usage.

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Lint      | `npm run lint`     | exit 0, no errors   |
| Typecheck | `npx tsc --noEmit` | exit 0, no errors   |
| Build     | `npm run build`    | compiles, exit 0    |

## Scope

**In scope**:
- `src/app/dashboard/week-calendar.tsx`

**Out of scope**:
- `convex/week.ts` — import the existing helpers; do NOT modify them.
- The server `weekClasses` query / `convex/classes.ts` — do not add an `isToday`
  flag server-side; compute it on the client (consistent with how this file
  already computes `now`/`classStatus` client-side).
- Per-class status rendering (`StatusBadge`, dimming finished classes) — already
  correct, leave it.
- Auto-scroll-to-today behavior — out of scope (a marker only; see Maintenance).

## Git workflow

- Branch: `advisor/004-today-anchor`.
- One commit; conventional-commit style. Suggested:
  `feat(ui): mark today in the week schedule`.
- Do NOT push or open a PR unless asked.

## Steps

### Step 1: Import the date helpers and `Badge`

In `src/app/dashboard/week-calendar.tsx`:

- Add `Badge` to the `@chakra-ui/react` import if not already present (it IS
  already imported in this file — verify and reuse).
- Add to the `convex/week` import: `todayDate` and `resolveClock` alongside the
  existing `classStatus`:

```tsx
import { classStatus, resolveClock, todayDate } from "../../../convex/week";
```

### Step 2: Compute today once in `WeekCalendar`

In the `WeekCalendar` component body, near the existing `now`/data setup (after
the `useQuery` and any existing `const now = new Date();`), add:

```tsx
const today = todayDate(resolveClock());
```

(If a `const now = new Date();` already exists in this component, you may instead
write `const today = todayDate(now);` — either is correct. Do not add a second
clock if one is already there.)

### Step 3: Render the "Today" marker on the matching day heading

Replace the day heading block (the `<Heading size="sm">…</Heading>` shown in
Current state) so that, when `day.date === today`, it shows a compact teal
"Today" badge and the weekday reads in the teal foreground. Target shape:

```tsx
<HStack gap="2">
  <Heading
    size="sm"
    color={day.date === today ? "teal.fg" : undefined}
  >
    {day.weekday}{" "}
    <Span color="fg.muted" fontWeight="normal">
      · {day.date}
    </Span>
  </Heading>
  {day.date === today && (
    <Badge colorPalette="teal" variant="subtle" size="sm">
      Today
    </Badge>
  )}
</HStack>
```

`HStack` is already imported in this file (used by `Fact`). Keep the surrounding
`<Stack gap="2" key={day.date}>` and the classes list below unchanged.

### Step 4: Verify

**Verify**:
```bash
npm run lint && npx tsc --noEmit && npm run build
```
Expected: all exit 0.

## Test plan

No component test harness exists (no `@testing-library/*`; `npm test` is Vitest
over `convex/**`). Verify manually:

1. `npm run dev`, open the Schedule tab.
2. Confirm exactly **one** day (the current Vilnius date) shows the teal "Today"
   badge and teal weekday; all other days look unchanged.
3. (Edge) If today is outside the displayed Mon–Sun week — only possible right at
   a week boundary — no badge shows and nothing breaks. The comparison is a plain
   string equality, so a non-matching week simply renders no marker.

## Done criteria

ALL must hold:

- [ ] `todayDate` and `resolveClock` are imported from `../../../convex/week`
- [ ] The current day's heading renders a `variant="subtle"` teal "Today" badge;
      no other day does
- [ ] `npm run lint`, `npx tsc --noEmit`, `npm run build` all exit 0
- [ ] No file other than `src/app/dashboard/week-calendar.tsx` is modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- The day-heading block doesn't match the "Current state" excerpt.
- `todayDate` or `resolveClock` is not exported from `convex/week.ts` (run
  `grep -n "export function \(todayDate\|resolveClock\)" convex/week.ts` — expect
  two matches; if not, STOP).
- Adding the import causes a build error about server-only code (it should not —
  `classStatus` is already imported from the same module client-side; if it does,
  report it rather than working around it).

## Maintenance notes

- A natural follow-up (deliberately out of scope here): auto-scroll the Today
  group into view on mount, or render today's day group first. Left out to keep
  this change a pure, low-risk visual marker.
- Reviewer: confirm the marker uses teal (the "live" accent) and `subtle`
  variant per `DESIGN.md`, and that the comparison is against the Vilnius
  `todayDate`, not a raw `new Date().toISOString()` (which would be UTC and could
  be a day off near midnight).
