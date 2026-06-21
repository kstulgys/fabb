import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import type { ClassRecord } from "../classes";
import { resolveClock, weekStartsFor } from "../week";
import { type PoolGateway, poolGateway } from "./gateway";

/**
 * How many consecutive weeks the Schedule window caches: the current week plus
 * the next (ADR-0006). Bounded to keep pool load flat; bumping it is a
 * one-constant change.
 */
const SCHEDULE_WEEKS = 2;

/**
 * Scrape one week's `?nuo=<weekStart>` page into cache rows: the week's classes,
 * each enriched with its stable event-modal detail (calories, duration). Kept a
 * standalone per-week step so the daily refresh can later reconcile vanished
 * classes one week at a time (ADR-0006) without reshaping this loop.
 */
async function scrapeWeekRows(
  gateway: PoolGateway,
  weekStart: string,
): Promise<ClassRecord[]> {
  const classes = await gateway.fetchSchedule(weekStart);

  const rows: ClassRecord[] = [];
  for (const cls of classes) {
    const detail = await gateway.fetchEventDetail(cls.pid, cls.date);
    rows.push({
      date: cls.date,
      startTime: cls.startTime,
      endTime: cls.endTime,
      pid: cls.pid,
      name: cls.name,
      intensity: cls.intensity,
      // null (absent on the modal) → omit the field in the cache.
      kcalMin: detail.kcalMin ?? undefined,
      kcalMax: detail.kcalMax ?? undefined,
      durationMin: detail.durationMin ?? undefined,
    });
  }
  return rows;
}

/**
 * Scrape the two-week Schedule window (current + next, Europe/Vilnius) and
 * upsert the stable fields into the `classes` cache. Manually invocable for now
 * (e.g. `npx convex run pool/scrape:scrapeWeek`); a later slice schedules it
 * daily (ADR-0006).
 *
 * The flow: resolve the window's Monday starts → for each week, {@link
 * poolGateway} returns that week's parsed classes and each one's event detail →
 * one idempotent {@link internal.classes.upsertClasses} over every collected
 * row. The gateway returns domain values (HTML parsing lives behind it); tests
 * replace it with a fixture-backed fake. `now` is injectable for tests;
 * production omits it and uses the real clock.
 */
export const scrapeWeek = internalAction({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, { now }): Promise<{ upserted: number }> => {
    const gateway = poolGateway();
    const weekStarts = weekStartsFor(resolveClock(now), SCHEDULE_WEEKS);

    const rows: ClassRecord[] = [];
    for (const weekStart of weekStarts) {
      rows.push(...(await scrapeWeekRows(gateway, weekStart)));
    }

    return await ctx.runMutation(internal.classes.upsertClasses, {
      classes: rows,
    });
  },
});
