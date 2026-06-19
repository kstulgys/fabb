"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import type { RuleContextResult } from "./autoBook";
import { bookAndRecord, OUTCOME_MESSAGE } from "./book";
import type { AttemptOutcome } from "./bookingStatus";

/**
 * One day-before AutoBook attempt for a single rule, plus its retry (issue 08).
 *
 * Runs in the Node runtime because it submits the booking through the same
 * gateway flow as `bookNow` (carried over from the shared {@link bookAndRecord}
 * helper) — a fake in tests, NEVER the real network. The rule→class verdict is
 * resolved in one query ({@link internal.autoBook.ruleContext}); this action
 * only acts on it, writes the run-log entry, and schedules a retry when the
 * failure is transient.
 */

/**
 * Delay between retries of a transient failure. A NAMED CONSTANT because the
 * pool's booking-open window and the right cadence must be observed live — HITL
 * tunes this (and {@link MAX_RETRY_ATTEMPTS}) against the real pool.
 */
export const RETRY_BACKOFF_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Safety cap on retries per rule. The PRIMARY stop is the class start time
 * (re-checked by {@link internal.autoBook.ruleContext} on each attempt); this
 * just bounds a pathologically long booking-open window. HITL may tune it.
 */
export const MAX_RETRY_ATTEMPTS = 12;

const NO_MATCH_MESSAGE =
  "No single matching class for tomorrow — nothing booked.";
const NO_DETAILS_MESSAGE =
  "Pool details incomplete — cannot book until they are filled in.";
const ALREADY_BOOKED_MESSAGE =
  "Already booked for this class — no second attempt.";
const STARTED_MESSAGE = "Class already started — gave up.";

/** The result of an attempt, returned for observability and tests. `cancelled`
 * means the rule was gone/disabled by the time the attempt ran. */
export type AttemptResult = {
  outcome: AttemptOutcome | "cancelled";
  willRetry: boolean;
};

export const attemptRule = internalAction({
  args: {
    ruleId: v.id("autoBookRules"),
    date: v.string(),
    attempt: v.number(),
    now: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { ruleId, date, attempt, now },
  ): Promise<AttemptResult> => {
    const cx: RuleContextResult = await ctx.runQuery(
      internal.autoBook.ruleContext,
      { ruleId, date, now },
    );

    switch (cx.kind) {
      case "cancelled":
        // No live rule to log against — the User deleted/disabled it.
        return { outcome: "cancelled", willRetry: false };
      case "no_details":
        await ctx.runMutation(internal.autoBook.recordRuleRun, {
          ruleId,
          userId: cx.userId,
          date,
          outcome: "no_details",
          message: NO_DETAILS_MESSAGE,
        });
        return { outcome: "no_details", willRetry: false };
      case "no_match":
        await ctx.runMutation(internal.autoBook.recordRuleRun, {
          ruleId,
          userId: cx.userId,
          date,
          outcome: "no_match",
          message: NO_MATCH_MESSAGE,
        });
        return { outcome: "no_match", willRetry: false };
      case "already_booked":
        await ctx.runMutation(internal.autoBook.recordRuleRun, {
          ruleId,
          userId: cx.userId,
          date,
          outcome: "already",
          message: ALREADY_BOOKED_MESSAGE,
        });
        return { outcome: "already", willRetry: false };
      case "started":
        await ctx.runMutation(internal.autoBook.recordRuleRun, {
          ruleId,
          userId: cx.userId,
          date,
          outcome: "error",
          message: STARTED_MESSAGE,
        });
        return { outcome: "error", willRetry: false };
      case "ready": {
        const { status, bookingId } = await bookAndRecord(ctx, {
          userId: cx.userId,
          pid: cx.pid,
          date,
          poolDetails: cx.poolDetails,
          source: "rule",
          ruleId,
        });
        await ctx.runMutation(internal.autoBook.recordRuleRun, {
          ruleId,
          userId: cx.userId,
          date,
          outcome: status,
          message: OUTCOME_MESSAGE[status],
          bookingId,
        });
        // Retry ONLY a transient error, ONLY while the class has not started
        // (ruleContext re-checks next time) and under the safety cap. Terminal
        // registered/already/full never retry.
        if (status === "error" && attempt < MAX_RETRY_ATTEMPTS) {
          await ctx.scheduler.runAfter(
            RETRY_BACKOFF_MS,
            internal.autoBookAttempt.attemptRule,
            { ruleId, date, attempt: attempt + 1 },
          );
          return { outcome: "error", willRetry: true };
        }
        return { outcome: status, willRetry: false };
      }
    }
    // `cx.kind` is exhaustively handled above.
    throw new Error("unreachable: unhandled rule-context kind");
  },
});
