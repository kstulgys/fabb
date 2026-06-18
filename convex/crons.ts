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

export default crons;
