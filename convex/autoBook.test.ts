/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { getFunctionName } from "convex/server";
import { afterEach, describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { BookingStatus } from "./bookingStatus";
import type { PoolGateway } from "./pool/gateway";
import { setPoolGateway } from "./pool/gateway";
import type { PoolDetails } from "./poolDetails";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type Harness = TestConvex<typeof schema>;

const VALID: PoolDetails = {
  name: "Jonas",
  surname: "Jonaitis",
  phone: "+37061234567",
  email: "jonas@example.com",
};

// The cron resolves TOMORROW's date. 2026-06-19 is a Friday → ISO weekday 5.
const TOMORROW = "2026-06-19";
// An eve-morning clock (the cron fires the day before): ~08:00 Vilnius on the
// 18th. Tomorrow's class is therefore always `upcoming` and bookable.
const EVE_NOW = Date.parse("2026-06-18T05:00:00Z");
// ~20:00 Vilnius on the 19th: the 18:00 class has finished — used to prove the
// retry stops once the class start time has passed.
const AFTER_START_NOW = Date.parse("2026-06-19T17:00:00Z");

const CLASS = {
  date: TOMORROW,
  startTime: "18:00",
  endTime: "18:50",
  pid: "258",
  name: "Aqua",
  intensity: 2,
};

// Fake gateway: records every book call, returns a configurable status, and
// NEVER touches the network or performs a real booking. The fetchers throw —
// the cron path must only ever call `book`.
const bookCalls: Array<{ pid: string; date: string; poolDetails: PoolDetails }> =
  [];
let bookResult: BookingStatus = "registered";
const fakeGateway: PoolGateway = {
  fetchScheduleHtml: async () => {
    throw new Error("the cron must not fetch the schedule");
  },
  fetchEventHtml: async () => {
    throw new Error("the cron must not fetch the event modal");
  },
  book: async (pid, date, poolDetails) => {
    bookCalls.push({ pid, date, poolDetails });
    return bookResult;
  },
};

afterEach(() => {
  setPoolGateway(null);
  bookCalls.length = 0;
  bookResult = "registered";
});

function seedOwner(t: Harness, complete = true): Promise<Id<"users">> {
  return t.run((ctx) =>
    ctx.db.insert(
      "users",
      complete ? { detailsComplete: true, poolDetails: VALID } : {},
    ),
  );
}

function seedRule(
  t: Harness,
  userId: Id<"users">,
  over: Partial<{
    weekday: number;
    startTime: string;
    nameMatch: string;
    enabled: boolean;
  }> = {},
): Promise<Id<"autoBookRules">> {
  return t.run((ctx) =>
    ctx.db.insert("autoBookRules", {
      userId,
      weekday: 5,
      startTime: CLASS.startTime,
      nameMatch: CLASS.name,
      enabled: true,
      ...over,
    }),
  );
}

function seedClass(t: Harness, over: Partial<typeof CLASS> = {}) {
  return t.run((ctx) => ctx.db.insert("classes", { ...CLASS, ...over }));
}

/** The retry attempts the action/mutation left pending in the scheduler. */
function scheduledAttempts(t: Harness) {
  return t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
}

const attemptFn = getFunctionName(internal.autoBookAttempt.attemptRule);

describe("attemptRule — resolves tomorrow's class and books it", () => {
  test("books the single matching class → source:'rule' Booking + ruleRuns entry", async () => {
    const t = convexTest(schema, modules);
    setPoolGateway(fakeGateway);
    bookResult = "registered";
    const userId = await seedOwner(t);
    const ruleId = await seedRule(t, userId);
    await seedClass(t);

    const res = await t.action(internal.autoBookAttempt.attemptRule, {
      ruleId,
      date: TOMORROW,
      attempt: 1,
      now: EVE_NOW,
    });

    expect(res).toEqual({ outcome: "registered", willRetry: false });
    // The gateway booked exactly this class with the OWNER's details (resolved
    // from the users table, not an auth identity).
    expect(bookCalls).toEqual([
      { pid: CLASS.pid, date: TOMORROW, poolDetails: VALID },
    ]);

    const bookings = await t.run((ctx) => ctx.db.query("bookings").collect());
    expect(bookings).toHaveLength(1);
    expect(bookings[0]).toMatchObject({
      userId,
      pid: CLASS.pid,
      date: TOMORROW,
      source: "rule",
      ruleId,
      status: "registered",
    });
    expect(bookings[0].runLog).toHaveLength(1);

    const runs = await t.run((ctx) => ctx.db.query("ruleRuns").collect());
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      ruleId,
      userId,
      date: TOMORROW,
      outcome: "registered",
      bookingId: bookings[0]._id,
    });

    // Terminal outcome → no retry scheduled.
    expect(await scheduledAttempts(t)).toHaveLength(0);
  });
});

describe("attemptRule — no match never books a wrong class", () => {
  test("a non-matching class tomorrow → no_match, zero bookings", async () => {
    const t = convexTest(schema, modules);
    setPoolGateway(fakeGateway);
    const userId = await seedOwner(t);
    const ruleId = await seedRule(t, userId);
    // A class exists tomorrow but at a different time → must NOT be booked.
    await seedClass(t, { startTime: "07:00", pid: "999" });

    const res = await t.action(internal.autoBookAttempt.attemptRule, {
      ruleId,
      date: TOMORROW,
      attempt: 1,
      now: EVE_NOW,
    });

    expect(res).toEqual({ outcome: "no_match", willRetry: false });
    expect(bookCalls).toEqual([]);
    expect(await t.run((ctx) => ctx.db.query("bookings").collect())).toEqual([]);
    const runs = await t.run((ctx) => ctx.db.query("ruleRuns").collect());
    expect(runs).toHaveLength(1);
    expect(runs[0].outcome).toBe("no_match");
    expect(await scheduledAttempts(t)).toHaveLength(0);
  });

  test("ambiguous: 2+ classes match → no_match, books nothing (never guesses)", async () => {
    const t = convexTest(schema, modules);
    setPoolGateway(fakeGateway);
    const userId = await seedOwner(t);
    const ruleId = await seedRule(t, userId);
    // Two classes share the rule's startTime + name (different pid) → ambiguous.
    await seedClass(t, { pid: "258" });
    await seedClass(t, { pid: "259" });

    const res = await t.action(internal.autoBookAttempt.attemptRule, {
      ruleId,
      date: TOMORROW,
      attempt: 1,
      now: EVE_NOW,
    });

    expect(res).toEqual({ outcome: "no_match", willRetry: false });
    expect(bookCalls).toEqual([]);
    expect(await t.run((ctx) => ctx.db.query("bookings").collect())).toEqual([]);
    const runs = await t.run((ctx) => ctx.db.query("ruleRuns").collect());
    expect(runs.map((r) => r.outcome)).toEqual(["no_match"]);
  });
});

describe("attemptRule — incomplete owner details", () => {
  test("owner without complete Pool details → no_details, no booking", async () => {
    const t = convexTest(schema, modules);
    setPoolGateway(fakeGateway);
    const userId = await seedOwner(t, false); // no poolDetails
    const ruleId = await seedRule(t, userId);
    await seedClass(t); // a class DOES match — the only blocker is the details

    const res = await t.action(internal.autoBookAttempt.attemptRule, {
      ruleId,
      date: TOMORROW,
      attempt: 1,
      now: EVE_NOW,
    });

    expect(res).toEqual({ outcome: "no_details", willRetry: false });
    expect(bookCalls).toEqual([]);
    expect(await t.run((ctx) => ctx.db.query("bookings").collect())).toEqual([]);
    const runs = await t.run((ctx) => ctx.db.query("ruleRuns").collect());
    expect(runs).toHaveLength(1);
    expect(runs[0].outcome).toBe("no_details");
  });
});

describe("attemptRule — retry behaviour", () => {
  test("a transient error schedules a retry (next attempt)", async () => {
    const t = convexTest(schema, modules);
    setPoolGateway(fakeGateway);
    bookResult = "error";
    const userId = await seedOwner(t);
    const ruleId = await seedRule(t, userId);
    await seedClass(t);

    const res = await t.action(internal.autoBookAttempt.attemptRule, {
      ruleId,
      date: TOMORROW,
      attempt: 1,
      now: EVE_NOW,
    });

    expect(res).toEqual({ outcome: "error", willRetry: true });
    const scheduled = await scheduledAttempts(t);
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].name).toBe(attemptFn);
    expect(scheduled[0].args).toEqual([
      { ruleId, date: TOMORROW, attempt: 2 },
    ]);
    // The failed attempt is still recorded in the run log.
    const runs = await t.run((ctx) => ctx.db.query("ruleRuns").collect());
    expect(runs).toHaveLength(1);
    expect(runs[0].outcome).toBe("error");
  });

  test.each<BookingStatus>(["registered", "already", "full"])(
    "a terminal '%s' outcome never schedules a retry",
    async (status) => {
      const t = convexTest(schema, modules);
      setPoolGateway(fakeGateway);
      bookResult = status;
      const userId = await seedOwner(t);
      const ruleId = await seedRule(t, userId);
      await seedClass(t);

      const res = await t.action(internal.autoBookAttempt.attemptRule, {
        ruleId,
        date: TOMORROW,
        attempt: 1,
        now: EVE_NOW,
      });

      expect(res).toEqual({ outcome: status, willRetry: false });
      expect(await scheduledAttempts(t)).toHaveLength(0);
    },
  );

  test("stops retrying once the class start time has passed", async () => {
    const t = convexTest(schema, modules);
    setPoolGateway(fakeGateway);
    bookResult = "error"; // would retry if it were still upcoming
    const userId = await seedOwner(t);
    const ruleId = await seedRule(t, userId);
    await seedClass(t);

    const res = await t.action(internal.autoBookAttempt.attemptRule, {
      ruleId,
      date: TOMORROW,
      attempt: 1,
      now: AFTER_START_NOW,
    });

    expect(res).toEqual({ outcome: "error", willRetry: false });
    // It never even tried to book a class whose start had passed.
    expect(bookCalls).toEqual([]);
    expect(await t.run((ctx) => ctx.db.query("bookings").collect())).toEqual([]);
    expect(await scheduledAttempts(t)).toHaveLength(0);
    const runs = await t.run((ctx) => ctx.db.query("ruleRuns").collect());
    expect(runs).toHaveLength(1);
    expect(runs[0].outcome).toBe("error");
    expect(runs[0].message).toMatch(/started/i);
  });

  test("a deleted/disabled rule by attempt time is a no-op (no run logged)", async () => {
    const t = convexTest(schema, modules);
    setPoolGateway(fakeGateway);
    const userId = await seedOwner(t);
    const ruleId = await seedRule(t, userId, { enabled: false });
    await seedClass(t);

    const res = await t.action(internal.autoBookAttempt.attemptRule, {
      ruleId,
      date: TOMORROW,
      attempt: 1,
      now: EVE_NOW,
    });

    expect(res).toEqual({ outcome: "cancelled", willRetry: false });
    expect(bookCalls).toEqual([]);
    expect(await t.run((ctx) => ctx.db.query("ruleRuns").collect())).toEqual([]);
  });
});

describe("runDayBefore — daily sweep", () => {
  test("schedules one attempt per enabled rule matching tomorrow's weekday", async () => {
    const t = convexTest(schema, modules);
    const u1 = await seedOwner(t);
    const u2 = await seedOwner(t);
    const enabledFri = await seedRule(t, u1, { weekday: 5, enabled: true });
    // Same weekday but disabled → skipped (different startTime to coexist).
    await seedRule(t, u1, { weekday: 5, enabled: false, startTime: "07:00" });
    // Enabled but a different weekday → not tomorrow.
    await seedRule(t, u2, { weekday: 3, enabled: true });

    const res = await t.mutation(internal.autoBook.runDayBefore, {
      now: EVE_NOW,
    });

    expect(res).toEqual({ date: TOMORROW, weekday: 5, scheduled: 1 });
    const scheduled = await scheduledAttempts(t);
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].name).toBe(attemptFn);
    expect(scheduled[0].args).toEqual([
      { ruleId: enabledFri, date: TOMORROW, attempt: 1 },
    ]);
  });

  test("no enabled rule matches tomorrow → schedules nothing", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedOwner(t);
    await seedRule(t, userId, { weekday: 3, enabled: true }); // Wednesday

    const res = await t.mutation(internal.autoBook.runDayBefore, {
      now: EVE_NOW,
    });

    expect(res).toEqual({ date: TOMORROW, weekday: 5, scheduled: 0 });
    expect(await scheduledAttempts(t)).toHaveLength(0);
  });
});

describe("recentRuns — per-rule run log (owner-scoped, for the UI)", () => {
  test("returns the caller's own runs newest-first; hides another User's", async () => {
    const t = convexTest(schema, modules);
    const u1 = await seedOwner(t);
    const u2 = await seedOwner(t);
    const ruleId = await seedRule(t, u1);
    await t.run((ctx) =>
      ctx.db.insert("ruleRuns", {
        ruleId,
        userId: u1,
        date: TOMORROW,
        at: 1,
        outcome: "no_match",
        message: "first",
      }),
    );
    await t.run((ctx) =>
      ctx.db.insert("ruleRuns", {
        ruleId,
        userId: u1,
        date: TOMORROW,
        at: 2,
        outcome: "registered",
        message: "second",
      }),
    );

    const mine = await t
      .withIdentity({ subject: u1 })
      .query(api.autoBook.recentRuns, { ruleId });
    expect(mine.map((r) => r.outcome)).toEqual(["registered", "no_match"]);

    // A different User cannot read this rule's run log.
    const theirs = await t
      .withIdentity({ subject: u2 })
      .query(api.autoBook.recentRuns, { ruleId });
    expect(theirs).toEqual([]);
  });

  test("rejects an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedOwner(t);
    const ruleId = await seedRule(t, userId);

    await expect(
      t.query(api.autoBook.recentRuns, { ruleId }),
    ).rejects.toThrow("Not authenticated");
  });
});
