# 03 · Hourly schedule-refresh cron

**Type:** AFK · **Label:** `ready-for-agent`

## Parent

`docs/prd/0001-pool-class-autobook-and-tracking.md`

## What to build

Keep the `classes` cache fresh automatically. A Convex cron runs hourly and
invokes the scrape action from slice 02, so the calendar reflects the pool's
current week without anyone pressing a button (ADR 0002 — centralized scraping
keeps pool load flat at any user count). Upserts are idempotent.

## Acceptance criteria

- [ ] A scheduled cron invokes the scrape roughly hourly
- [ ] Re-running the scrape produces no duplicate `classes` rows
- [ ] A schedule change on the pool is reflected in the calendar within about an hour

## Blocked by

- 02 · Scrape & show this week's timetable
