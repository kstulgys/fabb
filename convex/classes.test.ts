/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("weekClasses", () => {
  test("returns the current Vilnius week grouped by day, time-sorted, excluding other weeks", async () => {
    const t = convexTest(schema, modules);
    // Pinned to the canonical Thursday (2026-06-18); its Vilnius week is
    // 2026-06-15 … 06-21. Passing `now` makes the window deterministic.
    const now = Date.parse("2026-06-18T10:00:00Z");
    const monday = "2026-06-15";
    const wednesday = "2026-06-17";
    const lastWeek = "2026-06-08";

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
      .query(api.classes.weekClasses, { now });

    expect(week.weekStart).toBe(monday);
    expect(week.weekEnd).toBe("2026-06-21");
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

describe("scheduleWeeks", () => {
  test("returns both weeks (current then next), grouped Mon→Sun and time-sorted, excluding out-of-window dates", async () => {
    const t = convexTest(schema, modules);
    // Pinned to the canonical Thursday (2026-06-18); its Vilnius week is
    // 2026-06-15 … 06-21 and the next is 06-22 … 06-28.
    const now = Date.parse("2026-06-18T10:00:00Z");

    const userId = await t.run(async (ctx) => {
      // Current-week Monday: two classes out of time order (proves sorting).
      await ctx.db.insert("classes", {
        date: "2026-06-15", startTime: "09:00", endTime: "09:50", pid: "1",
        name: "Late", intensity: 2, kcalMin: 500, kcalMax: 800, durationMin: 50,
      });
      await ctx.db.insert("classes", {
        date: "2026-06-15", startTime: "07:00", endTime: "07:50", pid: "2",
        name: "Early", intensity: 1, durationMin: 50,
      });
      // A next-week class must land in week 2, not week 1.
      await ctx.db.insert("classes", {
        date: "2026-06-23", startTime: "18:00", endTime: "18:50", pid: "3",
        name: "NextTue", intensity: 3, durationMin: 45,
      });
      // Last week and the week after the window must both be excluded.
      await ctx.db.insert("classes", {
        date: "2026-06-08", startTime: "07:00", endTime: "07:50", pid: "4",
        name: "Old", intensity: 1, durationMin: 50,
      });
      await ctx.db.insert("classes", {
        date: "2026-06-29", startTime: "07:00", endTime: "07:50", pid: "5",
        name: "Beyond", intensity: 1, durationMin: 50,
      });
      return await ctx.db.insert("users", { email: "u@example.com" });
    });

    const { weeks } = await t
      .withIdentity({ subject: userId })
      .query(api.classes.scheduleWeeks, { now });

    expect(weeks).toHaveLength(2);

    // Week 1 is the current Vilnius week, Monday-first and time-sorted.
    expect(weeks[0].weekStart).toBe("2026-06-15");
    expect(weeks[0].weekEnd).toBe("2026-06-21");
    expect(weeks[0].days).toHaveLength(7);
    expect(weeks[0].days[0].weekday).toBe("Monday");
    expect(weeks[0].days[6].weekday).toBe("Sunday");
    expect(weeks[0].days[0].classes.map((c) => c.name)).toEqual([
      "Early",
      "Late",
    ]);

    // Week 2 is the next Vilnius week, holding the next-week class on Tuesday.
    expect(weeks[1].weekStart).toBe("2026-06-22");
    expect(weeks[1].weekEnd).toBe("2026-06-28");
    expect(weeks[1].days).toHaveLength(7);
    expect(weeks[1].days[1].weekday).toBe("Tuesday");
    expect(weeks[1].days[1].classes.map((c) => c.name)).toEqual(["NextTue"]);

    // Neither out-of-window class appears in either week.
    const allNames = weeks.flatMap((w) =>
      w.days.flatMap((d) => d.classes.map((c) => c.name)),
    );
    expect(allNames).not.toContain("Old");
    expect(allNames).not.toContain("Beyond");
  });

  test("rejects an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.classes.scheduleWeeks, {})).rejects.toThrow(
      "Not authenticated",
    );
  });
});

describe("reconcileWeek", () => {
  const base = {
    date: "2026-06-15", startTime: "07:00", endTime: "07:50", pid: "258",
    name: "TRX treniruotė", intensity: 2, durationMin: 50,
  };
  // A single-week range with `today` on the row's day, so the upsert-focused
  // cases below never trip the future-only delete path.
  const week = {
    weekStart: "2026-06-15",
    weekEnd: "2026-06-21",
    today: "2026-06-15",
  };

  test("re-running over the same (pid,date) refreshes the row instead of duplicating", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.classes.reconcileWeek, {
      classes: [{ ...base, kcalMin: 500, kcalMax: 800 }],
      ...week,
    });
    await t.mutation(internal.classes.reconcileWeek, {
      classes: [{ ...base, name: "TRX (renamed)", kcalMin: 100, kcalMax: 200 }],
      ...week,
    });

    const rows = await t.run((ctx) => ctx.db.query("classes").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("TRX (renamed)");
    expect(rows[0].kcalMin).toBe(100);
  });

  test("re-running with absent calories clears the previously stored range", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.classes.reconcileWeek, {
      classes: [{ ...base, kcalMin: 800, kcalMax: 1400 }],
      ...week,
    });
    await t.mutation(internal.classes.reconcileWeek, {
      classes: [base],
      ...week,
    });

    const rows = await t.run((ctx) => ctx.db.query("classes").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].kcalMin).toBeUndefined();
  });

  test("deletes only future vanished classes in range; preserves finished/today and refreshes present ones", async () => {
    const t = convexTest(schema, modules);
    // Pre-existing cache: past, today, and future classes all ABSENT from the
    // fresh scrape, plus one present-but-changed class the scrape still returns.
    await t.run(async (ctx) => {
      await ctx.db.insert("classes", { ...base, pid: "PAST", date: "2026-06-16", name: "Past" });
      await ctx.db.insert("classes", { ...base, pid: "TODAY", date: "2026-06-18", name: "Today" });
      await ctx.db.insert("classes", { ...base, pid: "FUTURE", date: "2026-06-20", name: "Future" });
      await ctx.db.insert("classes", { ...base, pid: "KEEP", date: "2026-06-19", name: "Stale", startTime: "23:59" });
    });

    const result = await t.mutation(internal.classes.reconcileWeek, {
      classes: [{ ...base, pid: "KEEP", date: "2026-06-19", name: "Fresh", startTime: "07:00" }],
      weekStart: "2026-06-15",
      weekEnd: "2026-06-21",
      today: "2026-06-18",
    });

    const rows = await t.run((ctx) => ctx.db.query("classes").collect());
    // Future + absent → deleted; finished/today + absent → preserved (invariant 1).
    expect(rows.map((r) => r.pid).sort()).toEqual(["KEEP", "PAST", "TODAY"]);
    // Present in the scrape → refreshed in place; a still-offered future row is kept.
    const keep = rows.find((r) => r.pid === "KEEP");
    expect(keep?.name).toBe("Fresh");
    expect(keep?.startTime).toBe("07:00");
    expect(result).toEqual({ upserted: 1, deleted: 1 });
  });
});
