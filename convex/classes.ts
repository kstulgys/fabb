import { type Infer, v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { caloriesColumns } from "./calories";
import { requireUserId } from "./users";
import { WEEKDAY_LABELS, resolveClock, weekDatesFor, weekStartsFor } from "./week";

/**
 * One scraped class row. Calories/duration are optional because the pool omits
 * them on some classes (see `pool/parse.ts`); an omitted field means "absent".
 */
export const classRecord = v.object({
  date: v.string(),
  startTime: v.string(),
  endTime: v.string(),
  pid: v.string(),
  name: v.string(),
  intensity: v.number(),
  ...caloriesColumns,
  durationMin: v.optional(v.number()),
});

/** A single scraped class as written to the cache (the scrape action builds
 * these and hands them to {@link reconcileWeek}). */
export type ClassRecord = Infer<typeof classRecord>;

/**
 * Reconcile one successfully-fetched week against its fresh scrape, in a single
 * transaction: upsert every scraped row in place (keyed by `(pid, date)`, so a
 * changed class refreshes and a re-run never duplicates), then delete the cached
 * rows in `[weekStart, weekEnd]` that VANISHED from the scrape — but only those
 * with `date > today` (Europe/Vilnius).
 *
 * Two invariants keep the delete safe (ADR-0006):
 *  1. A finished/today class (`date <= today`) is NEVER deleted: the attendance
 *     conversion (`attendance.convertCompletedBookings`) reads the cached class
 *     row to build the Training log, so dropping a finished-but-unconverted
 *     class would silently lose attendance.
 *  2. The caller (`pool/scrape.ts`) invokes this only for a week whose schedule
 *     fetched successfully, so an empty/failed fetch is never mistaken for "all
 *     cancelled" and a week's rows are never wiped on a fetch error.
 *
 * Internal: only the scrape action (and the daily cron behind it) calls this.
 */
export const reconcileWeek = internalMutation({
  args: {
    classes: v.array(classRecord),
    weekStart: v.string(),
    weekEnd: v.string(),
    today: v.string(),
  },
  handler: async (ctx, { classes, weekStart, weekEnd, today }) => {
    // 1. Upsert every scraped row in place — a changed class refreshes here.
    for (const row of classes) {
      const existing = await ctx.db
        .query("classes")
        .withIndex("by_pid_and_date", (q) =>
          q.eq("pid", row.pid).eq("date", row.date),
        )
        .unique();
      if (existing) {
        await ctx.db.replace("classes", existing._id, row);
      } else {
        await ctx.db.insert("classes", row);
      }
    }

    // 2. Delete the week's vanished FUTURE classes: a cached row in range that
    //    is absent from the fresh scrape AND strictly after today. Finished and
    //    today rows (`date <= today`) are preserved — the attendance guard
    //    (invariant 1).
    const scraped = new Set(classes.map((row) => `${row.pid}\u0000${row.date}`));
    const cached = await ctx.db
      .query("classes")
      .withIndex("by_date", (q) =>
        q.gte("date", weekStart).lte("date", weekEnd),
      )
      .collect();

    let deleted = 0;
    for (const row of cached) {
      if (row.date <= today) continue; // never delete finished/today
      if (scraped.has(`${row.pid}\u0000${row.date}`)) continue; // still offered
      await ctx.db.delete("classes", row._id);
      deleted += 1;
    }

    return { upserted: classes.length, deleted };
  },
});

/** One day of the week schedule: its Monday-first weekday label, ISO date, and
 * the day's classes sorted by start time. */
export interface ClassDay {
  weekday: string;
  date: string;
  classes: Doc<"classes">[];
}

/** The current Mon–Sun week of classes returned by {@link weekClasses}. */
export interface WeekClasses {
  weekStart: string;
  weekEnd: string;
  days: ClassDay[];
}

/**
 * Group class rows into a Mon→Sun week. `dates` is the week's seven ISO dates
 * (Monday first, as {@link weekDatesFor} returns); each day collects the rows
 * whose `date` matches and sorts them by start time. Pure, so both
 * {@link weekClasses} and {@link scheduleWeeks} build their days through it and
 * the grouping/ordering stays identical.
 */
export function groupWeek(rows: Doc<"classes">[], dates: string[]): WeekClasses {
  const days = dates.map((date, i) => ({
    weekday: WEEKDAY_LABELS[i],
    date,
    classes: rows
      .filter((row) => row.date === date)
      .sort((a, b) => a.startTime.localeCompare(b.startTime)),
  }));
  return { weekStart: dates[0], weekEnd: dates[6], days };
}

/**
 * The current Mon–Sun week's classes (Europe/Vilnius), grouped by day in
 * Monday-first order. `classes` is shared reference data that every User reads
 * (ADR-0002), so `requireUserId` here is purely an auth gate — it throws for
 * signed-out callers but does not partition the data per User.
 */
export const weekClasses = query({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, { now }): Promise<WeekClasses> => {
    await requireUserId(ctx);

    const dates = weekDatesFor(resolveClock(now));
    const rows = await ctx.db
      .query("classes")
      .withIndex("by_date", (q) =>
        q.gte("date", dates[0]).lte("date", dates[6]),
      )
      .collect();

    return groupWeek(rows, dates);
  },
});

/**
 * The whole Schedule window — the current Mon–Sun week then the next — each
 * grouped like {@link weekClasses} (ADR-0006: the scrape caches both weeks). The
 * two Monday starts come from {@link weekStartsFor}; each is expanded to its
 * seven dates, the 14-day range is read from `by_date` once, and
 * {@link groupWeek} slices it into the two weeks. Same auth gate as
 * {@link weekClasses}: `classes` is shared reference data (ADR-0002), so
 * `requireUserId` only rejects signed-out callers.
 */
export const scheduleWeeks = query({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, { now }): Promise<{ weeks: WeekClasses[] }> => {
    await requireUserId(ctx);

    const weekDates = weekStartsFor(resolveClock(now), 2).map((monday) =>
      weekDatesFor(new Date(`${monday}T12:00:00Z`)),
    );
    const windowStart = weekDates[0][0];
    const windowEnd = weekDates[weekDates.length - 1][6];

    const rows = await ctx.db
      .query("classes")
      .withIndex("by_date", (q) =>
        q.gte("date", windowStart).lte("date", windowEnd),
      )
      .collect();

    return { weeks: weekDates.map((dates) => groupWeek(rows, dates)) };
  },
});
