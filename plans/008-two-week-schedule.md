# Plan 008: Two-week Schedule window (current + next) with daily refresh

Source: GitHub issue #12 (PRD). Implements the rolling two-week **Schedule
window** decided in the grill session and recorded in ADR-0006.

## Global Constraints

Binding on every task. Copy into each dispatch's constraints block.

- **Time zone**: all civil dates are Europe/Vilnius. Reuse the existing pure
  helpers in `convex/week.ts` (`weekDatesFor`, `todayDate`, `resolveClock`,
  `classStatus`, `isoWeekday`); do civil-date math, never raw UTC offset
  arithmetic (DST-safety).
- **ADRs**: respect ADR-0006 (two-week rolling cache, daily refresh,
  future-only reconciliation, attendance-conversion coupling) and the part of
  ADR-0002 it preserves: free-spot counts are fetched **live** at class-open and
  are **never** cached.
- **Glossary** (CONTEXT.md): use the canonical terms — Schedule window, Booking,
  AutoBook rule, AutoBook outcome, Attendance conversion, Booking status.
- **Pool I/O boundary**: every pool network call goes through the `PoolGateway`
  in `convex/pool/gateway.ts`. Tests inject a fake via `setPoolGateway` and
  restore with `afterEach(() => setPoolGateway(null))`; tests NEVER hit the
  network.
- **One week per page**: the pool schedule page returns exactly one Mon–Sun
  week, selected by `?nuo=<monday-ISO>` (no param = current week).
- **Verification scope**: run ONLY the vitest files covering your task and report
  results with TDD evidence. Do NOT run project-wide lint/build/tsc or the full
  suite — the controller runs those once at the end.
- **Do NOT modify** `plans/README.md` (controller owns it).
- Follow existing patterns and file structure; do not restructure outside your
  task.

## Task 1: Fetch and cache the next week

**What to build**: Make the scrape populate the two-week Schedule window
(current + next) instead of only the current week. The day-before AutoBook reads
the cache by `date == tomorrow`; with next week cached, a rule for a Monday class
run on a Sunday resolves correctly instead of `no_match` (the latent bug this
fixes).

Add a pure helper `weekStartsFor(now: Date, count: number): string[]` to
`convex/week.ts` returning `count` consecutive Monday ISO dates starting at the
Monday of `now`'s week (civil-date math, DST-safe — same approach as
`weekDatesFor`). Parameterize the gateway: `fetchSchedule(weekStart: string)`;
the real implementation requests `${SCHEDULE_URL}?nuo=${encodeURIComponent(weekStart)}`.
`scrapeWeek` resolves `weekStartsFor(resolveClock(now), 2)`, then **loops per
week** — fetch that week's schedule, then each class's event detail — collects
all rows, and upserts them via the existing idempotent `upsertClasses`. Structure
the per-week loop so Task 5 can add per-week reconciliation cleanly. Add an
optional `now` arg to `scrapeWeek` (`v.optional(v.number())`) for tests, matching
the pattern used by other time-dependent entry points.

**Interfaces**:
- `weekStartsFor(now: Date, count: number): string[]` — Monday ISO strings,
  `count >= 1`, first element is this week's Monday.
- `PoolGateway.fetchSchedule(weekStart: string): Promise<ScheduleClass[]>` —
  update the interface, `realPoolGateway`, and EVERY test fake (`scrape.test.ts`
  returns per-week classes; the throwing fakes in `autoBook/availability/book`
  tests just accept the param).
- `scrapeWeek` gains `args: { now: v.optional(v.number()) }`.

**Acceptance criteria**:
- [ ] `weekStartsFor` unit-tested: `count` 1 → `[thisMonday]`; 2 →
      `[thisMonday, nextMonday]` (7 days apart); pinned to a known Vilnius
      instant; a date near a DST transition still yields correct Mondays.
- [ ] The real `fetchSchedule` builds `?nuo=<weekStart>` (verify via a focused
      gateway/url assertion or through the scrape fake).
- [ ] With a fake returning distinct classes per `weekStart`, `scrapeWeek`
      caches BOTH weeks' rows; re-run produces no duplicates (idempotent on
      `(pid,date)`).
- [ ] Regression (now-injection seam): with both weeks cached and a **Sunday**
      clock, an AutoBook rule whose weekday is Monday resolves to `ready`
      (bookable), not `no_match`.
- [ ] `scrape.test.ts` updated for the parameterized fetch and 2-week counts;
      `classes.test.ts` (`weekClasses`) untouched and still green.
- [ ] `week.test.ts`, `scrape.test.ts`, `autoBook.test.ts` green, output
      pristine.

**Blocked by**: None — can start immediately.

**TDD**: yes — `weekStartsFor` and the Sunday regression go red→green.

## Task 2: Two-week query and This/Next toggle

**What to build**: Expose the Schedule window to the schedule view and let the
User browse both weeks.

Backend: add a `scheduleWeeks` query returning `{ weeks: WeekClasses[] }` (length
2: current then next), reusing a new pure helper `groupWeek(rows, dates)`
extracted from the existing `weekClasses` grouping; BOTH queries call it. Same
auth gate as `weekClasses`. Read once over `by_date` for
`[thisMonday .. nextSunday]`, group into 2×7. Leave `weekClasses` signature and
return shape unchanged — the AutoBook-rule picker and Training-log picker still
use it (a future class must not be loggable as attended).

Frontend (`src/app/dashboard/week-calendar.tsx`): `WeekCalendar` queries
`scheduleWeeks`; render a "This week / Next week" segmented toggle ABOVE the
existing 7-day strip, active segment = teal foreground **text only** (no solid
fill — mirror the main-nav tab pattern; stays within the One Voice teal budget);
reuse the existing `WeekSchedule` renderer for the selected week. Remove the
caption "Only the current week is available."; the date-range subtext follows
the active week. Default active week = current (`weeks[0]`); default day = today
if in that week else `weeks[0].days[0]` (NAIVE default — smart default is Task 3).

**Interfaces**:
- `scheduleWeeks` query, `args: { now: v.optional(v.number()) }`, returns
  `{ weeks: WeekClasses[] }`.
- `groupWeek(rows: Doc<"classes">[], dates: string[]): WeekClasses` — pure.
- `weekClasses` — unchanged.

**Acceptance criteria**:
- [ ] `scheduleWeeks` returns exactly 2 weeks, current then next, each grouped
      Mon→Sun and time-sorted, containing only window dates; throws for a
      signed-out caller.
- [ ] convexTest coverage mirroring `classes.test.ts` style (grouping, ordering,
      auth gate, both weeks present).
- [ ] UI: toggle switches weeks; both browsable; the class-detail dialog + live
      free-spots work for a next-week class; booking a next-week class works.
- [ ] Caption removed; subtext shows the active week's range.
- [ ] `weekClasses` and its tests untouched; both pickers still compile and
      behave identically.
- [ ] `classes.test.ts` green, output pristine.

**Blocked by**: Task 1 (cache must hold next week).

**Note**: no component test harness exists (see plan 004); UI is verified
manually, so all testable logic lives in the query/helper.

## Task 3: Smart default landing

**What to build**: Replace Task 2's naive default with the agreed UX:
current-unless-spent, today-as-anchor. Add a pure helper
`pickInitialView(weeks: WeekClasses[], now: Date): { weekIndex: number; date: string }`
in a client-safe module (mirror where `rule-match.ts` lives under
`src/app/dashboard/`). Rule (from the grill, encodes the decision):

```
weekIndex = weeks[0] has any class with classStatus(...).status !== "finished"
            ? 0 : 1
chosen    = weeks[weekIndex]
date      = today ∈ chosen.days ? today
          : (first chosen day with classes)?.date ?? chosen.days[0].date
```

Wire it into `WeekCalendar`'s initial state (week + day).

**Interfaces**:
- `pickInitialView(weeks, now): { weekIndex, date }` — pure, client-safe,
  unit-tested.

**Acceptance criteria**:
- [ ] Mid-week with an upcoming class today → `weekIndex 0`, `date = today`.
- [ ] Current week fully finished/empty (e.g. Sunday) → `weekIndex 1`,
      `date = next week's first class day`.
- [ ] Current week present but no upcoming class → rolls to next week.
- [ ] Unit tests cover mid-week, weekend-spent, and empty-current.
- [ ] The view opens on the chosen week and day.

**Blocked by**: Task 2.

**TDD**: yes — pure helper red→green.

## Task 4: Daily refresh cadence

**What to build**: Change the "refresh schedule" cron from an hourly interval to
a daily UTC cron `0 22 * * *` (~00:00 Europe/Vilnius, ±1h DST — irrelevant for a
refresh), still targeting `internal.pool.scrape.scrapeWeek`. Update the
cron-wiring test to assert the new spec. Re-language the stale "hourly" /
"current week" comments in `convex/crons.ts` for the schedule-refresh block to
"daily" / "two-week Schedule window" per ADR-0006. Do NOT touch the other two
crons.

**Interfaces**:
- `crons.cron("refresh schedule", "0 22 * * *", internal.pool.scrape.scrapeWeek, {})`.

**Acceptance criteria**:
- [ ] `crons.test.ts`: the "refresh schedule" job asserts
      `{ type: "cron", cron: "0 22 * * *" }` and targets `scrapeWeek`; the
      day-before and conversion cron assertions are unchanged.
- [ ] No "hourly" / "current week" wording remains in the schedule-refresh block
      of `crons.ts`.
- [ ] `crons.test.ts` green, output pristine.

**Blocked by**: Task 1 (so the daily refresh scrapes the full window).

**TDD**: yes — change the assertion first (red), then the cron (green).

## Task 5: Reconcile vanished and changed classes (future-only)

**What to build**: Make the cache mirror the pool for FUTURE dates on each
refresh. After upserting a **successfully-fetched** week's scraped rows, delete
cached `classes` rows within that week's date range whose `(pid,date)` is absent
from the fresh scrape — ONLY for `date > today` (Europe/Vilnius). Finished and
today's rows are NEVER deleted: `attendance.convertCompletedBookings` reads the
cached class row to build the Training log, so deleting a finished-but-unconverted
class would silently lose attendance (ADR-0006). A week whose fetch FAILED must
not delete that week's rows (never treat an empty/failed fetch as "all
cancelled"). Changed classes are already handled by upsert-replace — keep that.

Refactor the write path so the scrape reconciles per successfully-fetched week:
extend or replace `upsertClasses` with a reconcile that takes the scraped rows
plus the week's date bounds and `today`, upserts, then deletes future-only
absent rows in-range. `scrapeWeek` fetches each week independently; if a week's
schedule fetch throws, log/skip reconciliation for that week and still process
the other.

**Interfaces**:
- Reconcile mutation (e.g. `reconcileWeek({ classes, weekStart, weekEnd, today })`
  or an extended `upsertClasses`) — upsert + future-only delete-absent.
- `scrapeWeek` isolates per-week fetch failures.

**Acceptance criteria**:
- [ ] A FUTURE cached class absent from the fresh scrape is DELETED.
- [ ] A FINISHED/today cached class absent from the fresh scrape is PRESERVED
      (attendance guard) — assert it survives a reconcile.
- [ ] A CHANGED class (same `pid`+`date`, new time/name) is updated in place.
- [ ] A week whose schedule fetch throws does NOT delete that week's cached
      rows; the other week still reconciles.
- [ ] Idempotent re-run; no duplicates.
- [ ] `scrape.test.ts` (or a sibling) covers: delete-future-absent,
      preserve-finished-absent, fetch-failure-no-wipe, change-in-place.
- [ ] Relevant vitest green, output pristine.

**Blocked by**: Task 1 (demoable after Task 2).

**TDD**: yes.
