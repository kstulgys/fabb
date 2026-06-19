/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { PoolGateway } from "./pool/gateway";
import { setPoolGateway } from "./pool/gateway";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// Fake gateway: never touches the network. It records the (pid,date)
// it was asked for so we can prove the action fetches live, per class.
const calls: Array<{ pid: string; date: string }> = [];
const fakeGateway: PoolGateway = {
  fetchSchedule: async () => {
    throw new Error("liveAvailability must not fetch the schedule");
  },
  fetchEventDetail: async () => {
    throw new Error("liveAvailability must not fetch event detail");
  },
  fetchAvailability: async (pid, date) => {
    calls.push({ pid, date });
    return pid === "999"
      ? { free: 5, registered: 10, max: null }
      : { free: 14, registered: 6, max: 20 };
  },
  book: async () => {
    throw new Error("liveAvailability must not book");
  },
};

afterEach(() => {
  setPoolGateway(null); // restore the real gateway
  calls.length = 0;
});

test("liveAvailability fetches the live counts for the requested class", async () => {
  const t = convexTest(schema, modules);
  setPoolGateway(fakeGateway);
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", { email: "u@example.com" }),
  );

  const avail = await t
    .withIdentity({ subject: userId })
    .action(api.pool.availability.liveAvailability, {
      pid: "258",
      date: "2026-06-15",
    });

  expect(avail).toEqual({ free: 14, registered: 6, max: 20 });
  // Fetched live, by (pid,date) — not read from any cache.
  expect(calls).toEqual([{ pid: "258", date: "2026-06-15" }]);
});

test("liveAvailability returns null fields when the modal omits them", async () => {
  const t = convexTest(schema, modules);
  setPoolGateway(fakeGateway);
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", { email: "u@example.com" }),
  );

  const avail = await t
    .withIdentity({ subject: userId })
    .action(api.pool.availability.liveAvailability, {
      pid: "999",
      date: "2026-06-15",
    });

  expect(avail).toEqual({ free: 5, registered: 10, max: null });
});

test("liveAvailability rejects an unauthenticated caller", async () => {
  const t = convexTest(schema, modules);
  setPoolGateway(fakeGateway);

  await expect(
    t.action(api.pool.availability.liveAvailability, {
      pid: "258",
      date: "2026-06-15",
    }),
  ).rejects.toThrow("Not authenticated");
  // It must bail on auth before reaching out to the pool.
  expect(calls).toEqual([]);
});
