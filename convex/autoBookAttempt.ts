"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { planAttempt, type RuleContextResult } from "./autoBook";
import { bookAndRecord, OUTCOME_MESSAGE } from "./book";
import { type AttemptOutcome, isRetriable } from "./bookingStatus";

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
    const verdict: RuleContextResult = await ctx.runQuery(
      internal.autoBook.ruleContext,
      { ruleId, date, now },
    );
    const plan = planAttempt(verdict);

    if (plan.action === "skip") {
      // The rule was deleted/disabled before the attempt ran — nothing to log.
      return { outcome: "cancelled", willRetry: false };
    }

    if (plan.action === "log") {
      // A terminal non-booking verdict: record it once; these never retry.
      await ctx.runMutation(internal.autoBook.recordRuleRun, {
        ruleId,
        userId: plan.userId,
        date,
        outcome: plan.outcome,
        message: plan.message,
      });
      return { outcome: plan.outcome, willRetry: false };
    }

    // `book`: contact the pool through the shared helper, then record the
    // classified status (its message keyed by OUTCOME_MESSAGE).
    const { status, bookingId } = await bookAndRecord(ctx, {
      userId: plan.userId,
      pid: plan.pid,
      date,
      poolDetails: plan.poolDetails,
      source: "rule",
      ruleId,
    });
    await ctx.runMutation(internal.autoBook.recordRuleRun, {
      ruleId,
      userId: plan.userId,
      date,
      outcome: status,
      message: OUTCOME_MESSAGE[status],
      bookingId,
    });
    // Retry ONLY a transient error ({@link isRetriable}), only under the safety
    // cap; ruleContext re-checks the start-time stop on the next attempt. A
    // `started` verdict is a non-retrying `log` plan above, so the two senses of
    // `error` no longer depend on switch-arm order.
    if (isRetriable(status) && attempt < MAX_RETRY_ATTEMPTS) {
      await ctx.scheduler.runAfter(
        RETRY_BACKOFF_MS,
        internal.autoBookAttempt.attemptRule,
        { ruleId, date, attempt: attempt + 1 },
      );
      return { outcome: status, willRetry: true };
    }
    return { outcome: status, willRetry: false };
  },
});
