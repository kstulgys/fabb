/**
 * Booking persistence + the class lookup the booking gate needs.
 *
 * The network booking itself lives in the Node-runtime `bookNow` action
 * (`book.ts`); an action cannot touch the database, so it reads the class and
 * writes the Booking row through these default-runtime functions. Both are
 * `internal` — only the trusted `bookNow` action calls them.
 */
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
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
 * Persist one "Book now" attempt: a `source: 'now'` Booking carrying the
 * gateway's status and a single run-log entry. Called only by the `bookNow`
 * action, which has already resolved and authorised the User, so `userId` is
 * passed in (this is an internal function, never exposed to clients).
 */
export const recordBooking = internalMutation({
  args: {
    userId: v.id("users"),
    pid: v.string(),
    date: v.string(),
    status: bookingStatusValidator,
    message: v.string(),
  },
  handler: async (ctx, { userId, pid, date, status, message }) => {
    return await ctx.db.insert("bookings", {
      userId,
      pid,
      date,
      source: "now",
      status,
      runLog: [{ at: Date.now(), outcome: status, message }],
    });
  },
});
