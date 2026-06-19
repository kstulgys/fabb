import { type Infer, v } from "convex/values";

/**
 * The single source for the **Booking status** and **AutoBook outcome**
 * vocabularies (CONTEXT.md).
 *
 * Each vocabulary is spelled once as a `v.union`, and its static type is
 * `Infer`-ed from that same validator — so adding or renaming an outcome is one
 * edit here instead of up to six parallel spellings across the schema, the pool
 * parsers, and the server modules. Server-free (imports only `convex/values`)
 * so `schema.ts`, the pool parsers, and the server modules (`bookings`,
 * `autoBook`) all import it without pulling in `_generated/server`.
 */

/**
 * The pool's booking outcome vocabulary as a Convex validator. Every booking
 * surface speaks it: the gateway classifies the pool's registration HTML into
 * it (`parseBookingResult` in `pool/parse.ts`), the `bookings` row stores the
 * latest one, and the UI shows truthful feedback (never claiming success on
 * `error`).
 */
export const bookingStatusValidator = v.union(
  v.literal("registered"),
  v.literal("already"),
  v.literal("full"),
  v.literal("error"),
);

/** The static twin of {@link bookingStatusValidator} (CONTEXT.md: Booking
 * status). */
export type BookingStatus = Infer<typeof bookingStatusValidator>;

/**
 * AutoBook outcome STRUCTURALLY extends Booking status with two verdicts that
 * book nothing: `no_match` (the rule resolved to 0 or 2+ classes) and
 * `no_details` (the owner's Pool details are incomplete). Nesting
 * `bookingStatusValidator` flattens, so every Booking status stays assignable
 * to an AutoBook outcome while unknown literals are still rejected.
 */
export const attemptOutcomeValidator = v.union(
  bookingStatusValidator,
  v.literal("no_match"),
  v.literal("no_details"),
);

/** The static twin of {@link attemptOutcomeValidator} (CONTEXT.md: AutoBook
 * outcome). */
export type AttemptOutcome = Infer<typeof attemptOutcomeValidator>;
