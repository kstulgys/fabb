import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import type { ClassRecord } from "../classes";
import { poolGateway } from "./gateway";

/**
 * Scrape the current week's schedule and upsert the stable fields into the
 * `classes` cache. Manually invocable for now (e.g.
 * `npx convex run pool/scrape:scrapeWeek`); a later slice schedules it hourly
 * (ADR-0002).
 *
 * The flow: {@link poolGateway} returns the week's parsed classes → for each,
 * its parsed event detail → one idempotent {@link internal.classes.upsertClasses}.
 * The gateway returns domain values (HTML parsing lives behind it); tests
 * replace it with a fixture-backed fake.
 */
export const scrapeWeek = internalAction({
  args: {},
  handler: async (ctx): Promise<{ upserted: number }> => {
    const gateway = poolGateway();
    const classes = await gateway.fetchSchedule();

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

    return await ctx.runMutation(internal.classes.upsertClasses, {
      classes: rows,
    });
  },
});
