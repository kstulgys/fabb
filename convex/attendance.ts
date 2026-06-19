import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { isHeld } from "./bookingStatus";
import { trainingLogFromClass } from "./trainingLogs";
import { classStatus, resolveClock, weekDatesFor } from "./week";

/**
 * Attendance conversion (issue 10): the SYSTEM-context step that turns a held
 * Booking — status `registered` or `already` — into a Training log once its
 * class has finished, marking it `attended: true` and copying the class's name,
 * intensity, and Calories (the "Attendance conversion" term in `CONTEXT.md`).
 *
 * Unlike the owner-scoped CRUD in `trainingLogs.ts`, this runs from the hourly
 * cron with NO caller identity, so it trusts each Booking's own `userId` rather
 * than resolving a caller. IDEMPOTENT: it dedupes on `by_bookingId`, producing
 * exactly one Training log per Booking, ever — the hourly cadence affects only
 * promptness, never correctness. Bounded to the current Mon–Sun week
 * (Europe/Vilnius), the pool cache window.
 */

/**
 * Auto-convert completed Bookings into Training logs (issue 10). Runs in SYSTEM
 * context from the hourly cron (no auth identity), so it trusts each Booking's
 * own `userId` rather than resolving a caller.
 *
 * For the current Mon–Sun week (Europe/Vilnius) it walks every cached class
 * whose end time has passed (`classStatus(...).status === "finished"`) and, for
 * each Booking on that class instance, creates exactly ONE Training log when the
 * Booking is a HELD spot — status `registered` or `already`. A `full`/`error`
 * Booking is not attendance and yields no log. The log copies name, intensity
 * and Calories from the cached class (Calories may be null), and is marked
 * `attended: true` with its originating `bookingId`. Works for any Booking
 * source (`rule` or `now`).
 *
 * IDEMPOTENT: before inserting it checks `by_bookingId`, so a Booking already
 * converted is skipped and a re-run creates nothing new. Bounded by reading
 * only the current week's classes (the cache window, mirroring `weekClasses`);
 * the hourly cadence converts each class within its week-in-cache. `now` is
 * injectable for tests; the cron passes nothing and uses the real clock.
 */
export const convertCompletedBookings = internalMutation({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, { now }): Promise<{ converted: number }> => {
    const at = resolveClock(now);
    const dates = weekDatesFor(at);
    const weekStart = dates[0];
    const weekEnd = dates[6];

    const classes = await ctx.db
      .query("classes")
      .withIndex("by_date", (q) =>
        q.gte("date", weekStart).lte("date", weekEnd),
      )
      .collect();

    let converted = 0;
    for (const cls of classes) {
      if (classStatus(cls, at).status !== "finished") continue;

      const bookings = await ctx.db
        .query("bookings")
        .withIndex("by_pid_and_date", (q) =>
          q.eq("pid", cls.pid).eq("date", cls.date),
        )
        .collect();

      for (const booking of bookings) {
        // Only a held spot is attendance; a full/error Booking never logs.
        if (!isHeld(booking.status)) {
          continue;
        }
        // One log per Booking, ever — the dedupe that makes re-runs no-ops.
        const existing = await ctx.db
          .query("trainingLogs")
          .withIndex("by_bookingId", (q) => q.eq("bookingId", booking._id))
          .unique();
        if (existing) continue;

        await ctx.db.insert(
          "trainingLogs",
          trainingLogFromClass(cls, {
            userId: booking.userId,
            bookingId: booking._id,
          }),
        );
        converted++;
      }
    }
    return { converted };
  },
});
