# 06 · "Book now" (immediate Booking)

**Type:** HITL · **Label:** `ready-for-agent`

## Parent

`docs/prd/0001-pool-class-autobook-and-tracking.md`

## What to build

A User looking at a class can press **Book now** and immediately reserve a spot,
seeing their true status afterward. This adds the booking half of the
`PoolGateway`: `book(pid, date, poolDetails)` performs the pool's four-step
cookie + multipart sequence (a port of the `fabb.py` reference) inside a Convex
Node action, and the pure parser `parseBookingResult(html) → status` classifies
the response. A **Booking** row is written with `source: 'now'` and the returned
status. The UI tells the User the pool will email a confirmation that also
carries the only working cancel link (ADR 0001).

Status vocabulary (from the `fabb.py` prototype — authoritative on the pool's
response strings):

```
registered | already | full | error
```

**HITL:** booking consumes a real, limited spot, so automated tests use a fake
gateway only. Before this slice is trusted, a human must verify one real live
booking succeeds end-to-end against the pool.

## Acceptance criteria

- [ ] `parseBookingResult` maps each pool response string to the right status (fixtures for registered / already / full / error)
- [ ] Book now writes a `bookings` row with `source: 'now'` and the returned status
- [ ] The UI shows booked / already-booked / full feedback truthfully, and never claims success on `error`
- [ ] The UI notes the pool's confirmation email carries the cancel link
- [ ] `convex-test` with a fake `PoolGateway` covers all four statuses → correct rows, with no real network
- [ ] (HITL) one real live booking is confirmed by a human before merge is trusted

## Blocked by

- 02 · Scrape & show this week's timetable
- 05 · Pool details onboarding + booking gate
