# Fabb

A multi-user web app for the Fabijoniškės pool (Fabijoniškių baseinas): users
browse the group-class timetable, auto-book classes, and track their training
history and calories.

## Language

**User**:
A person with an app account who auto-books and tracks their own pool classes.
Distinct from the pool itself — the pool has no accounts; it books anonymously,
keyed only by email.
_Avoid_: Member, account.

**AutoBook rule**:
A standing, recurring-weekly instruction to book a class for a User — matched
each week by weekday, start time, and name. The trigger the day-before cron acts
on. Distinct from the Booking it produces, and from a one-off "Book now" (an
immediate Booking with no rule behind it).
_Avoid_: Subscription, schedule, intent.

**Booking**:
A confirmed reservation for one class instance (identified by the pool's `pid` +
`date`) at the pool. Created either immediately ("register now") or by the cron
the day before. Anonymous to the pool, keyed by the User's email.
_Avoid_: Registration, reservation, sign-up.

**Training log**:
A record that a User actually did a class, carrying the class name, date,
intensity, and calories. The unit of training history and statistics. Exists
independently of any Booking (a User may log a class they attended without ever
booking through the app).
_Avoid_: Session, attendance, history entry, record.

**Calories**:
The pool-published energy estimate for a class, scraped as a range (e.g.
500–800 kcal). Identical for every participant — a property of the class, not
personalized to the User's body. Present as a whole range or not at all — a
lone bound is never stored. Stored as two min/max columns; statistics use the
midpoint, and a class with no range still counts as attendance but adds nothing
to a Calorie total.
_Avoid_: Burn, energy, kcal (informal).

**Pool details**:
The four fields the pool requires to book — name, surname, phone, email — stored
once per User and submitted on every Booking. The User's identity *to the pool*,
distinct from their app account; the pool keys bookings off the email.
_Avoid_: Profile, credentials, registration info.

**Booking status**:
What the pool's registration response is classified into: `registered`,
`already`, `full`, or `error`. The shared four-value vocabulary every booking
surface speaks — the gateway classifies the pool's HTML into it, the Booking
row stores the latest one, and the UI shows truthful feedback (never claiming
success on `error`). An unrecognized response is `error`, never optimistically
a success.
Its operational meaning travels with the vocabulary, owned as predicates by the
same module: a status is *held* (`registered`/`already` — a spot secured, the
two the Attendance conversion counts and the UI blocks re-booking on),
*terminal* (anything but `error` — no retry would change it, what the
day-before cron's dedupe stops on), or *retriable* (only `error`). `full` is
terminal but not held — the one case where the two notions diverge.
_Avoid_: result, response code, booking state.

**AutoBook outcome**:
The verdict of one AutoBook rule attempt: the four Booking statuses plus
`no_match` (the rule resolved to zero or 2+ classes, so nothing was booked) and
`no_details` (the User's Pool details were incomplete). The two extra verdicts
book nothing and are recorded only in the rule's run log — never as a Booking
status.
_Avoid_: attempt status, rule result.

**Attendance conversion**:
The system-context step that turns a held Booking (status `registered` or
`already`) into a Training log once the class has finished — marking it
`attended: true` and copying the class's name, intensity, and Calories. Runs
from the hourly cron with no caller identity, so it trusts each Booking's own
`userId`; idempotent, producing one Training log per Booking, ever.
_Avoid_: sync, import, backfill, materialization.
