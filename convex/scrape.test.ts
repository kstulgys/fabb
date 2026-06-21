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
import { weekStartsFor } from "./week";

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
