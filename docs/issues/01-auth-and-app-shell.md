# 01 · Auth + app shell

**Type:** AFK · **Label:** `ready-for-agent`

## Parent

`docs/prd/0001-pool-class-autobook-and-tracking.md`

## What to build

The signed-in foundation every other slice sits on. A visitor can create an
account and sign in with email/password (Convex Auth); a signed-in **User**
lands on an empty Chakra-UI dashboard shell and can sign out; an unauthenticated
visitor is sent to sign-in. A `users` record is created per account, and Convex
functions resolve the current User from the auth identity so that every
User's data is isolated from others.

Convex is already initialized (`convex/` exists and `convex dev` is running) —
do **not** re-init it. Add Convex Auth and Chakra UI (with its style engine),
wire the Convex client provider and the Chakra provider at the app root.

## Acceptance criteria

- [ ] A new visitor can sign up with email + password and ends up signed in
- [ ] A returning User can sign in and sign out
- [ ] Visiting the dashboard while unauthenticated redirects to sign-in
- [ ] A `users` record exists per account; Convex queries resolve the calling User from the auth identity
- [ ] The app renders inside both the Convex client provider and Chakra UI's provider (theme applied)
- [ ] `convex-test` proves a query returns only the calling User's rows (per-User isolation)

## Blocked by

None - can start immediately
