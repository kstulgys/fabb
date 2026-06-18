/**
 * Booking persistence + the class lookup the booking gate needs.
 *
 * The network booking itself lives in the Node-runtime `bookNow` action
 * (`book.ts`); an action cannot touch the database, so it reads the class and
 * writes the Booking row through these default-runtime functions. Both are
 * `internal` — only the trusted `bookNow` action calls them.
 */
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";

/** The pool's booking outcome vocabulary as a Convex validator (the runtime
 * twin of `BookingStatus` in `pool/parse.ts`; the `bookings` table inlines the
 * same union). */
export const bookingStatusValidator = v.union(
  v.literal("registered"),
  v.literal("already"),
  v.literal("full"),
  v.literal("error"),
);

/**
 * The cached class for `(pid, date)`, or `null` when this week's schedule has no
 * such class. `bookNow` reads it to decide whether the class is still bookable
 * (an action cannot reach the DB) before contacting the pool.
 */
export const classForBooking = internalQuery({
  args: { pid: v.string(), date: v.string() },
  handler: async (ctx, { pid, date }): Promise<Doc<"classes"> | null> => {
    return await ctx.db
      .query("classes")
      .withIndex("by_pid_and_date", (q) => q.eq("pid", pid).eq("date", date))
      .unique();
  },
});

/**
 * Persist one booking attempt: the single "write a Booking row" path shared by
 * the manual "Book now" action (`source: 'now'`) and the day-before AutoBook
 * cron (`source: 'rule'`, with `ruleId`). Both resolve and authorise the User
 * upstream — `userId` is trusted here because this is an internal function.
 *
 * Upserts on `(userId, pid, date)`: the first attempt inserts the row, later
 * attempts (the cron's retries) patch it — updating `status` and APPENDING to
 * `runLog` so one Booking accumulates its attempt history instead of spawning a
 * duplicate row per retry. Returns the Booking id so the caller can link a
 * `ruleRuns` entry to it.
 */
export const recordBooking = internalMutation({
  args: {
    userId: v.id("users"),
    pid: v.string(),
    date: v.string(),
    source: v.union(v.literal("rule"), v.literal("now")),
    ruleId: v.optional(v.id("autoBookRules")),
    status: bookingStatusValidator,
    message: v.string(),
  },
  handler: async (
    ctx,
    { userId, pid, date, source, ruleId, status, message },
  ): Promise<Id<"bookings">> => {
    const entry = { at: Date.now(), outcome: status, message };
    const existing = await ctx.db
      .query("bookings")
      .withIndex("by_user_and_pid_and_date", (q) =>
        q.eq("userId", userId).eq("pid", pid).eq("date", date),
      )
      .unique();
    if (existing) {
      await ctx.db.patch("bookings", existing._id, {
        status,
        runLog: [...existing.runLog, entry],
      });
      return existing._id;
    }
    return await ctx.db.insert("bookings", {
      userId,
      pid,
      date,
      source,
      ...(ruleId ? { ruleId } : {}),
      status,
      runLog: [entry],
    });
  },
});
