# 10 · Auto-convert Booking → Training log + "didn't go"

**Type:** AFK · **Label:** `ready-for-agent`

## Parent

`docs/prd/0001-pool-class-autobook-and-tracking.md`

## What to build

A User's history fills itself. A cron running after a class's end time turns each
completed **Booking** (any source — rule or "Book now") into exactly one
**Training log** with `attended: true`, the class's Calories, and the originating
`bookingId`. Because a User may book but not show up, they can toggle a log to
**"didn't go"** (`attended: false`), which excludes it from statistics. The
conversion is idempotent — a Booking is never turned into two logs.

## Acceptance criteria

- [ ] After a class's end time, each completed Booking yields one Training log with `attended: true` and the class's Calories
- [ ] Re-running the cron never double-creates a log for the same Booking (idempotent via `bookingId`)
- [ ] A User can toggle a log to "didn't go", setting `attended: false`
- [ ] `convex-test` (controlled clock) covers conversion, idempotency, and the toggle

## Blocked by

- 06 · "Book now" (immediate Booking)
- 09 · Manual Training log + history
