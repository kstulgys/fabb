# 07 · AutoBook rule CRUD

**Type:** AFK · **Label:** `ready-for-agent`

## Parent

`docs/prd/0001-pool-class-autobook-and-tracking.md`

## What to build

A User can set up and manage **AutoBook rules** — standing, recurring-weekly
instructions to book a class. From a class on the calendar they create a rule;
they can see all their rules, and enable, disable, or delete each. This slice is
management only — no cron/booking yet (that is slice 08).

The UI states plainly that disabling a rule stops *future* bookings but does
**not** cancel a Booking already placed (ADR 0001).

Rule shape:

```
autoBookRules : { userId, weekday, startTime, nameMatch, enabled }
```

## Acceptance criteria

- [ ] A User can create a rule from a class, capturing weekday, start time, and a name to match
- [ ] Rules are listed for the calling User only
- [ ] Enable, disable, and delete all work
- [ ] The disable affordance explains it will not cancel an already-placed booking
- [ ] `convex-test`: rule CRUD is scoped per User (one User cannot see/alter another's rules)

## Blocked by

- 02 · Scrape & show this week's timetable
- 05 · Pool details onboarding + booking gate
