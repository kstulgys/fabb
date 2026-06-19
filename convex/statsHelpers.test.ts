import { describe, expect, test } from "vitest";
import {
  currentStreak,
  inPeriod,
  periodTotals,
  type StatLog,
  topClassTypes,
  weeklySeries,
  weekStart,
} from "./statsHelpers";

// Canonical "today" for the suite: 2026-06-18 is a Thursday, so its Vilnius
// Mon–Sun week is 2026-06-15 … 2026-06-21 and its month is 2026-06.
const TODAY = "2026-06-18";

/** Terse log builder — only the fields the math reads. */
function log(date: string, over: Partial<StatLog> = {}): StatLog {
  return { date, className: over.className ?? "Aqua", ...over };
}

describe("weekStart (Vilnius week boundaries)", () => {
  test("a Monday is its own week start", () => {
    expect(weekStart("2026-06-15")).toBe("2026-06-15");
  });

  test("a Sunday belongs to the week that began the prior Monday", () => {
    // 2026-06-14 is a Sunday → its week started Monday 2026-06-08, NOT 06-15.
    expect(weekStart("2026-06-14")).toBe("2026-06-08");
  });

  test("a midweek day maps back to its Monday", () => {
    expect(weekStart("2026-06-18")).toBe("2026-06-15");
  });
});

describe("inPeriod", () => {
  test("week includes Monday..Sunday and excludes the days either side", () => {
    expect(inPeriod("2026-06-15", "week", TODAY)).toBe(true); // Monday
    expect(inPeriod("2026-06-21", "week", TODAY)).toBe(true); // Sunday
    expect(inPeriod("2026-06-14", "week", TODAY)).toBe(false); // prev Sunday
    expect(inPeriod("2026-06-22", "week", TODAY)).toBe(false); // next Monday
  });

  test("month matches the calendar month and excludes adjacent months", () => {
    expect(inPeriod("2026-06-01", "month", TODAY)).toBe(true);
    expect(inPeriod("2026-06-30", "month", TODAY)).toBe(true);
    expect(inPeriod("2026-05-31", "month", TODAY)).toBe(false);
    expect(inPeriod("2026-07-01", "month", TODAY)).toBe(false);
  });

  test("all admits any date", () => {
    expect(inPeriod("2020-01-01", "all", TODAY)).toBe(true);
  });
});

describe("periodTotals", () => {
  const logs = [
    log("2026-06-16", { kcalMin: 300, kcalMax: 450 }), // this week, mid 375
    log("2026-06-18", { kcalMin: 200, kcalMax: 400 }), // this week, mid 300
    log("2026-06-17"), // this week, NULL calories
    log("2026-06-10", { kcalMin: 100, kcalMax: 200 }), // last week (same month), mid 150
    log("2026-05-20", { kcalMin: 500, kcalMax: 600 }), // last month, mid 550
  ];

  test("week sums midpoints and counts the null-Calorie class as attendance", () => {
    // 3 classes this week; calories 375 + 300 (the null log adds nothing).
    expect(periodTotals(logs, "week", TODAY)).toEqual({
      classes: 3,
      calories: 675,
    });
  });

  test("month scopes to the calendar month", () => {
    expect(periodTotals(logs, "month", TODAY)).toEqual({
      classes: 4,
      calories: 825, // 375 + 300 + 150
    });
  });

  test("all spans every log", () => {
    expect(periodTotals(logs, "all", TODAY)).toEqual({
      classes: 5,
      calories: 1375, // 675 + 150 + 550
    });
  });
});

describe("weeklySeries", () => {
  test("buckets by Monday, sums midpoints, and orders ascending", () => {
    const series = weeklySeries([
      log("2026-06-18", { kcalMin: 200, kcalMax: 400 }), // week 06-15, mid 300
      log("2026-06-16"), // week 06-15, null
      log("2026-06-08", { kcalMin: 100, kcalMax: 200 }), // week 06-08, mid 150
    ]);
    expect(series).toEqual([
      { week: "2026-06-08", classes: 1, calories: 150 },
      { week: "2026-06-15", classes: 2, calories: 300 },
    ]);
  });
});

describe("currentStreak", () => {
  test("counts consecutive active weeks ending at the current week", () => {
    const streak = currentStreak(
      [log("2026-06-16"), log("2026-06-10"), log("2026-06-03")],
      TODAY,
    );
    expect(streak).toBe(3); // weeks 06-15, 06-08, 06-01
  });

  test("stops at the first gap", () => {
    const streak = currentStreak(
      [log("2026-06-16"), log("2026-06-10"), /* gap: no 06-01 week */ log("2026-05-20")],
      TODAY,
    );
    expect(streak).toBe(2);
  });

  test("a Sunday log bridges to the prior week (Vilnius boundary)", () => {
    // 06-14 is Sunday → week 06-08; counting it as the current week would yield
    // a streak of 1 instead of 3.
    const streak = currentStreak(
      [log("2026-06-15"), log("2026-06-14"), log("2026-06-01")],
      TODAY,
    );
    expect(streak).toBe(3); // weeks 06-15, 06-08, 06-01
  });

  test("a fresh empty week keeps the run via last week (one-week grace)", () => {
    // today is Monday 2026-06-22 — the new week has no logs yet.
    const streak = currentStreak([log("2026-06-18"), log("2026-06-08")], "2026-06-22");
    expect(streak).toBe(2); // anchored at last week 06-15, then 06-08
  });

  test("is zero once the last activity is two or more weeks old", () => {
    // last activity week is 06-15; today 06-29 → neither this nor last week active.
    expect(currentStreak([log("2026-06-18")], "2026-06-29")).toBe(0);
  });

  test("is zero with no logs", () => {
    expect(currentStreak([], TODAY)).toBe(0);
  });
});

describe("topClassTypes", () => {
  test("ranks by count descending, className ascending on ties", () => {
    const top = topClassTypes([
      log("2026-06-01", { className: "Aqua" }),
      log("2026-06-02", { className: "Aqua" }),
      log("2026-06-03", { className: "Aqua" }),
      log("2026-06-04", { className: "Spin" }),
      log("2026-06-05", { className: "Yoga" }), // tie with Spin → Spin first (S < Y)
    ]);
    expect(top).toEqual([
      { className: "Aqua", count: 3 },
      { className: "Spin", count: 1 },
      { className: "Yoga", count: 1 },
    ]);
  });

  test("respects the limit", () => {
    const logs = ["A", "B", "C", "D", "E", "F"].map((c, i) =>
      log(`2026-06-0${i + 1}`, { className: c }),
    );
    expect(topClassTypes(logs, 3)).toHaveLength(3);
  });
});
