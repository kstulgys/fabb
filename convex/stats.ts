import { v } from "convex/values";
import { query } from "./_generated/server";
import {
  type ClassTypeCount,
  type StatsPeriod,
  type WeekBucket,
  currentStreak,
  periodTotals,
  topClassTypes,
  weeklySeries,
} from "./statsHelpers";
import { requireUserId } from "./users";
import { todayDate } from "./week";

/**
 * Stats dashboard aggregation (issue 11): the calling User's progress over
 * their ATTENDED Training logs. Owner-scoped via {@link requireUserId} + the
 * `by_user_and_date` index, so one User's stats never include another's logs.
 *
 * All math lives in the pure, unit-tested `statsHelpers` module; this query is
 * the thin Convex seam that reads the rows, drops the `attended: false` ones
 * (the "didn't go" toggle from issue 10), resolves "today" in Europe/Vilnius,
 * and delegates.
 */

/**
 * Cap on the aggregation read. Stats want every attended log (all-time streak
 * and top types), but the Convex guidelines forbid an unbounded `.collect()`,
 * so we bound generously: ≈260 classes/year at 5×/week means this covers years
 * of logging. Read newest-first so that, in the unlikely event the cap is hit,
 * the most recent logs — those that drive the current period and streak —
 * survive.
 */
const STATS_LIMIT = 2000;

/** How many trailing weekly buckets the charts render — a readable window onto
 * the Calories-over-time / classes-per-week series without unbounding the
 * payload. Streak is computed over ALL weeks, so windowing here is presentation
 * only and never shortens the streak. */
const WEEKLY_WINDOW = 12;

/** Validator + type for the period toggle, shared so the client and server
 * agree on the three allowed values. */
export const periodValidator = v.union(
  v.literal("week"),
  v.literal("month"),
  v.literal("all"),
);

/** The whole dashboard payload, returned by {@link summary}. */
export interface StatsSummary {
  period: StatsPeriod;
  totals: { classes: number; calories: number };
  weekly: WeekBucket[];
  streak: number;
  topTypes: ClassTypeCount[];
}

export const summary = query({
  // `now` (epoch ms) is an optional test seam mirroring `convertCompletedBookings`
  // and `autoBook`; production callers omit it and the server clock is used.
  args: { period: periodValidator, now: v.optional(v.number()) },
  handler: async (ctx, { period, now }): Promise<StatsSummary> => {
    const userId = await requireUserId(ctx);

    const rows = await ctx.db
      .query("trainingLogs")
      .withIndex("by_user_and_date", (q) => q.eq("userId", userId))
      .order("desc")
      .take(STATS_LIMIT);
    const attended = rows.filter((row) => row.attended);

    const today = todayDate(now !== undefined ? new Date(now) : new Date());

    return {
      period,
      totals: periodTotals(attended, period, today),
      weekly: weeklySeries(attended).slice(-WEEKLY_WINDOW),
      streak: currentStreak(attended, today),
      topTypes: topClassTypes(attended),
    };
  },
});
