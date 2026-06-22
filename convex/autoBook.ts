import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { autoBookable } from "./bookingDecision";
import { type AttemptOutcome, attemptOutcomeValidator, isTerminal } from "./bookingStatus";
import { hasCompleteDetails, type PoolDetails } from "./poolDetails";
import { requireUserId } from "./users";
import { isoWeekday, resolveClock, tomorrowDate } from "./week";

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

/** Run-log messages for the AutoBook verdicts that book NOTHING — paired with
 * their outcome by {@link planAttempt}. (The booking verdicts' messages live in
 * `OUTCOME_MESSAGE` in `book.ts`, keyed by the pool's response.) */
const NO_MATCH_MESSAGE =
  "No single matching class for tomorrow — nothing booked.";
const NO_DETAILS_MESSAGE =
  "Pool details incomplete — cannot book until they are filled in.";
const ALREADY_BOOKED_MESSAGE =
  "Already booked for this class — no second attempt.";
const STARTED_MESSAGE = "Class already started — gave up.";

/**
 * What the attempt action does with a resolved {@link RuleContextResult}: `skip`
 * it (the rule is gone — nothing to log against), `log` a terminal non-booking
 * outcome, or `book` the resolved class. Only `book` contacts the pool; its
 * status, message, and retry are decided AFTER the booking (an effect). Every
 * decision that does NOT touch the pool is concentrated here.
 */
export type AttemptPlan =
  | { action: "skip" }
  | {
      action: "log";
      userId: Id<"users">;
      outcome: AttemptOutcome;
      message: string;
    }
  | {
      action: "book";
      userId: Id<"users">;
      pid: string;
      poolDetails: PoolDetails;
    };

/**
 * Interpret a verdict into an {@link AttemptPlan} — the decision table that used
 * to be smeared across `attemptRule`'s switch and the message constants. The
 * five non-booking verdicts each map to a fixed outcome + run-log message and
 * never retry; `ready` becomes the one `book` plan. Pure: no booking, no DB.
 */
export function planAttempt(verdict: RuleContextResult): AttemptPlan {
  switch (verdict.kind) {
    case "cancelled":
      return { action: "skip" };
    case "no_details":
      return {
        action: "log",
        userId: verdict.userId,
        outcome: "no_details",
        message: NO_DETAILS_MESSAGE,
      };
    case "no_match":
      return {
        action: "log",
        userId: verdict.userId,
        outcome: "no_match",
        message: NO_MATCH_MESSAGE,
      };
    case "already_booked":
      return {
        action: "log",
        userId: verdict.userId,
        outcome: "already",
        message: ALREADY_BOOKED_MESSAGE,
      };
    case "started":
      return {
        action: "log",
        userId: verdict.userId,
        outcome: "error",
        message: STARTED_MESSAGE,
      };
    case "ready":
      return {
        action: "book",
        userId: verdict.userId,
        pid: verdict.pid,
        poolDetails: verdict.poolDetails,
      };
  }
}

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
    const date = tomorrowDate(resolveClock(now));
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
 * resolves the class by the rule's `pid` (the pool's per-slot id) — a missing pid
 * or one not offered on `date` is `no_match` (no name/time fallback); blocks if a
 * terminal Booking already exists; and
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
    if (!hasCompleteDetails(owner)) {
      return { kind: "no_details", userId };
    }

    // Resolve the exact class by the rule's pid (the pool's stable per-slot id;
    // identity is (pid, date)). No name/time fallback: a rule with no pid, or a
    // pid not offered on `date`, books nothing (no_match) rather than guess.
    if (rule.pid === undefined) return { kind: "no_match", userId };
    const rulePid = rule.pid;
    const cls = await ctx.db
      .query("classes")
      .withIndex("by_pid_and_date", (q) =>
        q.eq("pid", rulePid).eq("date", date),
      )
      .unique();
    if (cls === null) return { kind: "no_match", userId };

    // Dedupe: if a prior attempt already secured (or definitively closed) this
    // class, stop — a leftover retry must never place a second Booking. An
    // `error` row is a failed attempt, so it does not block a fresh try.
    const existing = await ctx.db
      .query("bookings")
      .withIndex("by_user_and_pid_and_date", (q) =>
        q.eq("userId", userId).eq("pid", cls.pid).eq("date", date),
      )
      .unique();
    if (existing && isTerminal(existing.status)) {
      return { kind: "already_booked", userId };
    }

    // Stop once the start time has passed (issue 08 retry-stop). For tomorrow's
    // class at fire time this is always `upcoming`; it only bites on a late retry.
    const at = resolveClock(now);
    if (!autoBookable(cls, at)) return { kind: "started", userId };

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
