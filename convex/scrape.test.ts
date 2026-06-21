/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import eventCalAlt from "./pool/fixtures/event-calories-alt.html?raw";
import eventNoCalories from "./pool/fixtures/event-no-calories.html?raw";
import eventWithCalories from "./pool/fixtures/event-with-calories.html?raw";
import scheduleHtml from "./pool/fixtures/schedule.html?raw";
import type { PoolGateway } from "./pool/gateway";
import { realPoolGateway, setPoolGateway } from "./pool/gateway";
import {
  type ScheduleClass,
  parseEventDetail,
  parseSchedule,
} from "./pool/parse";
import { todayDate, weekStartsFor } from "./week";

const modules = import.meta.glob("./**/*.ts");

// The fixture's 29 classes all fall in one Mon–Sun week (its Monday is
// 2026-06-15). pid 213 is "Fat Killer" (no calories line); pid 121 has a
// different range; everything else uses the 500-800 fixture.
const fixtureClasses = parseSchedule(scheduleHtml);
const fixtureMonday = weekStartsFor(
  new Date(`${fixtureClasses[0].date}T12:00:00Z`),
  1,
)[0];

function isoMs(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Shift an ISO date by whole days via UTC civil-date math. */
function shiftIso(iso: string, days: number): string {
  const dt = new Date(isoMs(iso) + days * 86_400_000);
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${mm}-${dd}`;
}

// Seed a pre-existing cache row (an already-cached class) directly, bypassing
// the scrape — the starting state each reconcile scenario acts on.
async function seedClass(
  t: ReturnType<typeof convexTest>,
  row: {
    pid: string;
    date: string;
    name?: string;
    startTime?: string;
    endTime?: string;
    intensity?: number;
  },
): Promise<void> {
  await t.run((ctx) =>
    ctx.db.insert("classes", {
      date: row.date,
      startTime: row.startTime ?? "09:00",
      endTime: row.endTime ?? "09:50",
      pid: row.pid,
      name: row.name ?? "Seeded",
      intensity: row.intensity ?? 1,
    }),
  );
}

// A real `?nuo=<weekStart>` page returns that week's classes; the fake mimics it
// by sliding the one-week fixture onto the requested Monday — so each week
// yields distinct (pid,date) rows while pids/calories stay identical for the
// detail assertions.
function classesForWeek(weekStart: string): ScheduleClass[] {
  const shiftDays = (isoMs(weekStart) - isoMs(fixtureMonday)) / 86_400_000;
  return fixtureClasses.map((c) => ({ ...c, date: shiftIso(c.date, shiftDays) }));
}

// Fixture-backed gateway: never touches the network. It records each weekStart
// it is asked for, proving scrapeWeek requests one page per week.
const weekStartCalls: string[] = [];
const fakeGateway: PoolGateway = {
  fetchSchedule: async (weekStart) => {
    weekStartCalls.push(weekStart);
    return classesForWeek(weekStart);
  },
  fetchEventDetail: async (pid) => {
    if (pid === "213") return parseEventDetail(eventNoCalories);
    if (pid === "121") return parseEventDetail(eventCalAlt);
    return parseEventDetail(eventWithCalories);
  },
  fetchAvailability: async () => {
    throw new Error("scrapeWeek must not fetch availability");
  },
  book: async () => {
    throw new Error("scrapeWeek must not book");
  },
};

afterEach(() => {
  setPoolGateway(null); // restore the real gateway
  weekStartCalls.length = 0;
});

// Pinned to the canonical Thursday (2026-06-18); its two-week Schedule window is
// the Mondays 2026-06-15 (current) and 2026-06-22 (next).
const NOW = Date.parse("2026-06-18T10:00:00Z");
const [CURRENT_WEEK, NEXT_WEEK] = weekStartsFor(new Date(NOW), 2);
const PER_WEEK = fixtureClasses.length; // 29
// "Today" in Europe/Vilnius for the pinned NOW — the future/finished boundary.
const TODAY = todayDate(new Date(NOW)); // "2026-06-18"

test("scrapeWeek caches the current and next week; re-running produces no duplicates", async () => {
  const t = convexTest(schema, modules);
  setPoolGateway(fakeGateway);

  const first = await t.action(internal.pool.scrape.scrapeWeek, { now: NOW });
  // One ?nuo request per week — current week first, then next.
  expect(weekStartCalls).toEqual([CURRENT_WEEK, NEXT_WEEK]);

  const afterFirst = await t.run((ctx) => ctx.db.query("classes").collect());
  expect(first.upserted).toBe(PER_WEEK * 2);
  expect(afterFirst).toHaveLength(PER_WEEK * 2);
  // Both weeks landed in the cache.
  expect(
    afterFirst.some((c) => c.date >= CURRENT_WEEK && c.date < NEXT_WEEK),
  ).toBe(true);
  expect(afterFirst.some((c) => c.date >= NEXT_WEEK)).toBe(true);

  // Same (pid,date) keys on re-run → rows refreshed in place, none added.
  weekStartCalls.length = 0;
  const second = await t.action(internal.pool.scrape.scrapeWeek, { now: NOW });
  const afterSecond = await t.run((ctx) => ctx.db.query("classes").collect());
  expect(weekStartCalls).toEqual([CURRENT_WEEK, NEXT_WEEK]);
  expect(second.upserted).toBe(PER_WEEK * 2);
  expect(afterSecond).toHaveLength(PER_WEEK * 2);
});

test("scrapeWeek stores parsed calories (present, alternate, and absent) and duration", async () => {
  const t = convexTest(schema, modules);
  setPoolGateway(fakeGateway);
  await t.action(internal.pool.scrape.scrapeWeek, { now: NOW });

  const rows = await t.run((ctx) => ctx.db.query("classes").collect());

  const fatKiller = rows.find((c) => c.pid === "213");
  expect(fatKiller?.kcalMin).toBeUndefined();
  expect(fatKiller?.kcalMax).toBeUndefined();
  expect(fatKiller?.durationMin).toBe(50);

  const withCalories = rows.find((c) => c.pid === "258");
  expect(withCalories?.kcalMin).toBe(500);
  expect(withCalories?.kcalMax).toBe(800);

  const altCalories = rows.find((c) => c.pid === "121");
  expect(altCalories?.kcalMin).toBe(800);
  expect(altCalories?.kcalMax).toBe(1400);

  // The span-wrapped name variant is cleaned (no leftover time prefix).
  expect(withCalories?.name).toBe("TRX treniruotė");
});

test("the real gateway requests that week's ?nuo=<weekStart> schedule page", async () => {
  // Exercise the real fetchSchedule's URL building without the network: force
  // the direct (no-relay) path via empty relay env, stub fetch, capture the URL.
  vi.stubEnv("POOL_RELAY_URL", "");
  vi.stubEnv("POOL_RELAY_SECRET", "");
  const realFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (async (url: Parameters<typeof fetch>[0]) => {
    urls.push(String(url));
    return new Response("", { status: 200 });
  }) as typeof fetch;

  try {
    await realPoolGateway.fetchSchedule("2026-06-22");
  } finally {
    globalThis.fetch = realFetch;
    vi.unstubAllEnvs();
  }

  expect(urls).toHaveLength(1);
  expect(urls[0]).toContain("?nuo=2026-06-22");
});

test("reconcile deletes a future class that vanished from the fresh scrape", async () => {
  const t = convexTest(schema, modules);
  setPoolGateway(fakeGateway);

  // A future class (date > today) in the current week the fresh scrape will not
  // return — it must be removed so the cache mirrors the pool.
  await seedClass(t, { pid: "GONE", date: "2026-06-20", name: "Cancelled" });

  const result = await t.action(internal.pool.scrape.scrapeWeek, { now: NOW });

  const gone = await t.run((ctx) =>
    ctx.db
      .query("classes")
      .withIndex("by_pid_and_date", (q) =>
        q.eq("pid", "GONE").eq("date", "2026-06-20"),
      )
      .unique(),
  );
  expect(gone).toBeNull();
  expect(result.deleted).toBe(1);
});

test("reconcile preserves finished and today classes absent from the scrape (attendance guard)", async () => {
  const t = convexTest(schema, modules);
  setPoolGateway(fakeGateway);

  // Absent-from-scrape classes on a past day and on today (Vilnius TODAY).
  // Deleting these would lose attendance (ADR-0006), so they MUST survive.
  await seedClass(t, { pid: "FINISHED", date: "2026-06-16", name: "Finished" });
  await seedClass(t, { pid: "TODAY", date: TODAY, name: "Today" });

  const result = await t.action(internal.pool.scrape.scrapeWeek, { now: NOW });

  const rows = await t.run((ctx) => ctx.db.query("classes").collect());
  expect(rows.some((c) => c.pid === "FINISHED")).toBe(true);
  expect(rows.some((c) => c.pid === "TODAY")).toBe(true);
  // Neither finished/today row was among the deletions.
  expect(result.deleted).toBe(0);
});

test("reconcile refreshes a changed class in place instead of duplicating", async () => {
  const t = convexTest(schema, modules);
  setPoolGateway(fakeGateway);

  // Same (pid,date) the fresh scrape returns, but cached with a stale name/time.
  const fresh = classesForWeek(CURRENT_WEEK)[0];
  await seedClass(t, {
    pid: fresh.pid,
    date: fresh.date,
    name: "STALE NAME",
    startTime: "23:59",
    endTime: "23:59",
  });

  await t.action(internal.pool.scrape.scrapeWeek, { now: NOW });

  const rows = await t.run((ctx) =>
    ctx.db
      .query("classes")
      .withIndex("by_pid_and_date", (q) =>
        q.eq("pid", fresh.pid).eq("date", fresh.date),
      )
      .collect(),
  );
  expect(rows).toHaveLength(1);
  expect(rows[0].name).toBe(fresh.name);
  expect(rows[0].startTime).toBe(fresh.startTime);
});

test("a week whose schedule fetch throws keeps its cached rows; the other week still reconciles", async () => {
  const t = convexTest(schema, modules);
  // Bespoke gateway: the NEXT week's schedule fetch fails; the current succeeds.
  const failingGateway: PoolGateway = {
    ...fakeGateway,
    fetchSchedule: async (weekStart) => {
      if (weekStart === NEXT_WEEK) {
        throw new Error("pool schedule fetch failed");
      }
      return classesForWeek(weekStart);
    },
  };
  setPoolGateway(failingGateway);

  // A future, absent-from-scrape class in EACH week.
  await seedClass(t, { pid: "CUR_GONE", date: "2026-06-20" }); // current week
  await seedClass(t, { pid: "NEXT_KEEP", date: "2026-06-25" }); // next week

  // The failed week must not abort the action.
  const result = await t.action(internal.pool.scrape.scrapeWeek, { now: NOW });

  const rows = await t.run((ctx) => ctx.db.query("classes").collect());
  // Current week reconciled: its vanished future class is gone, fixture cached.
  expect(rows.some((c) => c.pid === "CUR_GONE")).toBe(false);
  expect(rows.some((c) => c.date >= CURRENT_WEEK && c.date < NEXT_WEEK)).toBe(
    true,
  );
  // Next week's fetch FAILED → its cached row is NOT wiped (invariant 2)…
  expect(rows.some((c) => c.pid === "NEXT_KEEP")).toBe(true);
  // …and the failed week contributed no fresh fixture rows.
  expect(rows.some((c) => c.date >= NEXT_WEEK && c.pid !== "NEXT_KEEP")).toBe(
    false,
  );
  // Only the current week was upserted/reconciled.
  expect(result.upserted).toBe(PER_WEEK);
  expect(result.deleted).toBe(1);
});

test("an empty (soft-failure) scrape for a week keeps its cached future rows; the other week still reconciles", async () => {
  const t = convexTest(schema, modules);
  // A soft failure: the pool returns HTTP 200 with a maintenance/login/empty
  // body, so fetchSchedule does NOT throw — it parses to []. The NEXT week
  // scrapes empty; the current week succeeds.
  const emptyNextGateway: PoolGateway = {
    ...fakeGateway,
    fetchSchedule: async (weekStart) => {
      if (weekStart === NEXT_WEEK) return [];
      return classesForWeek(weekStart);
    },
  };
  setPoolGateway(emptyNextGateway);

  // A future, absent-from-scrape class in EACH week.
  await seedClass(t, { pid: "CUR_GONE", date: "2026-06-20" }); // current week
  await seedClass(t, { pid: "NEXT_KEEP", date: "2026-06-25" }); // next week

  // An empty scrape must not abort the action.
  const result = await t.action(internal.pool.scrape.scrapeWeek, { now: NOW });

  const rows = await t.run((ctx) => ctx.db.query("classes").collect());
  // Current week reconciled: its vanished future class is gone, fixture cached.
  expect(rows.some((c) => c.pid === "CUR_GONE")).toBe(false);
  expect(rows.some((c) => c.date >= CURRENT_WEEK && c.date < NEXT_WEEK)).toBe(
    true,
  );
  // Next week's scrape was EMPTY → its cached future row is NOT wiped as if "all
  // cancelled" (ADR-0006 invariant 2; the empty-scrape guard in scrapeWeek)…
  expect(rows.some((c) => c.pid === "NEXT_KEEP")).toBe(true);
  // …and the empty week contributed no fresh fixture rows.
  expect(rows.some((c) => c.date >= NEXT_WEEK && c.pid !== "NEXT_KEEP")).toBe(
    false,
  );
  // Only the current week was upserted/reconciled (the empty week is skipped).
  expect(result.upserted).toBe(PER_WEEK);
  expect(result.deleted).toBe(1);
});

test("re-running the scrape is idempotent: no duplicates and stable deletions", async () => {
  const t = convexTest(schema, modules);
  setPoolGateway(fakeGateway);

  await seedClass(t, { pid: "GONE", date: "2026-06-20" }); // future absent

  await t.action(internal.pool.scrape.scrapeWeek, { now: NOW });
  const afterFirst = await t.run((ctx) => ctx.db.query("classes").collect());

  await t.action(internal.pool.scrape.scrapeWeek, { now: NOW });
  const afterSecond = await t.run((ctx) => ctx.db.query("classes").collect());

  // Both weeks fully cached; the seeded future-absent row deleted exactly once.
  expect(afterFirst).toHaveLength(PER_WEEK * 2);
  expect(afterSecond).toHaveLength(PER_WEEK * 2);
  const key = (c: { pid: string; date: string }) => `${c.pid}\u0000${c.date}`;
  expect(afterSecond.map(key).sort()).toEqual(afterFirst.map(key).sort());
});
