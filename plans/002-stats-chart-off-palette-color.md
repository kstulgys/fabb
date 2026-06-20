# Plan 002: Bring the "Top class types" chart back on-palette

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `src/app/dashboard/stats.tsx` was part of an
> uncommitted redesign on top of commit `29a327a`, so `git diff 29a327a..HEAD`
> will NOT show its current state. Open the file and confirm the "Current state"
> excerpt below matches the live code before editing. On a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (but shares `stats.tsx` with plan 007 — see Scope)
- **Category**: tech-debt (design-system)
- **Planned at**: commit `29a327a`, 2026-06-20 (working tree dirty — see drift check)

## Why this matters

`DESIGN.md` defines a deliberately restrained palette: **one teal accent** over a
zinc-neutral ramp, plus a four-hue *functional* status set (green/blue/orange/red
— each with an assigned booking-status meaning). Purple is not in the system at
all. The Stats tab's "Top class types" chart fills its bars with `purple.solid`,
while the other two charts correctly use `teal.solid`. This is the single
off-palette color in the entire app — it breaks "The One Voice Rule" (§2) and
reads as an arbitrary, un-designed choice in exactly the screen
(`DESIGN.md` sanctions Stats as the one teal-forward surface) that should be the
most on-brand. Putting it back on teal makes the three charts a coherent set.

## Current state

- `src/app/dashboard/stats.tsx` — the Stats tab. Builds three charts with
  Chakra Charts' `useChart`. The calories and classes charts use `teal.solid`;
  the top-types chart uses `purple.solid`.

`src/app/dashboard/stats.tsx:192-203`:

```tsx
const caloriesChart = useChart({
  data: caloriesData,
  series: [{ name: "calories", color: "teal.solid" }],
});
const classesChart = useChart({
  data: classesData,
  series: [{ name: "classes", color: "teal.solid" }],
});
const typesChart = useChart({
  data: topTypes,
  series: [{ name: "count", color: "purple.solid" }],   // ← off-palette
});
```

Design constraint (quoted): `DESIGN.md` §2 "The One Voice Rule" — *"Teal is
disciplined… stays under ~15% of any screen… The one sanctioned exception: the
Stats tab… may go teal-forward on its headline numbers."* Teal-forward is
exactly what we want here; purple is not.

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Lint      | `npm run lint`     | exit 0, no errors   |
| Typecheck | `npx tsc --noEmit` | exit 0, no errors   |
| Build     | `npm run build`    | compiles, exit 0    |

## Scope

**In scope**:
- `src/app/dashboard/stats.tsx`

**Out of scope**:
- The chart *structure*, axes, tooltips, or the `Scoreboard` — only the color
  token changes.
- Plan 007 also edits `stats.tsx` (chart titles/scope labels, different lines).
  If 007 has already landed, re-read the file and confirm line 203's
  `useChart`/`color` is unchanged before editing; the two plans do not overlap
  on the same line.

## Git workflow

- Branch: `advisor/002-stats-chart-color`.
- One commit; conventional-commit style (see `git log --oneline`). Suggested:
  `fix(ui): use teal for the top-class-types chart (drop off-palette purple)`.
- Do NOT push or open a PR unless asked.

## Steps

### Step 1: Change the series color

In `src/app/dashboard/stats.tsx`, in the `typesChart = useChart({…})` call,
change `color: "purple.solid"` to `color: "teal.solid"`.

Rationale for `teal.solid` (not a neutral): it matches the other two charts and
embraces the sanctioned teal-forward Stats surface. The bars stay distinguishable
because this chart is a separate titled card, not overlaid on the others.

**Verify (no off-palette color remains)**:
```bash
grep -n "purple" src/app/dashboard/stats.tsx
```
Expected: **no matches** (exit 1).

### Step 2: Verify the build

**Verify**:
```bash
npm run lint && npx tsc --noEmit && npm run build
```
Expected: all exit 0.

## Test plan

No component test harness exists (no `@testing-library/*`; `npm test` is Vitest
over `convex/**`). Verify via Step 1–2 commands plus a manual check: `npm run dev`,
open Stats with at least one attended log, confirm all three charts render in
teal and the "Top class types" bars are no longer purple.

## Done criteria

ALL must hold:

- [ ] `grep -n "purple" src/app/dashboard/stats.tsx` returns no matches
- [ ] The `typesChart` series color is `teal.solid`
- [ ] `npm run lint`, `npx tsc --noEmit`, `npm run build` all exit 0
- [ ] No file other than `src/app/dashboard/stats.tsx` is modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- The `typesChart` `useChart` block doesn't match the "Current state" excerpt.
- `purple` appears in `stats.tsx` in a place other than the `typesChart` color
  (means there's a second off-palette usage this plan didn't account for).

## Maintenance notes

- If a future design adds a second sanctioned accent for charts, revisit — but
  per current `DESIGN.md` there is exactly one accent (teal).
- Reviewer: confirm no neutral/secondary palette crept in; the fix is teal,
  matching the sibling charts.
