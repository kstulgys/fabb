/**
 * The pool I/O boundary. Every network call to the Fabijoniškės pool goes
 * through a {@link PoolGateway}; nothing else in the app calls `fetch` against
 * the pool directly, and every method returns a parsed domain value — a class
 * list, event detail, availability, or a classified {@link BookingStatus} — so
 * callers never touch the pool's HTML. The HTML→data step is `parse.ts`'s,
 * invoked here behind the seam (as `book` already classifies its own response).
 *
 * The pool is behind Cloudflare, whose bot challenge 403s the Convex
 * deployment's datacenter IP for the schedule + booking endpoints. So when
 * `POOL_RELAY_URL` + `POOL_RELAY_SECRET` are set (Convex env), every request is
 * routed through the fabb relay Worker (see `proxy-worker/`), which egresses
 * from Cloudflare's own network — which the pool does NOT challenge. Unset →
 * requests go direct (fine from a residential IP, e.g. local dev). The relay is
 * a dumb transport: this module keeps the cookie jar, the 4-step booking flow,
 * and the parsing. Plain `fetch` only, so this stays in the default Convex
 * runtime; tests inject a fake via {@link setPoolGateway} and NEVER hit the
 * network.
 */

import type { BookingStatus } from "../bookingStatus";
import type { PoolDetails } from "../poolDetails";
import {
  type Availability,
  type EventDetail,
  type ScheduleClass,
  parseAvailability,
  parseBookingResult,
  parseEventDetail,
  parseSchedule,
} from "./parse";

export interface PoolGateway {
  /** The classes for the Mon–Sun week starting `weekStart` (an ISO Monday),
   * parsed from that week's `?nuo=<weekStart>` schedule page. */
  fetchSchedule(weekStart: string): Promise<ScheduleClass[]>;
  /** The stable event-modal fields (Calories, duration) for `(pid, date)`. */
  fetchEventDetail(pid: string, date: string): Promise<EventDetail>;
  /**
   * The volatile free-spot counts for `(pid, date)`. Fetched live per
   * class-open and never cached (ADR-0002).
   */
  fetchAvailability(pid: string, date: string): Promise<Availability>;
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
 * Resolve the actual fetch target for a pool request. With the relay configured,
 * the request goes to the relay Worker carrying the real pool URL + shared
 * secret in `X-Fabb-Target` / `X-Fabb-Secret` control headers (the Worker
 * forwards it to the pool from Cloudflare's network and returns the response,
 * Set-Cookie included). Without it, the request goes straight to the pool.
 * Pure — exported for tests.
 */
export function relayTarget(
  url: string,
  init: RequestInit,
  relayUrl: string | undefined,
  secret: string | undefined,
): { url: string; init: RequestInit } {
  if (!relayUrl || !secret) return { url, init };
  const headers = new Headers(init.headers);
  headers.set("X-Fabb-Target", url);
  headers.set("X-Fabb-Secret", secret);
  return { url: relayUrl, init: { ...init, headers } };
}

/**
 * `fetch` for pool requests: routed through the relay Worker when configured,
 * else direct. Every real gateway request goes through this so the relay applies
 * uniformly.
 */
function poolFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const routed = relayTarget(
    url,
    init,
    process.env.POOL_RELAY_URL,
    process.env.POOL_RELAY_SECRET,
  );
  return fetch(routed.url, routed.init);
}

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
 * Merge a response's `Set-Cookie` header(s) into `jar` (name → value). `fetch`
 * does not persist cookies, so the booking flow keeps its own jar and resends it
 * — mirroring the reference implementation's cookie jar. The relay returns the
 * pool's Set-Cookie headers unchanged, so this works whether routed or direct.
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

/**
 * GET one class's event-modal HTML for `(pid, date)`. The two read methods that
 * parse it — {@link PoolGateway.fetchEventDetail} (stable fields) and
 * {@link PoolGateway.fetchAvailability} (live spots) — share this one request.
 */
async function fetchEventModalHtml(pid: string, date: string): Promise<string> {
  const url = `${EVENT_URL}?pid=${encodeURIComponent(pid)}&date=${encodeURIComponent(date)}`;
  const res = await poolFetch(url, {
    headers: { "User-Agent": USER_AGENT, Referer: REGISTRACIJA_URL },
  });
  if (!res.ok) {
    throw new Error(
      `Pool event fetch failed for pid=${pid} date=${date}: HTTP ${res.status}`,
    );
  }
  return await res.text();
}

export const realPoolGateway: PoolGateway = {
  async fetchSchedule(weekStart) {
    const url = `${SCHEDULE_URL}?nuo=${encodeURIComponent(weekStart)}`;
    const res = await poolFetch(url, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) {
      throw new Error(`Pool schedule fetch failed: HTTP ${res.status}`);
    }
    return parseSchedule(await res.text());
  },

  async fetchEventDetail(pid, date) {
    return parseEventDetail(await fetchEventModalHtml(pid, date));
  },

  async fetchAvailability(pid, date) {
    return parseAvailability(await fetchEventModalHtml(pid, date));
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
      absorbCookies(jar, await poolFetch(SCHEDULE_URL, { headers: headers() }));
      // 2) Open the class modal.
      const eventUrl = `${EVENT_URL}?pid=${encodeURIComponent(pid)}&date=${encodeURIComponent(date)}`;
      absorbCookies(jar, await poolFetch(eventUrl, { headers: headers() }));
      // 3) Seed the session's selected class (ff=goreg + pid + date, multipart).
      const select = encodeMultipart({
        ff: "goreg",
        pid: String(pid),
        date: String(date),
      });
      absorbCookies(
        jar,
        await poolFetch(REGISTRACIJA_URL, {
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
      const res = await poolFetch(TPL_REG_URL, {
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

/** The gateway the pool-I/O actions should use. Defaults to the real one. */
export function poolGateway(): PoolGateway {
  return active;
}

/** Swap the active gateway (tests inject a fake; pass `null` to restore real). */
export function setPoolGateway(gateway: PoolGateway | null): void {
  active = gateway ?? realPoolGateway;
}
