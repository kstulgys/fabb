import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import type { ClassRecord } from "../classes";
import { resolveClock, todayDate, weekDatesFor, weekStartsFor } from "../week";
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
 * standalone per-week step so the daily refresh reconciles each week
 * independently (ADR-0006) — a fetch failure isolates to that one week.
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
 * Refresh the two-week Schedule window (current + next, Europe/Vilnius) so the
 * `classes` cache mirrors the pool. Manually invocable (`npx convex run
 * pool/scrape:scrapeWeek`); the daily cron drives it in production (ADR-0006).
 *
 * Each week is fetched and reconciled INDEPENDENTLY: {@link poolGateway} returns
 * that week's parsed classes and each one's event detail, then
 * {@link internal.classes.reconcileWeek} upserts them and deletes the week's
 * vanished future-only classes. A week whose schedule fetch throws — or returns
 * an EMPTY scrape (a successful but classless page) — is skipped, its cached
 * rows left intact rather than wiped as if "all cancelled"; the other week still
 * reconciles. The gateway returns domain values (HTML parsing
 * lives behind it); tests replace it with a fixture-backed fake. `now` is
 * injectable for tests; production omits it and uses the real clock.
 */
export const scrapeWeek = internalAction({
  args: { now: v.optional(v.number()) },
  handler: async (
    ctx,
    { now },
  ): Promise<{ upserted: number; deleted: number }> => {
    const gateway = poolGateway();
    const clock = resolveClock(now);
    const today = todayDate(clock);
    const weekStarts = weekStartsFor(clock, SCHEDULE_WEEKS);

    let upserted = 0;
    let deleted = 0;
    for (const weekStart of weekStarts) {
      let rows: ClassRecord[];
      try {
        rows = await scrapeWeekRows(gateway, weekStart);
      } catch (error) {
        // A failed fetch is NOT "all cancelled" (ADR-0006): skip this week's
        // reconcile so its cached rows survive. The other week is independent.
        console.error(
          `scrapeWeek: skipping week ${weekStart} after a fetch failure`,
          error,
        );
        continue;
      }

      // A successful HTTP fetch can still yield ZERO classes — a maintenance,
      // login, or otherwise empty page parses to [] without throwing (the
      // scrape is a regex over `<li class="single-event">`). Treat that exactly
      // like a thrown failure: an empty scrape is NOT "all cancelled", so skip
      // this week's reconcile and leave its cached rows intact (ADR-0006
      // invariant 2). The other week is independent.
      if (rows.length === 0) {
        console.warn(
          `scrapeWeek: skipping week ${weekStart} — empty scrape, not treating as all-cancelled`,
        );
        continue;
      }

      // The week's Sunday — the same expansion scheduleWeeks uses for its window.
      const weekEnd = weekDatesFor(new Date(`${weekStart}T12:00:00Z`))[6];
      const result = await ctx.runMutation(internal.classes.reconcileWeek, {
        classes: rows,
        weekStart,
        weekEnd,
        today,
      });
      upserted += result.upserted;
      deleted += result.deleted;
    }

    return { upserted, deleted };
  },
});
