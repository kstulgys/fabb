import { describe, expect, test } from "vitest";
import {
  classStatus,
  isoWeekday,
  tomorrowDate,
  WEEKDAY_LABELS,
  weekDatesFor,
  weekdayLabel,
} from "./week";

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

describe("tomorrowDate (Europe/Vilnius)", () => {
  test("returns the next civil day for a midday instant", () => {
    // 2026-06-18 (Thu) → 2026-06-19 (Fri).
    expect(tomorrowDate(new Date("2026-06-18T10:00:00Z"))).toBe("2026-06-19");
  });

  test("rolls over month and year boundaries", () => {
    expect(tomorrowDate(new Date("2026-06-30T10:00:00Z"))).toBe("2026-07-01");
    expect(tomorrowDate(new Date("2026-12-31T10:00:00Z"))).toBe("2027-01-01");
  });

  test("uses the Vilnius civil date, not UTC, at the day boundary", () => {
    // 22:30Z on the 18th is already 01:30 on the 19th in Vilnius (UTC+3), so
    // "tomorrow" is the 20th. A naive UTC computation would say the 19th.
    expect(tomorrowDate(new Date("2026-06-18T22:30:00Z"))).toBe("2026-06-20");
  });

  test("tomorrow's ISO weekday is what the cron matches rules against", () => {
    const date = tomorrowDate(new Date("2026-06-18T10:00:00Z"));
    expect(date).toBe("2026-06-19");
    expect(isoWeekday(date)).toBe(5); // Friday
  });
});

describe("isoWeekday + weekdayLabel", () => {
  test("maps ISO dates to ISO-8601 weekdays (Mon=1 … Sun=7)", () => {
    expect(isoWeekday("2026-06-15")).toBe(1); // Monday
    expect(isoWeekday("2026-06-18")).toBe(4); // Thursday
    expect(isoWeekday("2026-06-21")).toBe(7); // Sunday
  });

  test("agrees with weekDatesFor's Monday-first ordering", () => {
    const dates = weekDatesFor(new Date("2026-06-18T08:00:00Z"));
    dates.forEach((date, i) => expect(isoWeekday(date)).toBe(i + 1));
  });

  test("weekdayLabel maps an ISO weekday to its Monday-first label", () => {
    expect(weekdayLabel(1)).toBe("Monday");
    expect(weekdayLabel(4)).toBe("Thursday");
    expect(weekdayLabel(7)).toBe("Sunday");
  });
});

describe("classStatus (Europe/Vilnius)", () => {
  // A Thursday class, 07:00–07:50. Vilnius is UTC+3 in June, so its wall-clock
  // window 07:00–07:50 is 04:00Z–04:50Z.
  const cls = { date: "2026-06-18", startTime: "07:00", endTime: "07:50" };

  test("before the start it is upcoming and bookable", () => {
    expect(classStatus(cls, new Date("2026-06-18T03:59:00Z"))).toEqual({
      status: "upcoming",
      bookable: true,
    });
  });

  test("exactly at the start it is in-progress and bookable", () => {
    expect(classStatus(cls, new Date("2026-06-18T04:00:00Z"))).toEqual({
      status: "in-progress",
      bookable: true,
    });
  });

  test("mid-class it is in-progress", () => {
    expect(classStatus(cls, new Date("2026-06-18T04:20:00Z")).status).toBe(
      "in-progress",
    );
  });

  test("exactly at the end it is finished and not bookable", () => {
    expect(classStatus(cls, new Date("2026-06-18T04:50:00Z"))).toEqual({
      status: "finished",
      bookable: false,
    });
  });

  test("after the end it is finished and not bookable", () => {
    expect(classStatus(cls, new Date("2026-06-18T05:30:00Z"))).toEqual({
      status: "finished",
      bookable: false,
    });
  });

  test("a class on an earlier day this week is finished", () => {
    // now = Thursday 08:00 Vilnius; the class is on Wednesday.
    expect(
      classStatus(
        { date: "2026-06-17", startTime: "07:00", endTime: "07:50" },
        new Date("2026-06-18T05:00:00Z"),
      ),
    ).toEqual({ status: "finished", bookable: false });
  });

  test("a class on a later day this week is upcoming regardless of clock", () => {
    // now = Thursday 23:00 Vilnius; the class is on Friday morning.
    expect(
      classStatus(
        { date: "2026-06-19", startTime: "07:00", endTime: "07:50" },
        new Date("2026-06-18T20:00:00Z"),
      ),
    ).toEqual({ status: "upcoming", bookable: true });
  });

  test("uses the Vilnius civil date, not UTC, at the day boundary", () => {
    // 21:30Z is already 00:30 Friday in Vilnius. The Friday class is today (and
    // still upcoming at 00:30); the Thursday class is now a past day → finished.
    const friNow = new Date("2026-06-18T21:30:00Z");
    expect(
      classStatus({ date: "2026-06-19", startTime: "07:00", endTime: "07:50" }, friNow)
        .status,
    ).toBe("upcoming");
    expect(classStatus(cls, friNow).status).toBe("finished");
  });

  test("falls back to the start time when the source omits the end", () => {
    const noEnd = { date: "2026-06-18", startTime: "07:00", endTime: "" };
    // 06:30 Vilnius (03:30Z): still upcoming.
    expect(classStatus(noEnd, new Date("2026-06-18T03:30:00Z")).status).toBe(
      "upcoming",
    );
    // 07:30 Vilnius (04:30Z): past the (start-as-end) boundary → finished.
    expect(classStatus(noEnd, new Date("2026-06-18T04:30:00Z")).status).toBe(
      "finished",
    );
  });
});
