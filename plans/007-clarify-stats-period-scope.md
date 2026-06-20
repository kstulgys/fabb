# Plan 007: Make the Stats period toggle's scope honest

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `src/app/dashboard/stats.tsx` was part of an
> uncommitted redesign on top of commit `29a327a`, so `git diff 29a327a..HEAD`
> will NOT show its current state. Open the file and confirm the "Current state"
> excerpts match the live code before editing. On a mismatch, STOP.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED (touches the Stats tab's primary layout copy; no logic change)
- **Depends on**: none (shares `stats.tsx` with plan 002 — see Scope)
- **Category**: tech-debt (UX / clarity)
- **Planned at**: commit `29a327a`, 2026-06-20 (working tree dirty — see drift check)

## Why this matters

The Stats tab has a **This week / This month / All time** segment toggle at the
top. It reads as a filter for the whole screen — but it only scopes the
`Scoreboard` totals (classes + calories). The charts below ("Calories over time",
"Classes per week") always render a fixed **12-week** window, the "Top class
types" chart is always **all-time**, and the streak figure is the current
all-time streak. So switching to "This week" changes two numbers and leaves the
rest identical, with nothing on screen saying so. That quietly contradicts
*Truthful by default* / *Glanceable progress* — the control implies a scope it
doesn't apply. The honest, low-risk fix is to **label each surface's real scope**
so the toggle clearly governs the scoreboard, and the charts read as fixed-window
trends. (We deliberately do **not** re-scope the charts to the period — see
"Approach" — because that means rewriting tested server aggregation and the
streak must stay all-time.)

## Approach (read before editing)

Two ways to make the toggle honest:

- **(A) Make it true by labeling (this plan).** Keep the server aggregation as-is;
  add scope labels so each surface states what it shows. Pure presentation,
  no `convex/` change, no test impact. Low risk.
- **(B) Make the charts obey the period (deferred).** Re-scope `weeklySeries` /
  `topClassTypes` by period in `convex/stats.ts` + `statsHelpers.ts`. This
  touches unit-tested aggregation (`convex/stats.test.ts`,
  `convex/statsHelpers.test.ts`) and must keep `currentStreak` all-time. Higher
  risk; out of scope here (noted in Maintenance).

Do **(A)**.

## Current state

- `src/app/dashboard/stats.tsx` — renders the period toggle, the `Scoreboard`,
  the two-up trend charts, and the "Top class types" chart.

The data the toggle actually scopes vs. doesn't (from `convex/stats.ts:75-82`,
for context — do not edit that file):

```
totals   → periodTotals(attended, period, today)   // period-scoped  (scoreboard)
weekly   → weeklySeries(attended).slice(-12)        // last 12 weeks, NOT period
streak   → currentStreak(attended, today)           // all-time current
topTypes → topClassTypes(attended)                  // all-time, NOT period
```

The toggle + scoreboard + charts in `stats.tsx` (abbreviated, `:233-352`):

```tsx
<SegmentGroup.Root value={period} onValueChange={…}> … week/month/all … </SegmentGroup.Root>

<Scoreboard periodLabel={PERIOD_LABELS[period]} classes={…} calories={…} streak={…} />

<SimpleGrid columns={{ base: 1, md: 2 }} gap="5" mt={{ base: "3", md: "5" }}>
  <ChartCard title="Calories over time"> … </ChartCard>
  <ChartCard title="Classes per week"> … </ChartCard>
</SimpleGrid>

<ChartCard title="Top class types"> … </ChartCard>
```

`ChartCard` (`stats.tsx:116-131`) takes a `title: string`. There is a `Text`
helper pattern already used for muted captions throughout the file
(e.g. `stats.tsx:209-213`, `<Text color="fg.muted" fontSize="sm">`).

Constraints (quoted):
- `PRODUCT.md` Design Principles: *"Truthful by default"* and *"Glanceable
  progress… answer 'am I consistent / am I improving' in a look."* Labels must
  make scope instantly legible, not add clutter.
- `DESIGN.md` typography: muted helper copy is `fg.muted`, `Text size="sm"`/`xs`.
  Use those tokens; no new styles.

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Lint      | `npm run lint`     | exit 0, no errors   |
| Typecheck | `npx tsc --noEmit` | exit 0, no errors   |
| Build     | `npm run build`    | compiles, exit 0    |
| Tests     | `npm test`         | all pass (unchanged — no `convex/` edits) |

## Scope

**In scope**:
- `src/app/dashboard/stats.tsx`

**Out of scope**:
- `convex/stats.ts`, `convex/statsHelpers.ts`, and their tests — do NOT change
  aggregation. This plan is presentation-only (Approach A).
- The `Scoreboard` component internals and the period toggle behavior — leave the
  logic; only labels/captions are added around the charts.
- Plan 002 also edits `stats.tsx` (the `typesChart` series color, line ~203). It
  does not overlap these lines; if 002 already landed, re-read and confirm the
  chart titles/structure match Current state before editing.

## Git workflow

- Branch: `advisor/007-stats-period-scope`.
- One commit; conventional-commit style. Suggested:
  `fix(ui): label Stats chart scope so the period toggle isn't misread`.
- Do NOT push or open a PR unless asked.

## Steps

### Step 1: Caption the scoreboard toggle's reach

Immediately under the `SegmentGroup.Root` (the period toggle), add a one-line
muted caption clarifying the toggle scopes the headline totals. Target:

```tsx
<Text fontSize="xs" color="fg.muted">
  The period above sets the totals below. Trends and top types span your full
  history.
</Text>
```

Place it between the `SegmentGroup.Root` and the `Scoreboard` (so it reads as a
bridge from control to numbers). Keep the existing `gap` rhythm of the parent
`Stack`.

### Step 2: Label the trend grid as a fixed window

Give the two-up chart grid a scope. Simplest: add a small muted caption above the
`SimpleGrid`, e.g.:

```tsx
<Text fontSize="sm" fontWeight="medium">
  Trends{" "}
  <Span color="fg.muted" fontWeight="normal">· last 12 weeks</Span>
</Text>
```

(`Span` is from `@chakra-ui/react` — add it to the import if not already present;
it is used elsewhere in the app the same way.) Put it directly before the
`<SimpleGrid …>`.

### Step 3: Label "Top class types" as all-time

Change the third chart's title from `"Top class types"` to make its scope
explicit, e.g. `"Top class types · all time"` (pass the longer string to the
existing `ChartCard title=` prop — no structural change).

### Step 4: Verify

**Verify**:
```bash
npm run lint && npx tsc --noEmit && npm run build && npm test
```
Expected: lint/typecheck/build exit 0; `npm test` still passes unchanged (no
`convex/` files were touched).

## Test plan

No component test harness exists (no `@testing-library/*`). The backend suite
(`npm test`) must remain green and unchanged because no `convex/` file is edited
— that's part of the verification (Step 4). Manual check:

1. `npm run dev`, open Stats with several weeks of attended logs across more than
   one month.
2. Toggle This week / This month / All time: confirm the scoreboard totals change
   and the captions make clear the charts/top-types are full-history trends.
3. Confirm no chart data or color changed (this plan only adds labels).

## Done criteria

ALL must hold:

- [ ] A caption under the period toggle states it scopes the totals
- [ ] The trend grid is labeled with its 12-week window
- [ ] The "Top class types" card title states it is all-time
- [ ] No `convex/` file is modified; `npm test` passes unchanged
- [ ] `npm run lint`, `npx tsc --noEmit`, `npm run build` all exit 0
- [ ] No file other than `src/app/dashboard/stats.tsx` is modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- The toggle/scoreboard/chart structure doesn't match the "Current state"
  excerpt.
- You conclude the labels read as clutter rather than clarity and that the
  honest fix really requires re-scoping the charts (Approach B) — STOP and report
  that the period scope needs a product decision, rather than silently changing
  server aggregation.

## Maintenance notes

- **Deferred Approach B** (period-scope the charts and top-types): would require
  filtering `attended` by `period` before `weeklySeries`/`topClassTypes` in
  `convex/stats.ts`, updating `convex/stats.test.ts` /
  `convex/statsHelpers.test.ts`, and keeping `currentStreak` all-time. Consider
  it if users still expect the charts to follow the toggle after labeling. That
  is the more "do-what-it-says" fix but it's a backend change with test impact —
  out of scope for this presentation-only plan.
- Reviewer: confirm zero `convex/` changes and that no chart series data/colors
  moved — this PR should be labels only.
