/**
 * Europe/Vilnius week-date helpers (pure, unit-tested in `week.test.ts`).
 *
 * The pool publishes only the current Mon–Sun week. Class dates are Vilnius
 * calendar dates ("YYYY-MM-DD"), so "this week" must be computed in that zone
 * (constraints.md: Europe/Vilnius everywhere).
 */
const TIME_ZONE = "Europe/Vilnius";

// en-CA formats a date as ISO "YYYY-MM-DD"; with a timeZone it yields the
// civil date in Vilnius for a given UTC instant.
const vilniusDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Mon→Sun day labels, aligned with the order {@link weekDatesFor} returns. */
export const WEEKDAY_LABELS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

/**
 * The seven ISO dates of the Mon–Sun week containing `now` in Europe/Vilnius,
 * ordered Monday first. Date arithmetic is done on UTC-anchored civil dates so
 * it is immune to DST shifts.
 */
export function weekDatesFor(now: Date): string[] {
  const [year, month, day] = vilniusDate.format(now).split("-").map(Number);
  const anchorMs = Date.UTC(year, month - 1, day);
  // getUTCDay: 0=Sun..6=Sat → days since Monday.
  const sinceMonday = (new Date(anchorMs).getUTCDay() + 6) % 7;
  const mondayMs = anchorMs - sinceMonday * 86_400_000;

  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(mondayMs + i * 86_400_000);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${dd}`);
  }
  return dates;
}
