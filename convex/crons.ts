import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/**
 * Scheduled jobs for the deployment.
 *
 * ADR-0006 (two-week rolling cache, supersedes ADR-0002): a single centralized
 * cron refreshes the shared `classes` cache once daily so every User reads the
 * pool's two-week Schedule window (current + next week) without anyone pressing
 * a button and without per-user-view scraping — pool load stays flat at any user
 * count. The scrape ({@link internal.pool.scrape.scrapeWeek}, slice 02) upserts
 * keyed by (pid, date), so a re-run refreshes rows in place and never duplicates
 * them.
 *
 * `crons.cron` takes a UTC spec, so `0 22 * * *` fires ~00:00 Europe/Vilnius
 * (±1h across DST — irrelevant for a refresh), landing well before the 05:00 UTC
 * day-before autobook so tomorrow's classes are fresh before booking runs. Uses
 * `crons.cron` per `convex/_generated/ai/guidelines.md` (the
 * `crons.hourly`/`daily`/`weekly` helpers are disallowed).
 */
const crons = cronJobs();

crons.cron(
  "refresh schedule",
  "0 22 * * *", // 22:00 UTC daily (~00:00 Vilnius)
  internal.pool.scrape.scrapeWeek,
  {},
);

/**
 * The day-before AutoBook cron (issue 08). Once a day, early on the eve of each
 * class day, it books every enabled rule's matching class for TOMORROW
 * (Europe/Vilnius) — see {@link internal.autoBook.runDayBefore}. `crons.cron`
 * takes a UTC spec, so this fires ~early-morning Vilnius.
 *
 * HITL: the exact hour here and the retry cadence (`RETRY_BACKOFF_MS` in
 * `autoBookAttempt.ts`) must be tuned LIVE against the pool's booking-open
 * window; live firing is validated by a human, not in tests.
 */
const DAY_BEFORE_CRON = "0 5 * * *"; // 05:00 UTC daily

crons.cron(
  "auto-book day-before",
  DAY_BEFORE_CRON,
  internal.autoBook.runDayBefore,
  {},
);

/**
 * The booking→Training-log conversion cron (issue 10). Hourly, it turns each
 * completed Booking — a held spot (`registered`/`already`) whose class end time
 * has passed (Europe/Vilnius) — into exactly one Training log; see
 * {@link internal.attendance.convertCompletedBookings}. Hourly matches the
 * schedule-refresh cadence and converts each finished class well within the
 * week it stays cached. The conversion is idempotent (dedupe on `bookingId`),
 * so the cadence affects only promptness, never correctness.
 */
crons.interval(
  "convert completed bookings",
  { hours: 1 },
  internal.attendance.convertCompletedBookings,
  {},
);

export default crons;
