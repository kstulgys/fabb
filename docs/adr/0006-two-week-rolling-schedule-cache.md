# Two-week rolling schedule cache, daily refresh

> **Status**: Accepted — supersedes [ADR-0002](./0002-hybrid-schedule-caching.md).

ADR-0002 cached only the current Mon–Sun week, refreshed hourly. We now cache a
rolling **two-week Schedule window** (current + next week, Europe/Vilnius) and
refresh it **once daily** (~00:00 Vilnius, `0 22 * * *` UTC). Each week is
fetched from the pool's `?nuo=<monday>` page — one request per week, since a page
returns exactly one week — plus each class's event-modal detail. The hybrid
stable-vs-live split from ADR-0002 is unchanged: free-spot counts are still
fetched live at class-open and never cached.

## Why

- **Two weeks (bounded).** The pool publishes ≥3 weeks ahead; Users plan next
  week, most acutely on weekends when the current week is already spent. Fixed at
  two to keep pool load flat (ADR-0002's core concern) and the window predictable;
  bumping to three is a one-constant change.
- **Daily, not hourly.** The cached fields (name, time, intensity, calories,
  duration) are stable, and spot counts were never cached, so hourly bought
  almost no freshness for ~24× the pool requests. Midnight lands well before the
  05:00 UTC day-before autobook, so tomorrow's classes are always fresh before
  booking runs.
- **Fixes a latent bug.** The day-before autobook (`ruleContext`) resolves
  tomorrow's class from the cache. With only the current week cached, every
  **Sunday→Monday** booking resolved `no_match` (next Monday was never cached).
  Caching next week repairs it; a regression test guards it.

## Reconciliation — the non-obvious guard

The daily refresh upserts scraped classes and **deletes cached classes that have
vanished from the pool — but only for future dates (`date > today`), and only
within a week whose fetch succeeded.** Finished and today's classes are never
deleted because `attendance.convertCompletedBookings` reads the cached class row
to build the Training log; deleting a finished-but-unconverted class would
**silently lose attendance**. Do not "simplify" the future-only guard away, and
never treat a failed fetch as "all cancelled."

## Consequences

- Schedule and detail changes are up to ~24h stale (spot counts unaffected —
  always live). A same-day cancellation still books truthfully (`full`/`error`),
  never a false success.
- An empty cache (fresh deploy or data wipe) stays empty until the next midnight;
  kick `pool/scrape:scrapeWeek` once manually after such an event.
- `0 22 * * *` UTC is "00:00 Vilnius ±1h" across DST — irrelevant for a refresh.
- Past-week rows are still never pruned (pre-existing; deliberately out of scope —
  the table is tiny and pruning would brush against the week-bounded attendance
  conversion).
