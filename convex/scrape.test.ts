/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import eventCalAlt from "./pool/fixtures/event-calories-alt.html?raw";
import eventNoCalories from "./pool/fixtures/event-no-calories.html?raw";
import eventWithCalories from "./pool/fixtures/event-with-calories.html?raw";
import scheduleHtml from "./pool/fixtures/schedule.html?raw";
import type { PoolGateway } from "./pool/gateway";
import { setPoolGateway } from "./pool/gateway";

const modules = import.meta.glob("./**/*.ts");

// Fixture-backed gateway: never touches the network. pid 213 is "Fat Killer"
// (no calories line); pid 121 has a different range; everything else uses the
// 500-800 fixture.
const fakeGateway: PoolGateway = {
  fetchScheduleHtml: async () => scheduleHtml,
  fetchEventHtml: async (pid) => {
    if (pid === "213") return eventNoCalories;
    if (pid === "121") return eventCalAlt;
    return eventWithCalories;
  },
  book: async () => {
    throw new Error("scrapeWeek must not book");
  },
};

afterEach(() => setPoolGateway(null)); // restore the real gateway

test("scrapeWeek upserts the week and re-running produces no duplicates", async () => {
  const t = convexTest(schema, modules);
  setPoolGateway(fakeGateway);

  const first = await t.action(internal.pool.scrape.scrapeWeek, {});
  const afterFirst = await t.run((ctx) => ctx.db.query("classes").collect());
  expect(first.upserted).toBe(29);
  expect(afterFirst).toHaveLength(29);

  // Same (pid,date) keys on re-run → rows refreshed in place, none added.
  const second = await t.action(internal.pool.scrape.scrapeWeek, {});
  const afterSecond = await t.run((ctx) => ctx.db.query("classes").collect());
  expect(second.upserted).toBe(29);
  expect(afterSecond).toHaveLength(29);
});

test("scrapeWeek stores parsed calories (present, alternate, and absent) and duration", async () => {
  const t = convexTest(schema, modules);
  setPoolGateway(fakeGateway);
  await t.action(internal.pool.scrape.scrapeWeek, {});

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
