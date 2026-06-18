import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import type { ClassRecord } from "../classes";
import { poolGateway } from "./gateway";
import { parseEventDetail, parseSchedule } from "./parse";

/**
 * Scrape the current week's schedule and upsert the stable fields into the
 * `classes` cache. Manually invocable for now (e.g.
 * `npx convex run pool/scrape:scrapeWeek`); a later slice schedules it hourly
 * (ADR-0002).
 *
 * The flow: GET the schedule → {@link parseSchedule} → for each class GET its
 * event modal → {@link parseEventDetail} → one idempotent
 * {@link internal.classes.upsertClasses}. All network I/O goes through the
 * active {@link poolGateway}, which tests replace with a fixture-backed fake.
 */
export const scrapeWeek = internalAction({
  args: {},
  handler: async (ctx): Promise<{ upserted: number }> => {
    const gateway = poolGateway();
    const classes = parseSchedule(await gateway.fetchScheduleHtml());

    const rows: ClassRecord[] = [];
    for (const cls of classes) {
      const detail = parseEventDetail(
        await gateway.fetchEventHtml(cls.pid, cls.date),
      );
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

    return await ctx.runMutation(internal.classes.upsertClasses, {
      classes: rows,
    });
  },
});
