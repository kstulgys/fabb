# 04 · Class detail + live free-spots

**Type:** AFK · **Label:** `ready-for-agent`

## Parent

`docs/prd/0001-pool-class-autobook-and-tracking.md`

## What to build

When a User opens a class, they see its live free-spot count so they can judge
whether it is worth booking before it fills. Availability is **volatile**, so it
is fetched live through the `PoolGateway` at open time (never cached — ADR 0002),
via the pure parser `parseAvailability(html) → { free, registered, max }`.

Classes that have already finished or are in progress *today* are visibly marked,
and a finished class cannot be booked.

## Acceptance criteria

- [ ] `parseAvailability` returns `{ free, registered, max }` from recorded class-modal HTML fixtures
- [ ] Opening a class shows its current live free-spot count
- [ ] Today's finished classes are marked "finished" and are not bookable
- [ ] A class in progress right now is marked as such

## Blocked by

- 02 · Scrape & show this week's timetable
