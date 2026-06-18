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
 * action run end-to-end under `convex-test`.
 */
export interface PoolGateway {
  /** GET the group-class schedule page (the whole current Mon–Sun week). */
  fetchScheduleHtml(): Promise<string>;
  /** GET one class's event modal for `(pid, date)`. */
  fetchEventHtml(pid: string, date: string): Promise<string>;
}

const BASE = "https://www.fabijoniskiubaseinas.lt";
const SCHEDULE_URL = `${BASE}/tvarkarastis/grupiniu-uzsiemimu-sales-tvarkarastis/`;
const EVENT_URL = `${BASE}/event.php`;
const REGISTRACIJA_URL = `${BASE}/registracija/`;
// Match the reference implementation's User-Agent so the pool serves the same
// markup the parsers were recorded against.
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0 Safari/537.36";

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
