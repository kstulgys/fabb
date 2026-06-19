import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requirePoolDetails } from "./poolDetailsOps";
import { requireUserId } from "./users";
import { isoWeekday } from "./week";

/**
 * AutoBook rule CRUD (issue 07): standing, recurring-weekly instructions to book
 * a class, managed per User. No booking happens here — the day-before cron
 * (issue 08) reads the enabled rules. Disabling or deleting a rule only stops
 * FUTURE bookings; it never cancels a Booking already placed (ADR-0001).
 *
 * Every entry point resolves the caller server-side (NEVER trusts a client
 * userId) and scopes strictly to that User, so one User can neither see nor
 * alter another's rules.
 */

/**
 * Load a rule and assert the caller owns it. Returns the rule, or throws
 * "Rule not found" for a missing rule OR one owned by another User — the same
 * message either way, so a caller can't probe for the existence of rules that
 * aren't theirs. The owner-only guard behind {@link setRuleEnabled} and
 * {@link deleteRule}.
 */
async function requireOwnedRule(
  ctx: MutationCtx,
  ruleId: Id<"autoBookRules">,
): Promise<Doc<"autoBookRules">> {
  const userId = await requireUserId(ctx);
  const rule = await ctx.db.get("autoBookRules", ruleId);
  if (rule === null || rule.userId !== userId) {
    throw new Error("Rule not found");
  }
  return rule;
}

/**
 * Create an AutoBook rule from a class on the calendar. The rule captures the
 * class's weekday (ISO-8601, derived from its date), start time and name from
 * the CANONICAL cached class — never from client-supplied fields — so a rule
 * always reflects the real schedule. Gated on Pool details (issue 05): a rule
 * with no details could never book, so creation refuses until they are complete.
 *
 * Idempotent on the rule key `(weekday, startTime, nameMatch)`: a repeat call
 * for the same class re-enables the existing rule instead of inserting a
 * duplicate (which would make the cron double-book). Returns the rule id.
 */
export const createFromClass = mutation({
  args: { pid: v.string(), date: v.string() },
  handler: async (ctx, { pid, date }): Promise<Id<"autoBookRules">> => {
    const { userId } = await requirePoolDetails(ctx);

    const cls = await ctx.db
      .query("classes")
      .withIndex("by_pid_and_date", (q) => q.eq("pid", pid).eq("date", date))
      .unique();
    if (cls === null) {
      throw new Error("That class is not in this week's schedule.");
    }

    const weekday = isoWeekday(cls.date);
    const { startTime, name: nameMatch } = cls;

    // Idempotent on the canonical key: re-enable any existing match rather than
    // duplicate it. A User's rule set is small, so scanning their own rows (via
    // the userId index) is cheap and avoids a second compound index.
    const mine = await ctx.db
      .query("autoBookRules")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .collect();
    const existing = mine.find(
      (r) =>
        r.weekday === weekday &&
        r.startTime === startTime &&
        r.nameMatch === nameMatch,
    );
    if (existing) {
      if (!existing.enabled) {
        await ctx.db.patch("autoBookRules", existing._id, { enabled: true });
      }
      return existing._id;
    }

    return await ctx.db.insert("autoBookRules", {
      userId,
      weekday,
      startTime,
      nameMatch,
      enabled: true,
    });
  },
});

/**
 * The calling User's own AutoBook rules, ordered by weekday then start time for
 * a stable display. Scoped to the caller via the `userId` index — never returns
 * another User's rules.
 */
export const listMine = query({
  args: {},
  handler: async (ctx): Promise<Doc<"autoBookRules">[]> => {
    const userId = await requireUserId(ctx);
    const rules = await ctx.db
      .query("autoBookRules")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .collect();
    return rules.sort(
      (a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime),
    );
  },
});

/**
 * Enable or disable one of the caller's own rules — the single entry point for
 * both the "enable" and "disable" affordances. Owner-only: a User cannot toggle
 * another's rule. Disabling never cancels a Booking already placed (ADR-0001);
 * it only stops the cron from placing FUTURE bookings.
 */
export const setRuleEnabled = mutation({
  args: { ruleId: v.id("autoBookRules"), enabled: v.boolean() },
  handler: async (ctx, { ruleId, enabled }): Promise<null> => {
    const rule = await requireOwnedRule(ctx, ruleId);
    await ctx.db.patch("autoBookRules", rule._id, { enabled });
    return null;
  },
});

/**
 * Delete one of the caller's own rules. Owner-only: a User cannot delete
 * another's rule. Per ADR-0001 this removes only the standing instruction; any
 * Booking already placed by the rule stays — the app never cancels at the pool.
 */
export const deleteRule = mutation({
  args: { ruleId: v.id("autoBookRules") },
  handler: async (ctx, { ruleId }): Promise<null> => {
    const rule = await requireOwnedRule(ctx, ruleId);
    await ctx.db.delete("autoBookRules", rule._id);
    return null;
  },
});
