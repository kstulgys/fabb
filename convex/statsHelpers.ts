import { fromColumns, midpoint } from "./calories";
import { isoWeekday } from "./week";

/**
 * Pure, unit-tested aggregation over a User's ATTENDED Training logs (issue 11).
 *
 * Every function here is a plain data transform — no Convex ctx, no clock, no
 * I/O — so the calorie/period/streak/top-type math can be exercised directly in
 * `statsHelpers.test.ts`. The `stats.summary` query is the only caller: it reads
 * the caller's logs, keeps `attended: true` rows, resolves "today" in
 * Europe/Vilnius once, and hands both to these helpers.
 *
 * Calories rule (`.git/sdd/constraints.md`): a Calorie total sums each log's
 * range MIDPOINT `(kcalMin+kcalMax)/2`; a log missing Calories is EXCLUDED from
 * the calorie total but STILL counts as an attended class everywhere else
 * (counts, weekly buckets, streak, top types).
 */

/** The period a totals view is scoped to. */
export type StatsPeriod = "week" | "month" | "all";

/**
 * The slice of a Training log the stats math reads. Only ATTENDED logs are ever
 * passed in — the `stats.summary` query filters `attended: true` first, so a
 * "didn't go" log (issue 10) never reaches here. A full `Doc<"trainingLogs">`
 * is structurally assignable to this.
 */
export interface StatLog {
  date: string; // ISO "YYYY-MM-DD" (Europe/Vilnius civil date)
  className: string;
  kcalMin?: number;
  kcalMax?: number;
}

/** Per-week bucket: the Monday ISO date plus that week's attended-class count
 * and summed Calorie midpoints. Backs the Calories-over-time and
 * classes-per-week charts. */
export interface WeekBucket {
  week: string; // ISO "YYYY-MM-DD" of that week's Monday
  classes: number;
  calories: number;
}

/** A class type and how many attended logs carry that name. */
export interface ClassTypeCount {
  className: string;
  count: number;
}

const DAY_MS = 86_400_000;

/** Shift an ISO date by `days` (may be negative), staying on UTC-anchored civil
 * dates so it is immune to DST — the same technique as `week.ts`. */
function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/**
 * The Monday (ISO date) of the Mon–Sun week containing `date`. A civil date's
 * weekday is timezone-independent (see {@link isoWeekday}), so this is pure
 * string arithmetic — no Vilnius conversion — and buckets a Sunday with its
 * own week rather than the next one.
 */
export function weekStart(date: string): string {
  return addDays(date, -(isoWeekday(date) - 1));
}

/**
 * Whether `date` falls within `period`, relative to the Vilnius `today`:
 * - `"week"`  → the Mon–Sun week containing today;
 * - `"month"` → the calendar month containing today (shared `YYYY-MM` prefix);
 * - `"all"`   → always true.
 * ISO dates compare correctly as plain strings, so the week test is a pair of
 * lexical comparisons against the Monday/Sunday bounds.
 */
export function inPeriod(
  date: string,
  period: StatsPeriod,
  today: string,
): boolean {
  if (period === "all") return true;
  if (period === "month") return date.slice(0, 7) === today.slice(0, 7);
  const monday = weekStart(today);
  return date >= monday && date <= addDays(monday, 6);
}

/**
 * Headline totals for a period: the attended-class count and the summed Calorie
 * midpoints. A null-Calorie log increments `classes` but adds nothing to
 * `calories` — the core constraint, verified in tests.
 */
export function periodTotals(
  logs: StatLog[],
  period: StatsPeriod,
  today: string,
): { classes: number; calories: number } {
  let classes = 0;
  let calories = 0;
  for (const log of logs) {
    if (!inPeriod(log.date, period, today)) continue;
    classes++;
    const mid = midpoint(fromColumns(log));
    if (mid !== null) calories += mid;
  }
  return { classes, calories };
}

/**
 * Per-week buckets over ALL given logs, ascending by week — the series behind
 * the Calories-over-time and classes-per-week charts. Weeks with no attended
 * log are simply absent (a sparse series); the UI may window the tail.
 */
export function weeklySeries(logs: StatLog[]): WeekBucket[] {
  const byWeek = new Map<string, WeekBucket>();
  for (const log of logs) {
    const week = weekStart(log.date);
    const bucket = byWeek.get(week) ?? { week, classes: 0, calories: 0 };
    bucket.classes++;
    const mid = midpoint(fromColumns(log));
    if (mid !== null) bucket.calories += mid;
    byWeek.set(week, bucket);
  }
  return [...byWeek.values()].sort((a, b) => a.week.localeCompare(b.week));
}

/**
 * The current consistency streak: the number of consecutive Mon–Sun weeks,
 * ending at the current week, in which the User attended at least one class.
 *
 * Definition (chosen to be unambiguous and testable):
 * - An "active" week has ≥1 attended log.
 * - The streak anchors at the CURRENT week if it is active; otherwise it anchors
 *   at LAST week if that is active. This one-week grace stops a fresh, still-
 *   empty week from instantly zeroing a long run mid-Monday.
 * - From the anchor we step back one week at a time, counting consecutive active
 *   weeks, and stop at the first gap.
 * - If neither the current nor the previous week is active, the streak is 0.
 *
 * `today` is the Vilnius civil date, so the week grid follows Vilnius.
 */
export function currentStreak(logs: StatLog[], today: string): number {
  const active = new Set(logs.map((l) => weekStart(l.date)));
  const thisWeek = weekStart(today);
  const lastWeek = addDays(thisWeek, -7);

  let anchor: string;
  if (active.has(thisWeek)) anchor = thisWeek;
  else if (active.has(lastWeek)) anchor = lastWeek;
  else return 0;

  let streak = 0;
  for (let w = anchor; active.has(w); w = addDays(w, -7)) streak++;
  return streak;
}

/**
 * The most-attended class types, count descending, with className ascending as
 * a stable tiebreak so equal counts order deterministically. Capped at `limit`.
 */
export function topClassTypes(logs: StatLog[], limit = 5): ClassTypeCount[] {
  const counts = new Map<string, number>();
  for (const log of logs) {
    counts.set(log.className, (counts.get(log.className) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([className, count]) => ({ className, count }))
    .sort((a, b) => b.count - a.count || a.className.localeCompare(b.className))
    .slice(0, limit);
}
