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
 * these and hands them to {@link upsertClasses}). */
export type ClassRecord = Infer<typeof classRecord>;

/**
 * Upsert scraped classes into the shared cache, keyed by `(pid, date)` so
 * re-running the scrape refreshes rows in place and never creates duplicates.
 * Internal: only the scrape action (and later, the cron) calls this.
 */
export const upsertClasses = internalMutation({
  args: { classes: v.array(classRecord) },
  handler: async (ctx, { classes }) => {
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
    return { upserted: classes.length };
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
