# PRD: Pool class auto-booking & training tracker

> Domain vocabulary per `CONTEXT.md` (User, AutoBook rule, Booking, Training log,
> Calories, Pool details). Respects `docs/adr/0001` (no server-side
> cancellation) and `docs/adr/0002` (hybrid schedule caching).

## Problem Statement

People who train at the Fabijoniškės pool (Fabijoniškių baseinas) want to attend
its group classes regularly, but the only way to reserve a spot is the pool's bare
website: it shows a single Mon–Sun week at a time, has no accounts, no reminders,
and no history. Popular classes fill up, so a User has to remember to open the site
and re-book the same class every week — and once they have attended, there is no
record anywhere of what they did, how often, or how much energy they spent. They
cannot see whether they are improving or staying consistent.

## Solution

A multi-user web app where a User signs in, stores their Pool details once, and
then:

- browses the pool's class timetable in a clean calendar;
- books a class immediately ("Book now"), or sets an **AutoBook rule** so the app
  reserves a recurring weekly class for them automatically the day before;
- automatically accumulates a **Training log** of classes they attended, with the
  pool's published **Calories** for each;
- sees their progress on a dashboard — total classes, calories over time,
  weekly consistency/streak, and which classes they do most;
- adds a Training log by hand for a class they attended but never booked through
  the app.

The User sets their weekly classes once and forgets them; the history fills itself.

## User Stories

### Accounts & onboarding
1. As a visitor, I want to sign up and sign in (Google or email/password), so that my classes and history are private to me.
2. As a new User, I want to enter my Pool details (name, surname, phone, email) during onboarding, so that the app can book classes on my behalf.
3. As a User, I want to edit my Pool details later in settings, so that I can fix a typo or change my phone/email.
4. As a User, I want the app to validate my email and phone format, so that a booking does not silently fail because of a bad value.
5. As a User, I want to be blocked from booking (with a clear "complete your details" prompt) until all four Pool details are present, so that I never trigger a booking that cannot succeed.
6. As a User, I want my Pool details kept private and used only when booking, so that other Users never see my contact information.

### Viewing the timetable
7. As a User, I want to see the current week's classes in a calendar, so that I can decide what to attend.
8. As a User, I want each class to show its name, day, start–end time, intensity (hearts), duration, and Calories range, so that I can choose a class that fits me.
9. As a User, I want the calendar to load instantly, so that browsing does not wait on the pool's website.
10. As a User, I want to open a class to see its live free-spot count, so that I know whether it is worth booking before it fills.
11. As a User, I want to see when a class has already finished or is in progress today, so that I do not try to book a class that has passed.
12. As a User, I want to understand that only the current week is available, so that I am not confused about missing future weeks.

### Booking now
13. As a User, I want a "Book now" button on a class, so that I can reserve a spot immediately without waiting for the day-before automation.
14. As a User, I want clear feedback after a "Book now" attempt — booked, already booked, or full — so that I know my real status.
15. As a User, I want the app to tell me a booking will be confirmed by an email from the pool (which also carries the only cancel link), so that I know where to look.

### AutoBook rules
16. As a User, I want to create an AutoBook rule for a recurring weekly class (e.g. every Wednesday 19:00 "Funkcinė rato"), so that I never have to re-book it.
17. As a User, I want the app to automatically reserve my AutoBook'd class the day before it happens, so that I get a spot without lifting a finger.
18. As a User, I want the app to try early and keep retrying if booking is not yet open or briefly fails, so that I maximise my chance of getting a spot in a popular class.
19. As a User, I want to see all my AutoBook rules in one place, so that I can manage what is being booked for me.
20. As a User, I want to enable, disable, or delete an AutoBook rule, so that I can pause or stop a recurring booking.
21. As a User, I want to understand that disabling a rule stops future bookings but does NOT cancel a booking already placed for tomorrow, so that I am not surprised to still have a reservation.
22. As a User, I want a per-rule run log (date → outcome → message), so that I can see whether last week's class was booked, was full, or could not be matched.
23. As a User, I want a rule whose class was renamed or moved to be reported as "no match" in the run log rather than booking the wrong class, so that I am never silently signed up for something I did not choose.

### Training log (history)
24. As a User, I want a Training log entry created automatically after a class I booked has finished, so that my history reflects what I attended without manual work.
25. As a User, I want every Training log to carry the class name, date, intensity, and Calories, so that my statistics are meaningful.
26. As a User, I want to mark a booked class as "didn't go", so that a no-show does not inflate my calories and attendance.
27. As a User, I want to manually add a Training log for a class I attended but never booked through the app, so that my history is complete.
28. As a User, I want to pick the attended class from the timetable when adding manually (so its Calories are filled in), or type the details for a class no longer listed, so that manual logging works for both this week and the past.
29. As a User, I want to edit or delete a Training log, so that I can correct mistakes.
30. As a User, I want a class with no published Calories to still be logged (with calories left blank), so that attendance is recorded even when the energy figure is unknown.

### Statistics & progress
31. As a User, I want to see my total number of classes attended for a chosen period (week/month/all-time), so that I can gauge my activity.
32. As a User, I want to see my total Calories for a chosen period, so that I can track energy spent.
33. As a User, I want a chart of Calories over time, so that I can see trends.
34. As a User, I want to see classes-per-week and my current streak, so that I can judge my consistency.
35. As a User, I want to see which class types I do most, so that I understand my training mix.
36. As a User, I want a class with a blank Calories value excluded from calorie totals (but still counted as attendance), so that my totals are not skewed by unknowns.

### Reliability & honesty
37. As a User, I want the app to never claim a booking succeeded unless the pool confirmed it, so that I can trust my reservations.
38. As a User, I want booking outcomes recorded faithfully (registered / already / full / no-match / error), so that the run log is a true account.
39. As a User, I want my data isolated from other Users, so that one User's rules or history never affect mine.

## Implementation Decisions

### Stack & platform
- **Frontend:** Next.js 16 (App Router) + React 19 + **Chakra UI v3**; charts via **Chakra UI's chart components**. Deployed on Vercel.
- **Backend:** **Convex** (database, queries/mutations, actions, scheduled functions/cron). Deployed on Convex cloud.
- **Auth:** **Convex Auth** (Google OAuth + email/password). Chosen over Clerk to avoid a second vendor; the app needs only User identity, no orgs/roles.
- **Timezone:** Europe/Vilnius throughout (matches the pool and the `fabb.py` reference).
- **Package manager:** bun.

### Pool integration — the gateway boundary
- All pool I/O is isolated behind a single **`PoolGateway`** abstraction (the primary test seam). Parsing is implemented as **pure functions** independent of HTTP, so they can be tested against recorded HTML with no network:
  - `parseSchedule(html) → Class[]`
  - `parseAvailability(html) → { free, registered, max }`
  - `parseBookingResult(html) → BookingStatus`
- The booking call runs in a Convex **Node action** (`"use node"`) because it needs a cookie jar and multipart bodies. It replicates the four-step sequence already proven in the `fabb.py` reference: (1) GET schedule to establish the PHP session, (2) GET the class modal, (3) POST multipart `ff=goreg` + `pid` + `date` to seed the selected class, (4) POST urlencoded `name/surname/phone/email/agree=y/ff=reg`. The pool dedupes by email, so the call is idempotent.
- Booking status vocabulary (encoded from the `fabb.py` prototype, which is authoritative on the pool's response strings):

  ```
  registered  -> "sėkmingai užsiregistravote"
  already     -> "jau esate užsiregistrav…"
  full        -> "nėra (laisvų) vietų" / "vietų nebėra"
  error       -> anything else (network/parse)
  ```

### Schedule caching (per ADR 0002)
- A single **hourly Convex cron** scrapes the week and upserts the **stable** fields into a `classes` table: name, startTime, endTime, date, `pid`, intensity, `kcalMin`, `kcalMax`, durationMin. All Users read this table reactively → instant calendar, flat pool-load at any user count.
- **Volatile** free-spot counts are fetched **live** via `PoolGateway` only when a User opens a class or is about to book — the only moment accuracy matters.

### Calories
- Scraped per class as a **range** (`kcalMin`, `kcalMax`); it is a property of the class, identical for everyone, **not** personalized to body weight (so no weight/age/sex profile field exists).
- May be **absent** for some classes → stored `null`. Statistics use the **midpoint** `(kcalMin + kcalMax) / 2`; `null` is excluded from calorie totals but the class still counts as attendance.

### AutoBook rules & day-before cron
- An **AutoBook rule** is recurring-weekly, keyed by `(weekday, startTime, nameMatch)`, with an `enabled` flag, owned by a User.
- A **day-before cron** fires early on the eve of each class day, resolves each enabled rule against the live (current-week) schedule by weekday + start time + fuzzy name match, and books the single matching open class via the gateway. On not-yet-open / transient error it **retries** on a backoff until booked / already / full / class start. Every attempt appends to a per-rule **run log** (`date`, `outcome`, `message`). No external notification (run log only).
- A rule that matches nothing tomorrow records `no-match` and books nothing — never a wrong class.

### Booking → Training log conversion
- A cron running **after a class's end time** converts each completed **Booking** (regardless of source — rule or "Book now") into a **Training log** with `attended: true` and the class's scraped Calories, linked to the Booking so it is created at most once.
- The User may toggle a log to **"didn't go"** (excluded from stats) or delete it.
- A **manual** Training log has no linked Booking; it may reference a current-week class (Calories auto-filled) or be fully typed for a past class no longer published.

### Cancellation (per ADR 0001)
- **No in-app cancellation.** The pool emails the User a working cancel link on every Booking; the UI states plainly that disabling a rule does not undo an already-placed Booking.

### Data model (shape encoded from exploration; field-level, not file-level)

```
users         : auth identity + poolDetails{name,surname,phone,email} + detailsComplete:boolean
classes       : date, startTime, endTime, pid, name, intensity, kcalMin?, kcalMax?, durationMin   (hourly-scraped cache)
autoBookRules : userId, weekday, startTime, nameMatch, enabled
bookings      : userId, pid, date, source('rule'|'now'), ruleId?, status, runLog[{at,outcome,message}]
trainingLogs  : userId, className, date, intensity, kcalMin?, kcalMax?, attended, bookingId?
```

## Testing Decisions

- **What makes a good test here:** assert **external behavior** through a seam — given recorded pool HTML, the parser returns the right structured `Class`/status; given a fake gateway outcome, the Convex action writes the right `bookings`/`trainingLogs`/run-log rows. Tests never assert internal call order, private helpers, or DB row shapes beyond observable fields. **No real network and no real bookings** in any test (a real booking consumes a limited, real spot).
- **Seam 1 — pure parsers (highest seam).** `parseSchedule`, `parseAvailability`, `parseBookingResult` exercised with **recorded HTML fixtures**, including: calorie range present, calorie range **absent** (e.g. "Fat Killer"), the two name-markup variants, in-progress/finished classes, and each booking-result string. **Prior art:** `fabb.py` already separates pure parsing from I/O and is offline-testable via its `--file` flag against `tests/snapshot.html` — fixtures are mirrored from that and from freshly recorded live pages.
- **Seam 2 — Convex functions via `convex-test` (in-memory DB) with an injected fake `PoolGateway`.** Covered behaviors: rule resolves tomorrow's matching class; rule with no match records `no-match` and books nothing; booking action records the gateway's status and run-log entry; Booking→Training log conversion creates exactly one log and never double-creates; "didn't go" excludes a log from stats; calorie midpoint + `null` exclusion; stats aggregation (totals, per-week, streak, top class types); booking gated when Pool details incomplete; per-User data isolation.
- **Seam 3 — UI/E2E:** a single smoke check of sign-in → calendar render is sufficient; richer UI flows are not automated.

## Out of Scope

- In-app cancellation of a Booking, and the paste-the-link cancel helper (ADR 0001) — deferred until Users ask.
- Email / push / SMS notifications of any kind (booking success and failure live only in the pool's email and the in-app run log).
- Personalized calorie estimation (weight/age/sex, MET formulas) — the pool's published range is used as-is.
- One-shot scheduling of a class on a specific future date (recurring-weekly + "Book now" cover the real need; future weeks are not published anyway).
- Pools or venues other than Fabijoniškės; multiple pools.
- Native mobile apps.
- Payments, membership, or class-package handling.
- Comprehensive UI test automation beyond the smoke check.
- Social/sharing features, goals/targets, personal records.

## Further Notes

- **Publish-window constraint:** the pool publishes only the current Mon–Sun week. Recurring weekly rules are designed around this — the day-before instance is always already published, so it is always resolvable.
- **Pool-load / ban risk:** scraping is centralized to one hourly cron to keep load flat (ADR 0002); per-User bookings are unavoidable but cluster around the day-before window — fire times can be **staggered** across Users if the pool rate-limits.
- **Consent:** each Booking submits `agree=y`, accepting the pool's terms on the User's behalf; onboarding copy should make this explicit.
- **Reference implementation:** the `fabb` skill's `scripts/fabb.py` is the authoritative reference for the scrape/booking/cancel HTTP sequences and the pool's exact response strings; the `PoolGateway` and parsers port that behavior to TypeScript.
- **Cancel link delivery:** the only working cancel token arrives in the pool's confirmation email to the User — the app never sees it, which is the root reason for ADR 0001.
- **Publishing:** this PRD was written to a local file (no git remote / issue tracker configured for this repo). To publish it as a `ready-for-agent` issue later, connect a GitHub remote and re-run the publish step.
