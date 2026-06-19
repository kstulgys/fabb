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
 *
 * Beyond the vocabulary, this module owns its operational MEANING — the held /
 * terminal / retriable polarity each booking surface used to re-derive inline
 * ({@link isHeld}, {@link isTerminal}, {@link isRetriable}).
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

/**
 * Whether a Booking status is a HELD spot — the pool confirmed a reservation
 * (`registered`) or the User was already on the list (`already`). The two
 * statuses the Attendance conversion counts as attendance and the UI blocks
 * re-booking on; a `full` or `error` Booking holds nothing.
 */
export function isHeld(status: BookingStatus): boolean {
  return status === "registered" || status === "already";
}

/**
 * Whether a Booking status is TERMINAL — the attempt reached a definitive
 * verdict, so a retry would change nothing: a held spot (`registered`/`already`)
 * or a `full` class. Only a transient `error` is non-terminal. The day-before
 * cron's dedupe blocks a second Booking on any terminal status.
 */
export function isTerminal(status: BookingStatus): boolean {
  return status !== "error";
}

/**
 * Whether an AutoBook attempt that produced `status` should be retried: only a
 * transient `error` (the booking never went through), never a terminal verdict
 * — the exact complement of {@link isTerminal}.
 */
export function isRetriable(status: BookingStatus): boolean {
  return !isTerminal(status);
}
