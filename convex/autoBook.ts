import { type Infer, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import type { PoolDetails } from "./poolDetails";
import { requireUserId } from "./users";
import { classStatus, isoWeekday, tomorrowDate } from "./week";

/**
 * The day-before AutoBook cron and its supporting reads/writes (issue 08).
 *
 * The booking itself runs through the gateway in the Node-runtime
 * `autoBookAttempt.attemptRule` action (an action cannot touch the DB and the
 * gateway flow mirrors `bookNow`); this default-runtime module holds the cron
 * entry, the transactional rule→class resolution it depends on, and the per-rule
 * run-log persistence + read. Disabling/deleting a rule only stops FUTURE
 * bookings; it never cancels a Booking already placed (ADR-0001).
 */

/**
 * The outcome of one AutoBook attempt for a rule. Extends the pool's booking
 * vocabulary (`registered|already|full|error`) with the two outcomes the cron
 * itself produces before ever reaching the pool: `no_match` (no single class
 * matched tomorrow) and `no_details` (the owner's Pool details are incomplete).
 * The runtime twin of the `ruleRuns.outcome` union in `schema.ts`.
 */
export const attemptOutcomeValidator = v.union(
  v.literal("registered"),
  v.literal("already"),
  v.literal("full"),
  v.literal("error"),
  v.literal("no_match"),
  v.literal("no_details"),
);

export type AttemptOutcome = Infer<typeof attemptOutcomeValidator>;

/**
 * What {@link ruleContext} tells the attempt action to do, resolved in a single
 * transaction so the action makes one query before deciding:
 * - `cancelled` — the rule was deleted or disabled since it was scheduled; do
 *   nothing (not even a run-log entry — there is no live rule to log against).
 * - `no_details` — the owner's Pool details are incomplete; cannot book.
 * - `no_match` — zero or 2+ classes match tomorrow; never guess, book nothing.
 * - `already_booked` — a terminal Booking already exists for this class
 *   (a prior attempt won); stop so overlapping retries cannot double-book.
 * - `started` — the single match's start time has already passed; give up.
 * - `ready` — exactly one upcoming match with complete details; book it.
 */
export type RuleContextResult =
  | { kind: "cancelled" }
  | { kind: "no_details"; userId: Id<"users"> }
  | { kind: "no_match"; userId: Id<"users"> }
  | { kind: "already_booked"; userId: Id<"users"> }
  | { kind: "started"; userId: Id<"users"> }
  | {
      kind: "ready";
      userId: Id<"users">;
      pid: string;
      poolDetails: PoolDetails;
    };

/**
 * The day-before cron entry. For TOMORROW's date (Europe/Vilnius) it finds every
 * ENABLED rule whose weekday matches tomorrow's ISO weekday and schedules one
 * {@link internal.autoBookAttempt.attemptRule} per rule (each owns its own
 * retries, so one failing rule never blocks another). `now` is injectable for
 * tests; the cron passes nothing and uses the real clock.
 */
export const runDayBefore = internalMutation({
  args: { now: v.optional(v.number()) },
  handler: async (
    ctx,
    { now },
  ): Promise<{ date: string; weekday: number; scheduled: number }> => {
    const date = tomorrowDate(now !== undefined ? new Date(now) : new Date());
    const weekday = isoWeekday(date);

    const rules = await ctx.db
      .query("autoBookRules")
      .withIndex("by_weekday", (q) => q.eq("weekday", weekday))
      .collect();

    let scheduled = 0;
    for (const rule of rules) {
      if (!rule.enabled) continue;
      await ctx.scheduler.runAfter(
        0,
        internal.autoBookAttempt.attemptRule,
        { ruleId: rule._id, date, attempt: 1 },
      );
      scheduled++;
    }
    return { date, weekday, scheduled };
  },
});

/**
 * Resolve a rule to a verdict for `date`, in one transaction. Reads the rule's
 * OWNER directly from `users` (the cron has no auth identity — it is system
 * context — so it must NOT use `getAuthUserId`); requires complete Pool details;
 * resolves the SINGLE open class by exact `startTime` + `nameMatch`; refuses to
 * guess when 0 or 2+ match; blocks if a terminal Booking already exists; and
 * gives up once the class has started. `now` is injectable for tests.
 */
export const ruleContext = internalQuery({
  args: {
    ruleId: v.id("autoBookRules"),
    date: v.string(),
    now: v.optional(v.number()),
  },
  handler: async (ctx, { ruleId, date, now }): Promise<RuleContextResult> => {
    const rule = await ctx.db.get("autoBookRules", ruleId);
    if (!rule || !rule.enabled) return { kind: "cancelled" };
    const userId = rule.userId;

    const owner = await ctx.db.get("users", userId);
    if (!owner?.detailsComplete || !owner.poolDetails) {
      return { kind: "no_details", userId };
    }

    // Exactly one open class must match (startTime + exact name). 0 or 2+ → do
    // not guess: a wrong booking is worse than no booking.
    const dayClasses = await ctx.db
      .query("classes")
      .withIndex("by_date", (q) => q.eq("date", date))
      .collect();
    const matches = dayClasses.filter(
      (c) => c.startTime === rule.startTime && c.name === rule.nameMatch,
    );
    if (matches.length !== 1) return { kind: "no_match", userId };
    const cls = matches[0];

    // Dedupe: if a prior attempt already secured (or definitively closed) this
    // class, stop — a leftover retry must never place a second Booking. An
    // `error` row is a failed attempt, so it does not block a fresh try.
    const existing = await ctx.db
      .query("bookings")
      .withIndex("by_user_and_pid_and_date", (q) =>
        q.eq("userId", userId).eq("pid", cls.pid).eq("date", date),
      )
      .unique();
    if (existing && existing.status !== "error") {
      return { kind: "already_booked", userId };
    }

    // Stop once the start time has passed (issue 08 retry-stop). For tomorrow's
    // class at fire time this is always `upcoming`; it only bites on a late retry.
    const { status } = classStatus(
      cls,
      now !== undefined ? new Date(now) : new Date(),
    );
    if (status !== "upcoming") return { kind: "started", userId };

    return { kind: "ready", userId, pid: cls.pid, poolDetails: owner.poolDetails };
  },
});

/**
 * Append one entry to a rule's run log. The cron writes exactly one per attempt
 * — including the no-booking outcomes (`no_match`, `no_details`, terminal
 * `error`) that a Booking row cannot carry. `bookingId` links the entry to the
 * Booking when the attempt produced one.
 */
export const recordRuleRun = internalMutation({
  args: {
    ruleId: v.id("autoBookRules"),
    userId: v.id("users"),
    date: v.string(),
    outcome: attemptOutcomeValidator,
    message: v.string(),
    bookingId: v.optional(v.id("bookings")),
  },
  handler: async (
    ctx,
    { ruleId, userId, date, outcome, message, bookingId },
  ): Promise<null> => {
    await ctx.db.insert("ruleRuns", {
      ruleId,
      userId,
      date,
      at: Date.now(),
      outcome,
      message,
      ...(bookingId ? { bookingId } : {}),
    });
    return null;
  },
});

/**
 * The caller's recent run-log entries for one of THEIR rules (newest first),
 * for the per-rule history shown in the rules list. Owner-scoped: returns an
 * empty list for a rule the caller does not own, so it can never leak another
 * User's run log.
 */
export const recentRuns = query({
  args: { ruleId: v.id("autoBookRules") },
  handler: async (ctx, { ruleId }): Promise<Doc<"ruleRuns">[]> => {
    const userId = await requireUserId(ctx);
    const rule = await ctx.db.get("autoBookRules", ruleId);
    if (!rule || rule.userId !== userId) return [];
    return await ctx.db
      .query("ruleRuns")
      .withIndex("by_ruleId", (q) => q.eq("ruleId", ruleId))
      .order("desc")
      .take(5);
  },
});
