# 02 · Scrape & show this week's timetable

**Type:** AFK · **Label:** `ready-for-agent`

## Parent

`docs/prd/0001-pool-class-autobook-and-tracking.md`

## What to build

A signed-in User opens the app and sees the current Mon–Sun week of pool classes
in a Chakra calendar, grouped by day. Each class shows its name, start–end time,
intensity (hearts), **Calories** range, and duration. The UI makes clear that
only the current week is available.

All pool I/O lives behind a `PoolGateway`; parsing is a pure function
`parseSchedule(html) → Class[]`. A Convex action (manually invocable for now)
scrapes the schedule through the gateway and upserts the **stable** fields into
a `classes` cache table that the calendar reads reactively (ADR 0002). Free-spot
counts are NOT part of this slice.

Decision shape (from prototype exploration of the pool's pages):

```
classes : { date, startTime, endTime, pid, name, intensity,
            kcalMin?, kcalMax?, durationMin }
```

Calories appear on the class as a published range string like `500-800 kcal.`
and are **absent on some classes** (e.g. "Fat Killer") → store `null`.

## Acceptance criteria

- [ ] `parseSchedule` returns the correct `Class[]` from recorded schedule HTML fixtures, including both name-markup variants
- [ ] Calorie range parses into `kcalMin`/`kcalMax`; absent → `null` (fixture: a class with no calories)
- [ ] The scrape action upserts the week into `classes` with no duplicate rows on re-run
- [ ] The calendar renders the week from `classes`, grouped by day, showing name, time, intensity, calorie range, duration
- [ ] A class with absent calories renders as "—" rather than a broken value

## Blocked by

- 01 · Auth + app shell
