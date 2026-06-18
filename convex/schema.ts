import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

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
    poolDetails: v.optional(
      v.object({
        name: v.string(),
        surname: v.string(),
        phone: v.string(),
        email: v.string(),
      }),
    ),
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
    // Calories are a published range, absent on some classes → omitted.
    kcalMin: v.optional(v.number()),
    kcalMax: v.optional(v.number()),
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
    source: v.union(v.literal("rule"), v.literal("now")),
    status: v.union(
      v.literal("registered"),
      v.literal("already"),
      v.literal("full"),
      v.literal("error"),
    ),
    runLog: v.array(
      v.object({
        at: v.number(), // epoch ms of the attempt
        outcome: v.union(
          v.literal("registered"),
          v.literal("already"),
          v.literal("full"),
          v.literal("error"),
        ),
        message: v.string(),
      }),
    ),
  }),
});

export default schema;
