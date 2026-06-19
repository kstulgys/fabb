"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, type ActionCtx } from "./_generated/server";
import { manualBookable } from "./bookingDecision";
import type { BookingStatus } from "./bookingStatus";
import { poolGateway } from "./pool/gateway";
import type { PoolDetails } from "./poolDetails";
import { requirePoolDetailsForAction } from "./poolDetailsOps";

/**
 * The per-Booking run-log line for each outcome. Kept human and terse — this is
 * the history message a User (or a later run-log view) reads, distinct from the
 * UI feedback the action's return status drives.
 */
export const OUTCOME_MESSAGE: Record<BookingStatus, string> = {
  registered: "Booked — the pool will email the confirmation and cancel link.",
  already: "Already registered for this class.",
  full: "Class is full — no spot was booked.",
  error: "Booking failed — the pool did not confirm a spot.",
};

/**
 * The shared "book + write a Booking row" step: submit the booking through the
 * gateway (a fake in tests, NEVER the real network), then persist the outcome
 * via {@link internal.bookings.recordBooking}. Used by both the manual
 * {@link bookNow} action (`source: 'now'`) and the day-before AutoBook cron
 * (`source: 'rule'`, with `ruleId`) so the two never diverge — returns the
 * classified status and the Booking id (the cron links a `ruleRuns` entry to
 * it). The gateway already classifies a network failure as `error`.
 */
export async function bookAndRecord(
  ctx: ActionCtx,
  args: {
    userId: Id<"users">;
    pid: string;
    date: string;
    poolDetails: PoolDetails;
    source: "rule" | "now";
    ruleId?: Id<"autoBookRules">;
  },
): Promise<{ status: BookingStatus; bookingId: Id<"bookings"> }> {
  const status = await poolGateway().book(args.pid, args.date, args.poolDetails);
  const bookingId: Id<"bookings"> = await ctx.runMutation(
    internal.bookings.recordBooking,
    {
      userId: args.userId,
      pid: args.pid,
      date: args.date,
      source: args.source,
      ...(args.ruleId ? { ruleId: args.ruleId } : {}),
      status,
      message: OUTCOME_MESSAGE[status],
    },
  );
  return { status, bookingId };
}

/**
 * Book a single class instance ("Book now") for the calling User.
 *
 * Runs in the Node runtime because the real {@link poolGateway} `book` carries a
 * PHP session cookie across four requests and posts a multipart body. The flow:
 *  1. resolve + authorise the caller and require complete Pool details — the
 *     booking gate (issue 05) refuses otherwise;
 *  2. refuse a class that has already finished ({@link manualBookable});
 *  3. submit the booking through the gateway — a fake in tests, NEVER the real
 *     network — and let it classify the response;
 *  4. write a `source: 'now'` Booking row with the status + a run-log entry;
 *  5. return the {@link BookingStatus} so the UI can show truthful feedback
 *     (and never claim success on `error`).
 */
export const bookNow = action({
  args: { pid: v.string(), date: v.string() },
  handler: async (ctx, { pid, date }): Promise<BookingStatus> => {
    const { userId, poolDetails } = await requirePoolDetailsForAction(ctx);

    const cls: Doc<"classes"> | null = await ctx.runQuery(
      internal.bookings.classForBooking,
      { pid, date },
    );
    if (cls === null) {
      throw new Error("That class is not in this week's schedule.");
    }
    if (!manualBookable(cls, new Date())) {
      throw new Error("This class has finished — it can no longer be booked.");
    }

    const { status } = await bookAndRecord(ctx, {
      userId,
      pid,
      date,
      poolDetails,
      source: "now",
    });

    return status;
  },
});
