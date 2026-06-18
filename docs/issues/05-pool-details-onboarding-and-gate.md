# 05 · Pool details onboarding + booking gate

**Type:** AFK · **Label:** `ready-for-agent`

## Parent

`docs/prd/0001-pool-class-autobook-and-tracking.md`

## What to build

A User stores their **Pool details** — name, surname, phone, email — once, and
can edit them later in settings. These four fields are the User's identity *to
the pool* (the pool keys bookings off the email) and are submitted on every
Booking. Until all four are present, every booking entry point is **gated** with
a clear "complete your details" prompt. Pool details are server-only and never
exposed to other Users.

## Acceptance criteria

- [ ] A User can enter and save all four Pool details during onboarding
- [ ] An invalid email or phone (`+370…`) is rejected with a message
- [ ] Pool details are editable later in settings
- [ ] Booking actions refuse with a clear prompt when details are incomplete
- [ ] `convex-test`: a booking mutation/action errors when details are missing and succeeds (with a fake gateway) when present
- [ ] Pool details are never returned by any query callable by another User

## Blocked by

- 01 · Auth + app shell
