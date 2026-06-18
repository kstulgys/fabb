import { type Infer, v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { requireUserId } from "./users";
import { WEEKDAY_LABELS, weekDatesFor } from "./week";

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
  kcalMin: v.optional(v.number()),
  kcalMax: v.optional(v.number()),
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

/**
 * The current Mon–Sun week's classes (Europe/Vilnius), grouped by day in
 * Monday-first order. `classes` is shared reference data that every User reads
 * (ADR-0002), so `requireUserId` here is purely an auth gate — it throws for
 * signed-out callers but does not partition the data per User.
 */
export const weekClasses = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);

    const dates = weekDatesFor(new Date());
    const weekStart = dates[0];
    const weekEnd = dates[6];

    const rows = await ctx.db
      .query("classes")
      .withIndex("by_date", (q) =>
        q.gte("date", weekStart).lte("date", weekEnd),
      )
      .collect();

    // Group into the seven known dates. The key set is fixed and the data is a
    // single week, so a filter per day is simpler than a runtime Map.
    const days = dates.map((date, i) => ({
      weekday: WEEKDAY_LABELS[i],
      date,
      classes: rows
        .filter((row) => row.date === date)
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    }));

    return { weekStart, weekEnd, days };
  },
});
