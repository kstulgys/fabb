import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./users";

/**
 * Training log CRUD + history (issue 09): a User records a class they did and
 * reviews their history. A MANUAL log — the only kind this slice creates — sets
 * `attended: true` and carries NO `bookingId`; the booking-sourced path (issue
 * 10) is what links a log to a Booking and toggles attendance.
 *
 * Every entry point resolves the caller server-side (NEVER trusts a client
 * userId) and scopes strictly to that User, so one User can neither see nor
 * alter another's logs — mirroring the AutoBook-rule ownership pattern.
 */

/** Cap on the history read: bounded per the Convex query guidelines rather than
 * an unbounded `.collect()`, since a User's logs accrue without limit. */
const HISTORY_LIMIT = 200;

/**
 * Validate Calories as an all-or-nothing RANGE: a pool calorie figure is a
 * `(kcalMin, kcalMax)` pair (see constraints), so a lone bound is meaningless
 * and would corrupt the midpoint a later slice averages. Returns the pair to
 * spread into a log (both fields, or neither when Calories are left blank).
 */
function caloriePair(
  kcalMin: number | undefined,
  kcalMax: number | undefined,
): { kcalMin?: number; kcalMax?: number } {
  const hasMin = kcalMin !== undefined;
  const hasMax = kcalMax !== undefined;
  if (hasMin !== hasMax) {
    throw new Error(
      "Enter both a minimum and maximum calorie figure, or leave both blank.",
    );
  }
  return hasMin ? { kcalMin, kcalMax } : {};
}

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

    return await ctx.db.insert("trainingLogs", {
      userId,
      className: cls.name,
      date: cls.date,
      intensity: cls.intensity,
      ...caloriePair(cls.kcalMin, cls.kcalMax),
      attended: true,
    });
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
      ...caloriePair(kcalMin, kcalMax),
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
      ...caloriePair(kcalMin, kcalMax),
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
