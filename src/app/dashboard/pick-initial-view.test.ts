import { describe, expect, test } from "vitest";
import { pickInitialView } from "./pick-initial-view";
import { WEEKDAY_LABELS } from "../../../convex/week";
import type { WeekClasses } from "../../../convex/classes";
import type { Doc, Id } from "../../../convex/_generated/dataModel";

// pickInitialView consults a class only through `classStatus`, which reads just
// date + start/end. The remaining columns are constant filler so each fixture is
// a real `Doc<"classes">`; calories/duration are optional, hence omitted.
const klass = (date: string, startTime: string, endTime: string): Doc<"classes"> => ({
  // A class's `_id` is a branded string the helper never reads; any unique value
  // is fine. One branded cast keeps the fixture a real Doc without a structural
  // double-cast.
  _id: `${date}T${startTime}` as Id<"classes">,
  _creationTime: 0,
  date,
  startTime,
  endTime,
  pid: "fab",
  name: "Class",
  intensity: 1,
});

// A Mon→Sun week from its seven ISO dates. `classes` maps a date to its
// [start, end] times; any date omitted is an empty day.
const week = (
  dates: readonly string[],
  classes: Record<string, ReadonlyArray<readonly [string, string]>> = {},
): WeekClasses => ({
  weekStart: dates[0],
  weekEnd: dates[6],
  days: dates.map((date, i) => ({
    weekday: WEEKDAY_LABELS[i],
    date,
    classes: (classes[date] ?? []).map(([s, e]) => klass(date, s, e)),
  })),
});

// 2026-06-15 (Mon) … 06-21 (Sun) is the canonical current week; the next is
// 06-22 … 06-28. Europe/Vilnius runs UTC+3 (EEST) in June, so the pinned UTC
// instants below sit +3h on the wall clock.
const W0 = [
  "2026-06-15",
  "2026-06-16",
  "2026-06-17",
  "2026-06-18",
  "2026-06-19",
  "2026-06-20",
  "2026-06-21",
] as const;
const W1 = [
  "2026-06-22",
  "2026-06-23",
  "2026-06-24",
  "2026-06-25",
  "2026-06-26",
  "2026-06-27",
  "2026-06-28",
] as const;

describe("pickInitialView", () => {
  test("mid-week with an upcoming class today → current week, anchored on today", () => {
    // Thursday 13:00 Vilnius; today's 18:00 class is still upcoming.
    const now = new Date("2026-06-18T10:00:00Z");
    const weeks = [
      week(W0, {
        "2026-06-18": [
          ["08:00", "09:00"],
          ["18:00", "19:00"],
        ],
      }),
      week(W1, { "2026-06-23": [["07:00", "08:00"]] }),
    ];
    expect(pickInitialView(weeks, now)).toEqual({
      weekIndex: 0,
      date: "2026-06-18",
    });
  });

  test("today empty but a later class this week is upcoming → still current week, anchored on today", () => {
    // Thursday 13:00 Vilnius; today has no class, but Friday's does.
    const now = new Date("2026-06-18T10:00:00Z");
    const weeks = [
      week(W0, { "2026-06-19": [["07:00", "08:00"]] }),
      week(W1, { "2026-06-22": [["07:00", "08:00"]] }),
    ];
    expect(pickInitialView(weeks, now)).toEqual({
      weekIndex: 0,
      date: "2026-06-18",
    });
  });

  test("weekend-spent current week (Sunday, all finished) → next week's first class day", () => {
    // Sunday 22:00 Vilnius; every current-week class is on an earlier day.
    const now = new Date("2026-06-21T19:00:00Z");
    const weeks = [
      week(W0, {
        "2026-06-15": [["07:00", "08:00"]],
        "2026-06-20": [["09:00", "10:00"]],
      }),
      week(W1, {
        "2026-06-23": [["07:00", "08:00"]],
        "2026-06-25": [["07:00", "08:00"]],
      }),
    ];
    expect(pickInitialView(weeks, now)).toEqual({
      weekIndex: 1,
      date: "2026-06-23",
    });
  });

  test("current week present but no upcoming class (mid-week, rest of week empty) → next week", () => {
    // Wednesday 19:00 Vilnius; Wed's only class has ended and Thu–Sun are empty.
    const now = new Date("2026-06-17T16:00:00Z");
    const weeks = [
      week(W0, {
        "2026-06-15": [["07:00", "08:00"]],
        "2026-06-17": [["07:00", "08:00"]],
      }),
      week(W1, { "2026-06-22": [["07:00", "08:00"]] }),
    ];
    expect(pickInitialView(weeks, now)).toEqual({
      weekIndex: 1,
      date: "2026-06-22",
    });
  });

  test("empty current week → next week's first class day", () => {
    const now = new Date("2026-06-17T16:00:00Z");
    const weeks = [week(W0), week(W1, { "2026-06-24": [["07:00", "08:00"]] })];
    expect(pickInitialView(weeks, now)).toEqual({
      weekIndex: 1,
      date: "2026-06-24",
    });
  });

  test("both weeks empty → next week, anchored on its Monday (fallback)", () => {
    const now = new Date("2026-06-17T16:00:00Z");
    const weeks = [week(W0), week(W1)];
    expect(pickInitialView(weeks, now)).toEqual({
      weekIndex: 1,
      date: "2026-06-22",
    });
  });
});
