import { v } from "convex/values";

/**
 * Calories: the one home for the Calorie-range invariant (see CONTEXT.md
 * **Calories** and ADR-0004). A Calorie figure is an all-or-nothing `(min, max)`
 * RANGE — a property of the class, identical for every participant — that is
 * absent when the pool never published it. A lone bound is meaningless: it would
 * corrupt the midpoint the stats average. Pure and runtime-agnostic — NO Convex
 * server imports — so React client components import `format`/`fromColumns`
 * directly (the same pattern as `./poolDetails` and `./week`).
 *
 * Per ADR-0004 storage stays two independent optional columns (`kcalMin`,
 * `kcalMax`); this module — not the schema — owns the invariant, and every read
 * and write goes through it. Three tiers gate the boundary by trust:
 *   - {@link requirePair} validates UNTRUSTED user input (a lone bound throws);
 *   - {@link fromColumns} tolerantly reads TRUSTED stored/scraped data (a lone
 *     bound — which should never occur — coerces to absent rather than throwing);
 *   - {@link toColumns} writes a range back to the two columns.
 * {@link midpoint} and {@link format} are the stats and display readers.
 */

/** A published Calorie range. Present only as a whole pair, never a lone bound. */
export type CalorieRange = { min: number; max: number };

/**
 * The two stored columns as one shared validator shape, spread into the table
 * definitions ({@link ../schema}) and the scraped-record validator
 * ({@link ../classes classRecord}) so the `(kcalMin, kcalMax)` pair is spelled
 * once. Optional because the pool omits Calories on some classes; an omitted
 * field means "absent".
 */
export const caloriesColumns = {
  kcalMin: v.optional(v.number()),
  kcalMax: v.optional(v.number()),
};

/**
 * Read a range from TRUSTED columns (a stored class or training log). A lone
 * bound — a should-never-happen for data that only this module writes — coerces
 * to `null` (absent) rather than throwing, so a read path never blows up on it.
 */
export function fromColumns(row: {
  kcalMin?: number;
  kcalMax?: number;
}): CalorieRange | null {
  if (row.kcalMin === undefined || row.kcalMax === undefined) return null;
  return { min: row.kcalMin, max: row.kcalMax };
}

/**
 * Write a range back to the two columns: a range sets both, `null` returns `{}`
 * so spreading it omits both (clearing any previously stored range).
 */
export function toColumns(range: CalorieRange | null): {
  kcalMin?: number;
  kcalMax?: number;
} {
  return range === null ? {} : { kcalMin: range.min, kcalMax: range.max };
}

/**
 * Validate UNTRUSTED Calorie input (a User-typed form). Both bounds present
 * yield a range; both absent yield `null` (Calories left blank); a lone bound
 * THROWS — Calories are all-or-nothing, and a partial pair is a user error.
 */
export function requirePair(
  min: number | undefined,
  max: number | undefined,
): CalorieRange | null {
  if (min === undefined && max === undefined) return null;
  if (min === undefined || max === undefined) {
    throw new Error(
      "Enter both a minimum and maximum calorie figure, or leave both blank.",
    );
  }
  return { min, max };
}

/**
 * The midpoint `(min + max) / 2` a Calorie total sums, or `null` when absent.
 * `null` means "exclude from the total" — NOT zero, which would dilute an
 * average and misrepresent an unknown as none.
 */
export function midpoint(range: CalorieRange | null): number | null {
  return range === null ? null : (range.min + range.max) / 2;
}

/**
 * Display a range as `${min}–${max} kcal` (EN DASH U+2013), or `absent` when
 * there is none — defaulting to the compact em dash the calendar shows.
 */
export function format(range: CalorieRange | null, absent = "—"): string {
  return range === null ? absent : `${range.min}–${range.max} kcal`;
}
