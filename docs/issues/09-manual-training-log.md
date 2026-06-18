# 09 · Manual Training log + history

**Type:** AFK · **Label:** `ready-for-agent`

## Parent

`docs/prd/0001-pool-class-autobook-and-tracking.md`

## What to build

A User can record a class they attended even when they never booked it through
the app, and review their history. They add a **Training log** either by picking
a current-week class (name, intensity, and Calories auto-filled from the
`classes` cache) or by typing the details for a past class no longer published.
A manual log has no linked Booking. The history view lists the User's logs, and
each can be edited or deleted. A class with no published Calories is still
loggable (calories left blank).

Training log shape:

```
trainingLogs : { userId, className, date, intensity, kcalMin?, kcalMax?,
                 attended, bookingId? }   // manual ⇒ bookingId absent
```

## Acceptance criteria

- [ ] A User can add a log by picking a current-week class → fields auto-filled
- [ ] A User can add a log by typing details for a class not in the schedule
- [ ] Manual logs have no `bookingId`
- [ ] The history view lists the calling User's logs; edit and delete work
- [ ] A log with no Calories is accepted and stored

## Blocked by

- 02 · Scrape & show this week's timetable
