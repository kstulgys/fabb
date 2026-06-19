import { getFunctionName } from "convex/server";
import { expect, test } from "vitest";
import crons from "./crons";
import { internal } from "./_generated/api";

// The idempotency AC ("re-running produces no duplicate rows") is covered by
// `convex/scrape.test.ts`. This guards the wiring that schedule can't unit-test:
// the cron exists, fires ~hourly (ADR-0002 keeps pool load flat), and targets
// the real scrape action rather than some stale/renamed reference.
test("an hourly cron is registered against the real scrapeWeek action", () => {
  const job = crons.crons["refresh schedule"];

  expect(job).toBeDefined();
  expect(job.schedule).toEqual({ type: "interval", hours: 1 });
  expect(job.name).toBe(getFunctionName(internal.pool.scrape.scrapeWeek));
  expect(job.args).toEqual([{}]);
});

// The day-before AutoBook cron (issue 08): a once-daily job that books
// tomorrow's matching rules. Unit-asserting the wiring (a unit test can't fire
// a real cron) — it exists, runs on a daily cron spec, and targets the real
// runDayBefore mutation rather than a stale/renamed reference.
test("a daily day-before cron is registered against runDayBefore", () => {
  const job = crons.crons["auto-book day-before"];

  expect(job).toBeDefined();
  expect(job.schedule).toEqual({ type: "cron", cron: "0 5 * * *" });
  expect(job.name).toBe(getFunctionName(internal.autoBook.runDayBefore));
  expect(job.args).toEqual([{}]);
});

// The booking→Training-log conversion cron (issue 10): an hourly job that turns
// each completed Booking into one Training log. A unit test can't fire a real
// cron, so this guards the wiring — it exists, runs hourly, and targets the
// real convertCompletedBookings mutation rather than a stale/renamed reference.
test("an hourly conversion cron is registered against convertCompletedBookings", () => {
  const job = crons.crons["convert completed bookings"];

  expect(job).toBeDefined();
  expect(job.schedule).toEqual({ type: "interval", hours: 1 });
  expect(job.name).toBe(
    getFunctionName(internal.attendance.convertCompletedBookings),
  );
  expect(job.args).toEqual([{}]);
});
