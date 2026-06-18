import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/**
 * Scheduled jobs for the deployment.
 *
 * ADR-0002 (hybrid caching): a single centralized cron refreshes the shared
 * `classes` cache roughly hourly so every User reads the pool's current week
 * without anyone pressing a button and without per-user-view scraping — pool
 * load stays flat at any user count. The scrape
 * ({@link internal.pool.scrape.scrapeWeek}, slice 02) upserts keyed by
 * (pid, date), so a re-run refreshes rows in place and never duplicates them.
 *
 * Uses `crons.interval` per `convex/_generated/ai/guidelines.md` (the
 * `crons.hourly`/`daily`/`weekly` helpers are disallowed).
 */
const crons = cronJobs();

crons.interval(
  "refresh schedule",
  { hours: 1 },
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

export default crons;
