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
