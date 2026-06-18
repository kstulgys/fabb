import { describe, expect, test } from "vitest";
import { WEEKDAY_LABELS, weekDatesFor } from "./week";

describe("weekDatesFor (Europe/Vilnius)", () => {
  test("returns the seven Mon→Sun dates for a midweek instant", () => {
    // 2026-06-18 is a Thursday.
    expect(weekDatesFor(new Date("2026-06-18T10:00:00Z"))).toEqual([
      "2026-06-15",
      "2026-06-16",
      "2026-06-17",
      "2026-06-18",
      "2026-06-19",
      "2026-06-20",
      "2026-06-21",
    ]);
  });

  test("treats Monday as the first day of its own week", () => {
    expect(weekDatesFor(new Date("2026-06-15T08:00:00Z"))[0]).toBe("2026-06-15");
  });

  test("treats Sunday as the last day, not the start of the next week", () => {
    const dates = weekDatesFor(new Date("2026-06-21T08:00:00Z"));
    expect(dates[0]).toBe("2026-06-15");
    expect(dates[6]).toBe("2026-06-21");
  });

  test("uses the Vilnius civil date, not UTC, at the day boundary", () => {
    // 22:30Z Sunday is already Monday 01:30 in Vilnius (UTC+3 in summer), so
    // the week is the next one. A naive UTC computation would still say Sunday.
    expect(weekDatesFor(new Date("2026-06-21T22:30:00Z"))[0]).toBe("2026-06-22");
  });

  test("exposes seven Monday-first weekday labels", () => {
    expect(WEEKDAY_LABELS.length).toBe(7);
    expect(WEEKDAY_LABELS[0]).toBe("Monday");
    expect(WEEKDAY_LABELS[6]).toBe("Sunday");
  });
});
