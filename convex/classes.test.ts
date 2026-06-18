/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { weekDatesFor } from "./week";

const modules = import.meta.glob("./**/*.ts");

describe("weekClasses", () => {
  test("returns the current Vilnius week grouped by day, time-sorted, excluding other weeks", async () => {
    const t = convexTest(schema, modules);
    const dates = weekDatesFor(new Date());
    const monday = dates[0];
    const wednesday = dates[2];
    const lastWeek = new Date(Date.parse(`${monday}T00:00:00Z`) - 7 * 86_400_000)
      .toISOString()
      .slice(0, 10);

    const userId = await t.run(async (ctx) => {
      // Two Monday classes inserted out of time order (proves sorting).
      await ctx.db.insert("classes", {
        date: monday, startTime: "09:00", endTime: "09:50", pid: "1",
        name: "Late", intensity: 2, kcalMin: 500, kcalMax: 800, durationMin: 50,
      });
      await ctx.db.insert("classes", {
        date: monday, startTime: "07:00", endTime: "07:50", pid: "2",
        name: "Early", intensity: 1, durationMin: 50,
      });
      await ctx.db.insert("classes", {
        date: wednesday, startTime: "18:00", endTime: "18:50", pid: "3",
        name: "Mid", intensity: 3, durationMin: 45,
      });
      // A class from last week must NOT appear in the current-week view.
      await ctx.db.insert("classes", {
        date: lastWeek, startTime: "07:00", endTime: "07:50", pid: "4",
        name: "Old", intensity: 1, durationMin: 50,
      });
      return await ctx.db.insert("users", { email: "u@example.com" });
    });

    const week = await t
      .withIdentity({ subject: userId })
      .query(api.classes.weekClasses, {});

    expect(week.weekStart).toBe(monday);
    expect(week.weekEnd).toBe(dates[6]);
    expect(week.days).toHaveLength(7);
    expect(week.days[0].weekday).toBe("Monday");
    // Monday's two classes come back sorted by start time.
    expect(week.days[0].classes.map((c) => c.name)).toEqual(["Early", "Late"]);
    expect(week.days[2].classes.map((c) => c.name)).toEqual(["Mid"]);
    expect(week.days.flatMap((d) => d.classes.map((c) => c.name))).not.toContain(
      "Old",
    );
  });

  test("rejects an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.classes.weekClasses, {})).rejects.toThrow(
      "Not authenticated",
    );
  });
});

describe("upsertClasses", () => {
  const base = {
    date: "2026-06-15", startTime: "07:00", endTime: "07:50", pid: "258",
    name: "TRX treniruotė", intensity: 2, durationMin: 50,
  };

  test("re-upserting the same (pid,date) refreshes the row instead of duplicating", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.classes.upsertClasses, {
      classes: [{ ...base, kcalMin: 500, kcalMax: 800 }],
    });
    await t.mutation(internal.classes.upsertClasses, {
      classes: [{ ...base, name: "TRX (renamed)", kcalMin: 100, kcalMax: 200 }],
    });

    const rows = await t.run((ctx) => ctx.db.query("classes").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("TRX (renamed)");
    expect(rows[0].kcalMin).toBe(100);
  });

  test("re-upsert with absent calories clears the previously stored range", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.classes.upsertClasses, {
      classes: [{ ...base, kcalMin: 800, kcalMax: 1400 }],
    });
    await t.mutation(internal.classes.upsertClasses, { classes: [base] });

    const rows = await t.run((ctx) => ctx.db.query("classes").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].kcalMin).toBeUndefined();
  });
});
