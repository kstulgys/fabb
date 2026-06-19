/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

type Harness = TestConvex<typeof schema>;

// 2026-06-18 is a Thursday (same fixtures as the rest of the suite). The
// Attendance conversion reads this canonical cached class.
const THURSDAY_CLASS = {
  date: "2026-06-18",
  startTime: "07:00",
  endTime: "07:50",
  pid: "101",
  name: "Aqua",
  intensity: 2,
  kcalMin: 300,
  kcalMax: 450,
};

// The Thursday class runs 07:00–07:50; in June Vilnius is UTC+3.
// 06:00Z = 09:00 Vilnius on the 18th → the class has ended (convertible).
const AFTER_CLASS = Date.parse("2026-06-18T06:00:00Z");
// 03:00Z = 06:00 Vilnius on the 18th → before the 07:00 start (not ended).
const BEFORE_CLASS = Date.parse("2026-06-18T03:00:00Z");

/** A bare User — logging isn't booking, so no Pool details are needed. */
function seedUser(t: Harness): Promise<Id<"users">> {
  return t.run((ctx) => ctx.db.insert("users", {}));
}

/** Seed the canonical class the conversion reads from the cache. */
function seedClass(
  t: Harness,
  overrides: Partial<typeof THURSDAY_CLASS> = {},
): Promise<Id<"classes">> {
  return t.run((ctx) =>
    ctx.db.insert("classes", { ...THURSDAY_CLASS, ...overrides }),
  );
}

/**
 * Seed a Booking row directly — the network booking path is tested elsewhere
 * (`book.test.ts` / `autoBook.test.ts`). Defaults to a held `now` /
 * `registered` Booking on the canonical Thursday class.
 */
function seedBooking(
  t: Harness,
  userId: Id<"users">,
  over: Partial<{
    pid: string;
    date: string;
    source: "rule" | "now";
    status: "registered" | "already" | "full" | "error";
  }> = {},
): Promise<Id<"bookings">> {
  const status = over.status ?? "registered";
  return t.run((ctx) =>
    ctx.db.insert("bookings", {
      userId,
      pid: THURSDAY_CLASS.pid,
      date: THURSDAY_CLASS.date,
      source: "now",
      status,
      runLog: [{ at: Date.now(), outcome: status, message: "seed" }],
      ...over,
    }),
  );
}

describe("convertCompletedBookings — booking → Training log", () => {
  test("a finished registered Booking yields one attended log with the class Calories", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedClass(t);
    const bookingId = await seedBooking(t, userId, { status: "registered" });

    const res = await t.mutation(
      internal.attendance.convertCompletedBookings,
      { now: AFTER_CLASS },
    );
    expect(res).toEqual({ converted: 1 });

    const logs = await t
      .withIdentity({ subject: userId })
      .query(api.trainingLogs.listMine, {});
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      className: "Aqua",
      date: "2026-06-18",
      intensity: 2,
      kcalMin: 300,
      kcalMax: 450,
      attended: true,
      bookingId,
    });
  });

  test("an 'already' Booking is a held spot and converts too", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedClass(t);
    await seedBooking(t, userId, { status: "already" });

    const res = await t.mutation(
      internal.attendance.convertCompletedBookings,
      { now: AFTER_CLASS },
    );
    expect(res).toEqual({ converted: 1 });
    const logs = await t
      .withIdentity({ subject: userId })
      .query(api.trainingLogs.listMine, {});
    expect(logs).toHaveLength(1);
    expect(logs[0].attended).toBe(true);
  });

  test("a full or error Booking is not attendance → no log", async () => {
    const t = convexTest(schema, modules);
    const userA = await seedUser(t);
    const userB = await seedUser(t);
    await seedClass(t);
    await seedBooking(t, userA, { status: "full" });
    await seedBooking(t, userB, { status: "error" });

    const res = await t.mutation(
      internal.attendance.convertCompletedBookings,
      { now: AFTER_CLASS },
    );
    expect(res).toEqual({ converted: 0 });
    expect(
      await t.withIdentity({ subject: userA }).query(api.trainingLogs.listMine, {}),
    ).toHaveLength(0);
    expect(
      await t.withIdentity({ subject: userB }).query(api.trainingLogs.listMine, {}),
    ).toHaveLength(0);
  });

  test("a Booking whose class has not yet ended yields no log", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedClass(t);
    await seedBooking(t, userId, { status: "registered" });

    const res = await t.mutation(
      internal.attendance.convertCompletedBookings,
      { now: BEFORE_CLASS },
    );
    expect(res).toEqual({ converted: 0 });
    expect(
      await t.withIdentity({ subject: userId }).query(api.trainingLogs.listMine, {}),
    ).toHaveLength(0);
  });

  test("re-running the cron never double-creates a log (idempotent via by_bookingId)", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedClass(t);
    await seedBooking(t, userId, { status: "registered" });

    const first = await t.mutation(
      internal.attendance.convertCompletedBookings,
      { now: AFTER_CLASS },
    );
    const second = await t.mutation(
      internal.attendance.convertCompletedBookings,
      { now: AFTER_CLASS },
    );
    expect(first).toEqual({ converted: 1 });
    expect(second).toEqual({ converted: 0 });
    expect(
      await t.withIdentity({ subject: userId }).query(api.trainingLogs.listMine, {}),
    ).toHaveLength(1);
  });

  test("a class with null Calories still produces a log", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedClass(t, { kcalMin: undefined, kcalMax: undefined });
    await seedBooking(t, userId, { status: "registered" });

    const res = await t.mutation(
      internal.attendance.convertCompletedBookings,
      { now: AFTER_CLASS },
    );
    expect(res).toEqual({ converted: 1 });
    const logs = await t
      .withIdentity({ subject: userId })
      .query(api.trainingLogs.listMine, {});
    expect(logs).toHaveLength(1);
    expect(logs[0].attended).toBe(true);
    expect(logs[0].kcalMin).toBeUndefined();
    expect(logs[0].kcalMax).toBeUndefined();
  });

  test("converts a rule-sourced Booking the same as a 'now' Booking (any source)", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedClass(t);
    const bookingId = await seedBooking(t, userId, {
      source: "rule",
      status: "registered",
    });

    await t.mutation(internal.attendance.convertCompletedBookings, {
      now: AFTER_CLASS,
    });
    const logs = await t
      .withIdentity({ subject: userId })
      .query(api.trainingLogs.listMine, {});
    expect(logs[0].bookingId).toBe(bookingId);
  });
});
