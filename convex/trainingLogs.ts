import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { fromColumns, requirePair, toColumns } from "./calories";
import { requireUserId } from "./users";

/**
 * Training log CRUD + history (issue 09): a User records a class they did and
 * reviews their history. A MANUAL log sets `attended: true` and carries NO
 * `bookingId`; a booking-sourced log is instead created by the Attendance
 * conversion (system context, see `attendance.ts`), and {@link setAttended}
 * flips that log's `attended` flag from here.
 *
 * Every entry point in THIS module resolves the caller server-side (NEVER
 * trusts a client userId) and scopes strictly to that User, so one User can
 * neither see nor alter another's logs — mirroring the AutoBook-rule ownership
 * pattern. The lone system-context entry point that trusts a Booking's own
 * `userId` — the Attendance conversion — lives in `attendance.ts`, not here.
 */

/** Cap on the history read: bounded per the Convex query guidelines rather than
 * an unbounded `.collect()`, since a User's logs accrue without limit. */
const HISTORY_LIMIT = 200;

/**
 * Load a log and assert the caller owns it. Returns the log, or throws
 * "Log not found" for a missing log OR one owned by another User — the same
 * message either way, so a caller can't probe for logs that aren't theirs. The
 * owner-only guard behind {@link editLog} and {@link deleteLog}.
 */
async function requireOwnedLog(
  ctx: MutationCtx,
  logId: Id<"trainingLogs">,
): Promise<Doc<"trainingLogs">> {
  const userId = await requireUserId(ctx);
  const log = await ctx.db.get("trainingLogs", logId);
  if (log === null || log.userId !== userId) {
    throw new Error("Log not found");
  }
  return log;
}

/**
 * The class-derived fields of a Training log, built from a canonical `classes`
 * row — the ONE shape written by both the manual {@link addFromClass} and the
 * system-context Attendance conversion (`attendance.ts`). Copies name, date,
 * intensity, and Calories from the class, marks `attended: true`, and links the
 * originating `bookingId` when one produced the log.
 *
 * Calories use the TRUSTED tier ({@link fromColumns}): cached class data is
 * never user input, so a should-never-happen lone bound coerces to null instead
 * of throwing — the tier the conversion has always used, now shared so the
 * manual path can no longer reject a class the cache itself stored.
 */
export function trainingLogFromClass(
  cls: Pick<Doc<"classes">, "name" | "date" | "intensity" | "kcalMin" | "kcalMax">,
  opts: { userId: Id<"users">; bookingId?: Id<"bookings"> },
) {
  return {
    userId: opts.userId,
    className: cls.name,
    date: cls.date,
    intensity: cls.intensity,
    ...toColumns(fromColumns(cls)),
    attended: true,
    ...(opts.bookingId !== undefined ? { bookingId: opts.bookingId } : {}),
  };
}

/**
 * Add a Training log by picking a current-week class. Name, date, intensity and
 * Calories are taken from the CANONICAL cached class (`classes`) — never from
 * client-supplied fields — so the log always reflects the real schedule. A
 * manual log: `attended: true`, no `bookingId`. Returns the new log id.
 */
export const addFromClass = mutation({
  args: { pid: v.string(), date: v.string() },
  handler: async (ctx, { pid, date }): Promise<Id<"trainingLogs">> => {
    const userId = await requireUserId(ctx);

    const cls = await ctx.db
      .query("classes")
      .withIndex("by_pid_and_date", (q) => q.eq("pid", pid).eq("date", date))
      .unique();
    if (cls === null) {
      throw new Error("That class is not in this week's schedule.");
    }

    return await ctx.db.insert(
      "trainingLogs",
      trainingLogFromClass(cls, { userId }),
    );
  },
});

/**
 * Add a Training log by typing the details of a class no longer published (a
 * past week). Name and date are required; Calories are OPTIONAL — a class with
 * no published Calories is still loggable (left blank). Intensity defaults to 0
 * (unknown). A manual log: `attended: true`, no `bookingId`. Returns the id.
 */
export const addManual = mutation({
  args: {
    className: v.string(),
    date: v.string(),
    intensity: v.optional(v.number()),
    kcalMin: v.optional(v.number()),
    kcalMax: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { className, date, intensity, kcalMin, kcalMax },
  ): Promise<Id<"trainingLogs">> => {
    const userId = await requireUserId(ctx);

    const name = className.trim();
    if (name === "" || date === "") {
      throw new Error("A class name and date are required.");
    }

    return await ctx.db.insert("trainingLogs", {
      userId,
      className: name,
      date,
      intensity: intensity ?? 0,
      ...toColumns(requirePair(kcalMin, kcalMax)),
      attended: true,
    });
  },
});

/**
 * Edit one of the caller's own logs. Owner-only: a User cannot edit another's
 * log. Replaces the editable fields (name, date, intensity, Calories) while
 * preserving `attended` and any `bookingId` — attendance/linkage is the issue-10
 * path's concern, not a details edit. Leaving Calories blank clears them.
 */
export const editLog = mutation({
  args: {
    logId: v.id("trainingLogs"),
    className: v.string(),
    date: v.string(),
    intensity: v.optional(v.number()),
    kcalMin: v.optional(v.number()),
    kcalMax: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { logId, className, date, intensity, kcalMin, kcalMax },
  ): Promise<null> => {
    const log = await requireOwnedLog(ctx, logId);

    const name = className.trim();
    if (name === "" || date === "") {
      throw new Error("A class name and date are required.");
    }

    await ctx.db.replace("trainingLogs", log._id, {
      userId: log.userId,
      className: name,
      date,
      intensity: intensity ?? log.intensity,
      ...toColumns(requirePair(kcalMin, kcalMax)),
      attended: log.attended,
      ...(log.bookingId !== undefined ? { bookingId: log.bookingId } : {}),
    });
    return null;
  },
});

/**
 * Delete one of the caller's own logs. Owner-only: a User cannot delete
 * another's log.
 */
export const deleteLog = mutation({
  args: { logId: v.id("trainingLogs") },
  handler: async (ctx, { logId }): Promise<null> => {
    const log = await requireOwnedLog(ctx, logId);
    await ctx.db.delete("trainingLogs", log._id);
    return null;
  },
});

/**
 * Toggle attendance on a booking-sourced log — the "didn't go" control. The
 * conversion cron marks a completed Booking `attended: true`, but a User may
 * have booked and not shown up; flipping `attended` to `false` (and back)
 * excludes the class from later statistics WITHOUT deleting the record. Owner-
 * only via {@link requireOwnedLog}.
 *
 * Restricted to booking-sourced logs (`bookingId` present): a MANUAL log exists
 * only because the User typed a class they attended, so there is nothing to
 * mark as missed — delete it instead. Idempotent: setting the current value is
 * a harmless no-op.
 */
export const setAttended = mutation({
  args: { logId: v.id("trainingLogs"), attended: v.boolean() },
  handler: async (ctx, { logId, attended }): Promise<null> => {
    const log = await requireOwnedLog(ctx, logId);
    if (log.bookingId === undefined) {
      throw new Error("Only a booked class can be marked as not attended.");
    }
    await ctx.db.patch("trainingLogs", log._id, { attended });
    return null;
  },
});

/**
 * The calling User's Training logs (history), newest class date first. Scoped
 * to the caller via `by_user_and_date` — never returns another User's logs.
 */
export const listMine = query({
  args: {},
  handler: async (ctx): Promise<Doc<"trainingLogs">[]> => {
    const userId = await requireUserId(ctx);
    return await ctx.db
      .query("trainingLogs")
      .withIndex("by_user_and_date", (q) => q.eq("userId", userId))
      .order("desc")
      .take(HISTORY_LIMIT);
  },
});
