import type { WeekClasses } from "../../../convex/classes";
import { classStatus, todayDate } from "../../../convex/week";

/**
 * The week + day the Schedule window should open on: current-unless-spent,
 * today-as-anchor (the grilled UX). The current week is chosen while any of its
 * classes is still attendable — `classStatus(...).status !== "finished"`, i.e.
 * `upcoming` or `in-progress`; once every one is `finished` (which also covers
 * an empty current week) the view rolls to next week. The day is today when the
 * chosen week contains it, else that week's first day that has classes, else its
 * Monday.
 *
 * Pure and client-safe (no Convex server imports) so it is unit-tested without
 * Convex. `weeks` is the `scheduleWeeks` result — the current Mon–Sun week then
 * the next, always length 2; the `?? weeks[0]` mirrors the component's existing
 * defensive index guard.
 */
export function pickInitialView(
  weeks: WeekClasses[],
  now: Date,
): { weekIndex: number; date: string } {
  const currentHasUpcoming = weeks[0].days.some((day) =>
    day.classes.some((cls) => classStatus(cls, now).status !== "finished"),
  );
  const weekIndex = currentHasUpcoming ? 0 : 1;
  const chosen = weeks[weekIndex] ?? weeks[0];

  const today = todayDate(now);
  const date = chosen.days.some((day) => day.date === today)
    ? today
    : (chosen.days.find((day) => day.classes.length > 0)?.date ??
      chosen.days[0].date);

  return { weekIndex, date };
}
