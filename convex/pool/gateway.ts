/**
 * The pool I/O boundary. Every network call to the Fabijoniškės pool goes
 * through a {@link PoolGateway}; nothing else in the app calls `fetch` against
 * the pool directly. Parsing the returned HTML is `parse.ts`'s job.
 *
 * Later slices extend this interface (e.g. live availability, booking). Tests
 * inject a fake gateway via {@link setPoolGateway} so Convex logic is exercised
 * against recorded fixtures and NEVER hits the real network.
 *
 * The real implementation uses the platform `fetch`, which is available in
 * Convex's default runtime — per `convex/_generated/ai/guidelines.md`, `fetch`
 * needs no `"use node"`. Keeping it in the default runtime also lets the scrape
 * action run end-to-end under `convex-test`. The `book` flow additionally
 * carries a PHP session cookie across four requests and posts a multipart body;
 * it is invoked only from the Node-runtime `bookNow` action (`book.ts`), and in
 * tests the whole gateway is swapped for a fake — the real network is NEVER hit.
 */

import type { BookingStatus } from "../bookingStatus";
import type { PoolDetails } from "../poolDetails";
import { parseBookingResult } from "./parse";

export interface PoolGateway {
  /** GET the group-class schedule page (the whole current Mon–Sun week). */
  fetchScheduleHtml(): Promise<string>;
  /** GET one class's event modal for `(pid, date)`. */
  fetchEventHtml(pid: string, date: string): Promise<string>;
  /**
   * Perform the pool's four-step booking for `(pid, date)` using the User's
   * {@link PoolDetails}, returning the classified {@link BookingStatus}. The
   * real flow carries a session cookie and posts a multipart body, so it runs
   * in the Node-runtime `bookNow` action; tests inject a fake.
   */
  book(
    pid: string,
    date: string,
    poolDetails: PoolDetails,
  ): Promise<BookingStatus>;
}

const BASE = "https://www.fabijoniskiubaseinas.lt";
const SCHEDULE_URL = `${BASE}/tvarkarastis/grupiniu-uzsiemimu-sales-tvarkarastis/`;
const EVENT_URL = `${BASE}/event.php`;
const REGISTRACIJA_URL = `${BASE}/registracija/`;
const TPL_REG_URL = `${BASE}/inc/tpl_reg.php`;
// Match the reference implementation's User-Agent so the pool serves the same
// markup the parsers were recorded against.
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0 Safari/537.36";

/**
 * Encode form fields as `multipart/form-data` (the select-class step must be
 * multipart — urlencoded silently fails to seed the class). Ported from the
 * reference `_multipart`.
 */
function encodeMultipart(fields: Record<string, string>): {
  body: string;
  contentType: string;
} {
  const boundary = "----fabbBoundary7MA4YWxkTrZu0gW";
  const lines: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    lines.push(
      `--${boundary}`,
      `Content-Disposition: form-data; name="${key}"`,
      "",
      value,
    );
  }
  lines.push(`--${boundary}--`, "");
  return {
    body: lines.join("\r\n"),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

/**
 * Merge a response's `Set-Cookie` header(s) into `jar` (name → value). Node's
 * `fetch` does not persist cookies, so the booking flow keeps its own jar and
 * resends it — mirroring the reference implementation's cookie jar.
 */
function absorbCookies(jar: Map<string, string>, res: Response): void {
  const getSetCookie = (
    res.headers as Headers & { getSetCookie?: () => string[] }
  ).getSetCookie;
  const raw = getSetCookie
    ? getSetCookie.call(res.headers)
    : res.headers.get("set-cookie")
      ? [res.headers.get("set-cookie") as string]
      : [];
  for (const cookie of raw) {
    const pair = cookie.split(";", 1)[0];
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

/** Serialise the cookie jar into a `Cookie` request-header value. */
function cookieHeader(jar: Map<string, string>): string {
  return Array.from(jar, ([name, value]) => `${name}=${value}`).join("; ");
}

export const realPoolGateway: PoolGateway = {
  async fetchScheduleHtml() {
    const res = await fetch(SCHEDULE_URL, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) {
      throw new Error(`Pool schedule fetch failed: HTTP ${res.status}`);
    }
    return await res.text();
  },

  async fetchEventHtml(pid, date) {
    const url = `${EVENT_URL}?pid=${encodeURIComponent(pid)}&date=${encodeURIComponent(date)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Referer: REGISTRACIJA_URL },
    });
    if (!res.ok) {
      throw new Error(
        `Pool event fetch failed for pid=${pid} date=${date}: HTTP ${res.status}`,
      );
    }
    return await res.text();
  },

  async book(pid, date, poolDetails) {
    // The pool ties the four requests together with a PHP session cookie set on
    // the first GET; we capture every `Set-Cookie` and resend the jar on each
    // later request. Steps mirror the reference `book()`.
    const jar = new Map<string, string>();
    const headers = (
      extra?: Record<string, string>,
    ): Record<string, string> => {
      const cookie = cookieHeader(jar);
      return {
        "User-Agent": USER_AGENT,
        Referer: REGISTRACIJA_URL,
        ...(cookie ? { Cookie: cookie } : {}),
        ...extra,
      };
    };
    try {
      // 1) Establish the PHP session.
      absorbCookies(jar, await fetch(SCHEDULE_URL, { headers: headers() }));
      // 2) Open the class modal.
      const eventUrl = `${EVENT_URL}?pid=${encodeURIComponent(pid)}&date=${encodeURIComponent(date)}`;
      absorbCookies(jar, await fetch(eventUrl, { headers: headers() }));
      // 3) Seed the session's selected class (ff=goreg + pid + date, multipart).
      const select = encodeMultipart({
        ff: "goreg",
        pid: String(pid),
        date: String(date),
      });
      absorbCookies(
        jar,
        await fetch(REGISTRACIJA_URL, {
          method: "POST",
          headers: headers({ "Content-Type": select.contentType }),
          body: select.body,
        }),
      );
      // 4) Submit the booking, then classify the response.
      const form = new URLSearchParams({
        name: poolDetails.name,
        surname: poolDetails.surname,
        phone: poolDetails.phone,
        email: poolDetails.email,
        agree: "y",
        ff: "reg",
      });
      const res = await fetch(TPL_REG_URL, {
        method: "POST",
        headers: headers({
          "Content-Type": "application/x-www-form-urlencoded",
        }),
        body: form.toString(),
      });
      return parseBookingResult(await res.text());
    } catch {
      // A network failure is not a booking — never claim success.
      return "error";
    }
  },
};

let active: PoolGateway = realPoolGateway;

/** The gateway the scrape action should use. Defaults to the real network one. */
export function poolGateway(): PoolGateway {
  return active;
}

/** Swap the active gateway (tests inject a fake; pass `null` to restore real). */
export function setPoolGateway(gateway: PoolGateway | null): void {
  active = gateway ?? realPoolGateway;
}
