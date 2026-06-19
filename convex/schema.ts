import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { bookingStatusValidator, attemptOutcomeValidator } from "./bookingStatus";
import { caloriesColumns } from "./calories";
import { poolDetailsValidator } from "./poolDetails";

/**
 * App schema.
 *
 * Convex Auth owns the auth tables (`...authTables`). We re-declare `users` to
 * extend it with the app-specific fields that later slices fill in, while
 * keeping every field and index Convex Auth relies on (`email`, `phone`).
 *
 * Canonical `users` shape (see `.git/sdd/constraints.md`):
 *   auth identity + `poolDetails{name,surname,phone,email}` + `detailsComplete`.
 * Both app-specific fields are optional here so a freshly signed-up account is
 * valid before the User has filled in their pool details.
 */
const schema = defineSchema({
  ...authTables,
  users: defineTable({
    // Convex Auth managed identity fields — must mirror `authTables.users`.
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    // App-specific (extended by later slices).
    poolDetails: v.optional(poolDetailsValidator),
    detailsComplete: v.optional(v.boolean()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"]),

  /**
   * The pool's stable schedule for the current Mon–Sun week, cached so every
   * User reads from Convex instead of scraping per view (ADR-0002). Keyed by
   * `(pid, date)` for idempotent upserts; `by_date` serves the weekly read.
   * Volatile free-spot counts are deliberately NOT stored here.
   */
  classes: defineTable({
    date: v.string(), // ISO "YYYY-MM-DD" (Europe/Vilnius)
    startTime: v.string(), // "HH:MM"
    endTime: v.string(), // "HH:MM" ("" when the source omits it)
    pid: v.string(),
    name: v.string(),
    intensity: v.number(), // count of ❤ hearts
    ...caloriesColumns,
    durationMin: v.optional(v.number()),
  })
    .index("by_pid_and_date", ["pid", "date"])
    .index("by_date", ["date"]),

  /**
   * One Booking: a User's reservation for a single class instance (`pid` +
   * `date`). `source` records how it was placed — `now` for a manual "Book
   * now", `rule` for a future AutoBook rule. `status` is the latest outcome and
   * `runLog` is the history of attempts (each: when → outcome → message).
   *
   * `ruleId` (the canonical optional reference to `autoBookRules`) is added by
   * the AutoBook slice (issue 07) together with the `autoBookRules` table it
   * points at; `now` bookings never set it, so it is intentionally absent here.
   */
  bookings: defineTable({
    userId: v.id("users"),
    pid: v.string(),
    date: v.string(), // ISO "YYYY-MM-DD" (Europe/Vilnius)
    // Set only on `source: 'rule'` bookings — the AutoBook rule that placed it
    // (issue 08). A deleted rule may leave this dangling; the Booking stands
    // (ADR-0001). `now` bookings omit it.
    ruleId: v.optional(v.id("autoBookRules")),
    source: v.union(v.literal("rule"), v.literal("now")),
    status: bookingStatusValidator,
    runLog: v.array(
      v.object({
        at: v.number(), // epoch ms of the attempt
        outcome: bookingStatusValidator,
        message: v.string(),
      }),
    ),
  })
    .index("by_user_and_pid_and_date", ["userId", "pid", "date"])
    // The conversion cron (issue 10) runs in system context with no caller
    // userId, so it fetches a finished class's bookings across all Users by
    // (pid, date) — mirroring the same key on `classes`.
    .index("by_pid_and_date", ["pid", "date"]),

  /**
   * A standing AutoBook rule: a recurring-weekly instruction to book one class
   * for its owner. Keyed by `(weekday, startTime, nameMatch)` (see CONTEXT.md);
   * `enabled` gates it without deleting it. The day-before cron (issue 08) reads
   * the enabled rules and books the matching class — disabling or deleting a
   * rule only stops FUTURE bookings and never cancels a Booking already placed
   * (ADR-0001).
   *
   * `weekday` is the ISO-8601 day-of-week of the class date (Monday=1 … Sunday=7,
   * Europe/Vilnius); `week.ts#isoWeekday` derives it from a class's ISO date and
   * the cron computes the same value for tomorrow to resolve a rule to a class.
   * Scoped per User via the `userId` index (issue 07).
   */
  autoBookRules: defineTable({
    userId: v.id("users"),
    weekday: v.number(), // ISO-8601: Monday=1 … Sunday=7 (Europe/Vilnius)
    startTime: v.string(), // "HH:MM", matched against the class's startTime
    nameMatch: v.string(), // the class name to match (captured from the class)
    enabled: v.boolean(),
  })
    .index("userId", ["userId"])
    .index("by_weekday", ["weekday"]),

  /**
   * The per-rule run log (issue 08): one entry per AutoBook cron attempt for a
   * rule on a given date. Lives in its own table (not only on `bookings`)
   * because a `no_match`/`no_details` attempt books NOTHING yet must still be
   * recorded — so it cannot hang off a Booking that does not exist. `bookingId`
   * links to the Booking when the attempt produced one. The UI shows a rule's
   * recent outcomes from here (`by_ruleId`).
   */
  ruleRuns: defineTable({
    ruleId: v.id("autoBookRules"),
    userId: v.id("users"), // owner — scopes the per-rule run-log read
    date: v.string(), // ISO "YYYY-MM-DD" the attempt targeted (tomorrow at fire)
    at: v.number(), // epoch ms of the attempt
    outcome: attemptOutcomeValidator,
    message: v.string(),
    bookingId: v.optional(v.id("bookings")),
  }).index("by_ruleId", ["ruleId"]),

  /**
   * A Training log: a record that a User did a class, carrying its name, date,
   * intensity and Calories (issue 09). A MANUAL log — added by the User for a
   * class they attended without booking through the app — sets `attended: true`
   * and has NO `bookingId`. The booking-sourced path (issue 10) sets `bookingId`
   * to the completed Booking and may flip `attended` via a "didn't go" toggle;
   * both fields are modelled now so that slice adds only behaviour, not schema.
   *
   * `intensity` is the canonical heart-count (0 when unknown, e.g. a typed past
   * class). Calories are the pool's published RANGE, absent when unpublished — a
   * null-calorie log still counts as attended but is excluded from calorie stats
   * (see constraints). Scoped per User via `by_user_and_date`, which also orders
   * the history view newest class first.
   */
  trainingLogs: defineTable({
    userId: v.id("users"),
    className: v.string(),
    date: v.string(), // ISO "YYYY-MM-DD" (Europe/Vilnius)
    intensity: v.number(), // count of ❤ hearts (0 = unknown / none)
    ...caloriesColumns,
    attended: v.boolean(),
    // Set only by the booking-sourced path (issue 10); a manual log omits it.
    bookingId: v.optional(v.id("bookings")),
  })
    .index("by_user_and_date", ["userId", "date"])
    // One Training log per Booking: the conversion cron (issue 10) looks a
    // Booking up here before inserting, so a re-run never double-creates.
    .index("by_bookingId", ["bookingId"]),
});

export default schema;
