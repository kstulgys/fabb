/**
 * Pure parsers for the Fabijoniškės pool's HTML pages.
 *
 * These functions have NO network and NO Node dependencies so they run in any
 * runtime and are unit-tested directly against recorded HTML fixtures (see
 * `parse.test.ts`). All pool *I/O* lives behind the {@link PoolGateway} in
 * `gateway.ts`; this module only turns already-fetched HTML into data.
 *
 * Ported from the reference implementation's `parse_events`
 * (`/home/karolis/.claude/skills/fabb/scripts/fabb.py`), which is authoritative
 * on the pool's markup.
 */

/** One class as published on the schedule page. Calories/duration are NOT here
 * — they live on the per-class event modal, parsed by {@link parseEventDetail}. */
export interface ScheduleClass {
  date: string; // ISO "YYYY-MM-DD"
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM" ("" when the source omits it)
  pid: string;
  name: string;
  intensity: number; // count of ❤ hearts (0 when absent)
}

/** The stable fields scraped from a class's event modal. Volatile free-spot
 * counts are deliberately NOT parsed here (ADR-0002: fetched live elsewhere). */
export interface EventDetail {
  kcalMin: number | null;
  kcalMax: number | null;
  durationMin: number | null;
}

/** The volatile free-spot counts on a class's event modal. These change minute
 * to minute, so (ADR-0002) they are fetched LIVE per class-open and NEVER cached
 * into the `classes` table. Any field is `null` when the modal omits it. */
export interface Availability {
  free: number | null;
  registered: number | null;
  max: number | null;
}

/** Strip HTML tags, unescape entities, and collapse whitespace in a fragment. */
export function cleanText(fragment: string): string {
  // `&amp;` is resolved last so an escaped entity like `&amp;quot;` is not
  // double-decoded.
  return fragment
    .replace(/<[^>]+>/g, "")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse every class on the schedule page into a {@link ScheduleClass}.
 *
 * Each class is a `<li class="single-event …" data-start data-end data-pid
 * data-date>`. The name lives in `<em class="event-name">`, which comes in two
 * markup variants: most wrap the time in an inner `<span class="event-date">`
 * before the name (stripped here); some put the name straight inside the `<em>`.
 * Intensity is the count of ❤ in `<em class="event-intensity">`.
 */
export function parseSchedule(html: string): ScheduleClass[] {
  const classes: ScheduleClass[] = [];
  for (const liMatch of html.matchAll(
    /<li class="single-event[^"]*"([\s\S]*?)<\/li>/g,
  )) {
    const chunk = liMatch[1];
    const attrs: Record<string, string> = {};
    for (const attr of chunk.matchAll(/data-([a-z]+)="([^"]*)"/g)) {
      attrs[attr[1]] = attr[2];
    }
    const startTime = attrs.start;
    const date = attrs.date;
    if (!startTime || !date) continue;

    const nameMatch = chunk.match(/event-name"[^>]*>([\s\S]*?)<\/em>/);
    let name = "(unnamed)";
    if (nameMatch) {
      const raw = nameMatch[1].replace(
        /<span class="event-date">[\s\S]*?<\/span>/g,
        "",
      );
      name = cleanText(raw) || "(unnamed)";
    }

    const heartMatch = chunk.match(/event-intensity">([\s\S]*?)<\/em>/);
    const intensity = heartMatch ? (heartMatch[1].match(/\u2764/g)?.length ?? 0) : 0;

    classes.push({
      date,
      startTime,
      endTime: attrs.end ?? "",
      pid: attrs.pid ?? "",
      name,
      intensity,
    });
  }
  return classes;
}

/**
 * Parse the stable fields from a class's event modal (`event.php`).
 *
 * Calories are published as a range, e.g. `Kalorijos:&nbsp; <b>500-800 kcal.</b>`
 * — and are absent on some classes (e.g. "Fat Killer"), in which case both
 * bounds are `null`. Duration is `Trukmė:&nbsp; <b>50 min.</b>`.
 */
export function parseEventDetail(html: string): EventDetail {
  const kcal = html.match(/Kalorijos:[^<]*<b>\s*(\d+)\s*-\s*(\d+)\s*kcal/);
  const duration = html.match(/Trukm[^<]*<b>\s*(\d+)\s*min/);
  return {
    kcalMin: kcal ? Number(kcal[1]) : null,
    kcalMax: kcal ? Number(kcal[2]) : null,
    durationMin: duration ? Number(duration[1]) : null,
  };
}

/**
 * Parse the live free-spot counts from a class's event modal (`event.php`).
 *
 * The modal states them inline, each number wrapped in `<b>`, e.g.
 * `Laisvų vietų: <b>14</b>, užsiregistravusių: <b>6</b>` … `Maks. vietų sk:&nbsp; <b>20</b>`.
 * Some modals omit one or more (e.g. the cap line) — each absent field is `null`.
 * Ported from the reference `availability()`; `[^<]*` (like {@link parseEventDetail})
 * absorbs the `&nbsp;`/whitespace the pool varies between the label and the `<b>`.
 */
export function parseAvailability(html: string): Availability {
  const free = html.match(/Laisvų vietų:[^<]*<b>\s*(\d+)/);
  const registered = html.match(/užsiregistravusių:[^<]*<b>\s*(\d+)/);
  const max = html.match(/Maks\. vietų sk:[^<]*<b>\s*(\d+)/);
  return {
    free: free ? Number(free[1]) : null,
    registered: registered ? Number(registered[1]) : null,
    max: max ? Number(max[1]) : null,
  };
}

/**
 * The pool's booking outcome, classified from its registration-response HTML.
 * This vocabulary (and the exact strings each maps from) is fixed by the
 * reference `book()` (`fabb.py`), authoritative on the pool's wording. Every
 * booking surface speaks it: the gateway's `book`, the `bookings` row, and the
 * `bookNow` action.
 */
export type BookingStatus = "registered" | "already" | "full" | "error";

/**
 * Classify the pool's registration response into a {@link BookingStatus}.
 *
 * Ported verbatim from the reference `book()` (`fabb.py`): a success banner
 * ("sėkmingai užsiregistravote") → `registered`; the already-registered notice
 * ("jau esate užsiregistrav…") → `already`; any no-free-spots phrasing
 * ("nėra (laisvų) vietų" / "vietų nebėra" / "nebėra vietų") → `full`; anything
 * else (including an upstream failure) → `error`. Order matters: a success or
 * already-registered banner wins over an incidental "vietų" mention, and an
 * unrecognised response is NEVER optimistically treated as a success.
 */
export function parseBookingResult(html: string): BookingStatus {
  if (html.includes("sėkmingai užsiregistravote")) return "registered";
  if (html.includes("jau esate užsiregistrav")) return "already";
  if (/nėra (laisvų )?vietų|vietų nebėra|nebėra vietų/.test(html)) return "full";
  return "error";
}
