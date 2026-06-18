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

// Same instant, the Vilnius wall-clock time. `h23` forces a 00–23 hour so the
// parsed minute-of-day is unambiguous at midnight.
const vilniusClock = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
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

/** Where a class sits relative to "now" on its own day (Europe/Vilnius). */
export type ClassStatus = "finished" | "in-progress" | "upcoming";

export interface ClassTiming {
  status: ClassStatus;
  /**
   * Whether the class may still be booked. A `finished` class is NEVER bookable
   * (ADR/AC: today's finished classes can't be booked); `in-progress` and
   * `upcoming` are. Task 6's book affordance gates on exactly this flag.
   */
  bookable: boolean;
}

/** Minutes-of-day for a "HH:MM" (or "HH:MM:SS") wall-clock string. */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":");
  return Number(h) * 60 + Number(m);
}

/** Minutes-of-day of `now` in Europe/Vilnius, read via the locale parts so a
 * locale's time separator can't break parsing. */
function vilniusMinutes(now: Date): number {
  const parts = vilniusClock.formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const minute = Number(parts.find((p) => p.type === "minute")?.value);
  return hour * 60 + minute;
}

/**
 * The status of a class at instant `now`, in Europe/Vilnius, and whether it is
 * still bookable.
 *
 * Time-marking mirrors the reference `render_day`: only the class's own day is
 * compared by the clock. A class on an earlier day this week is `finished`; one
 * on a later day is `upcoming`. Today, it is `finished` once its end has passed,
 * `in-progress` while running, else `upcoming`. End falls back to start when the
 * source omits it (mirrors `end_minutes`). ISO dates compare lexically.
 */
export function classStatus(
  cls: { date: string; startTime: string; endTime: string },
  now: Date,
): ClassTiming {
  const today = vilniusDate.format(now);
  let status: ClassStatus;
  if (cls.date < today) {
    status = "finished";
  } else if (cls.date > today) {
    status = "upcoming";
  } else {
    const nowMin = vilniusMinutes(now);
    const startMin = toMinutes(cls.startTime);
    const endMin = toMinutes(cls.endTime || cls.startTime);
    if (endMin <= nowMin) {
      status = "finished";
    } else if (startMin <= nowMin) {
      status = "in-progress";
    } else {
      status = "upcoming";
    }
  }
  return { status, bookable: status !== "finished" };
}
