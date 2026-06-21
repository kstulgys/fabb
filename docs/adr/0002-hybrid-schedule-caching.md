# Hybrid schedule caching

> **Status**: Superseded by [ADR-0006](./0006-two-week-rolling-schedule-cache.md).
> The cache is now a rolling **two-week** Schedule window refreshed **daily**, not
> the current week hourly. The hybrid split this ADR established — stable fields
> cached, volatile free-spot counts fetched live — still holds.

The pool publishes its timetable as scraped HTML and has no API; the browser
cannot fetch it (CORS + PHP session), so all reads go through Convex. We cache
the **stable** part of the week's schedule (class name, time, `pid`, date,
calories, duration) via a single hourly Convex cron into a `classes` table that
all Users read reactively, and fetch the **volatile** free-spot count live only
when a User opens a class or is about to book.

Rationale (not visible in code): scraping per-user-view from one server IP would
multiply load and risk the pool rate-limiting or banning us; centralizing reads
to one cron keeps load flat at any user count while keeping spot counts accurate
at the only moment they matter — the booking decision. Bookings remain per-User
(unavoidable) and can be staggered if the pool objects.
