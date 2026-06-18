# 08 · Day-before cron + run log

**Type:** HITL · **Label:** `ready-for-agent`

## Parent

`docs/prd/0001-pool-class-autobook-and-tracking.md`

## What to build

The automation payoff: the app books **AutoBook rules** the day before, with no
User action. A cron fires early on the eve of each class day, resolves each
enabled rule against the live current-week schedule by weekday + start time +
fuzzy name match, and books the single open match through the `PoolGateway`,
writing a Booking (`source: 'rule'`, with `ruleId`) plus a per-rule **run-log**
entry. It retries on not-yet-open / transient error until the outcome is
terminal (registered / already / full) or the class has started. A rule that
matches nothing tomorrow records `no-match` and books nothing — it never books
the wrong class. The run log is visible per rule in the UI.

Run-log entry shape:

```
runLog entry : { at, outcome, message }   // outcome ∈ registered|already|full|no-match|error
```

**HITL:** the pool's booking-open window and the right retry cadence must be
observed live to tune; real cron firing must be validated by a human.

## Acceptance criteria

- [ ] The cron resolves tomorrow's matching class for each enabled rule
- [ ] On a match it books via the gateway and writes a Booking (`source: 'rule'`) + a run-log entry
- [ ] No match → run-log `no-match`, no Booking, and never a wrong class
- [ ] Retry stops on registered / already / full / class-start
- [ ] `convex-test` (fake gateway + controlled clock) covers: resolution, no-match, retry-stop, run-log written — no real network
- [ ] The run log is visible per rule in the UI
- [ ] (HITL) live firing and the retry window are validated by a human

## Blocked by

- 06 · "Book now" (immediate Booking)
- 07 · AutoBook rule CRUD
