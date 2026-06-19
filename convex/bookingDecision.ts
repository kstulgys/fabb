import { classStatus } from "./week";

/**
 * The booking PRE-decision's bookable predicates: WHEN each trigger may grab a
 * class. "Book now" and AutoBook deliberately carry DIFFERENT thresholds
 * (ADR-0003): a manual click may grab a class until it has finished — including
 * one already in progress — because a User is explicitly choosing to join a
 * class that may already be underway; a day-before AutoBook retry, by contrast,
 * only books a class still `upcoming` and gives up once it has started, because
 * a retry firing after the start is almost never wanted and risks booking the
 * wrong thing. The two thresholds are NAMED here (not unified) so both booking
 * paths read one source — see
 * `docs/adr/0003-divergent-bookable-thresholds.md`.
 *
 * Pure and runtime-agnostic — NO Convex server imports (only {@link ./week}) —
 * so it is safe to import anywhere, the same pattern as {@link ./week} and
 * {@link ./poolDetails}.
 */

/** The minimal class timing {@link classStatus} needs to place a class on its
 * own day — a `Doc<"classes">` satisfies it structurally. */
export type ClassTimingInput = {
  date: string;
  startTime: string;
  endTime: string;
};

/**
 * "Book now": a User may grab any class that has NOT finished — including one
 * already in progress — i.e. {@link classStatus}'s `bookable` flag. The looser
 * of the two thresholds (ADR-0003).
 */
export function manualBookable(cls: ClassTimingInput, now: Date): boolean {
  return classStatus(cls, now).bookable;
}

/**
 * AutoBook: the day-before cron only books a class that is still `upcoming` and
 * gives up once it has started. The stricter of the two thresholds (ADR-0003).
 */
export function autoBookable(cls: ClassTimingInput, now: Date): boolean {
  return classStatus(cls, now).status === "upcoming";
}
