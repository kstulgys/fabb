/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { BookingStatus } from "./bookingStatus";
import type { PoolGateway } from "./pool/gateway";
import { setPoolGateway } from "./pool/gateway";
import { POOL_DETAILS_INCOMPLETE_MESSAGE, type PoolDetails } from "./poolDetails";
import schema from "./schema";
import { encryptedPoolDetails } from "./testHelpers";

const modules = import.meta.glob("./**/*.ts");

const VALID: PoolDetails = {
  name: "Jonas",
  surname: "Jonaitis",
  phone: "+37061234567",
  email: "jonas@example.com",
};

// A far-future class is always bookable, whenever the suite runs.
const FUTURE_CLASS = {
  date: "2099-01-05",
  startTime: "18:00",
  endTime: "19:00",
  pid: "258",
  name: "Aqua",
  intensity: 2,
};

// Fixture-backed gateway: returns a configurable status, records every book
// call, and NEVER touches the network or performs a real booking. The
// schedule/event fetchers throw — bookNow must not reach for them.
const bookCalls: Array<{ pid: string; date: string; poolDetails: PoolDetails }> =
  [];
let bookResult: BookingStatus = "registered";
const fakeGateway: PoolGateway = {
  fetchSchedule: async () => {
    throw new Error("bookNow must not fetch the schedule");
  },
  fetchEventDetail: async () => {
    throw new Error("bookNow must not fetch event detail");
  },
  fetchAvailability: async () => {
    throw new Error("bookNow must not fetch availability");
  },
  book: async (pid, date, poolDetails) => {
    bookCalls.push({ pid, date, poolDetails });
    return bookResult;
  },
};

afterEach(() => {
  setPoolGateway(null); // restore the real gateway
  bookCalls.length = 0;
  bookResult = "registered";
});

describe("bookNow (fake gateway — no network, no real booking)", () => {
  test.each<BookingStatus>(["registered", "already", "full", "error"])(
    "writes a source:'now' booking row carrying the '%s' status and returns it",
    async (status) => {
      const t = convexTest(schema, modules);
      setPoolGateway(fakeGateway);
      bookResult = status;
      const userId = await t.run(async (ctx) =>
        ctx.db.insert("users", {
          poolDetails: await encryptedPoolDetails(VALID, VALID.email),
          detailsComplete: true,
        }),
      );
      await t.run((ctx) => ctx.db.insert("classes", FUTURE_CLASS));

      const returned = await t
        .withIdentity({ subject: userId })
        .action(api.book.bookNow, {
          pid: FUTURE_CLASS.pid,
          date: FUTURE_CLASS.date,
        });

      expect(returned).toBe(status);
      // The gateway was asked to book exactly this class with the User's details.
      expect(bookCalls).toEqual([
        { pid: FUTURE_CLASS.pid, date: FUTURE_CLASS.date, poolDetails: VALID },
      ]);

      const rows = await t.run((ctx) => ctx.db.query("bookings").collect());
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        userId,
        pid: FUTURE_CLASS.pid,
        date: FUTURE_CLASS.date,
        source: "now",
        status,
      });
      expect(rows[0].runLog).toHaveLength(1);
      expect(rows[0].runLog[0].outcome).toBe(status);
      expect(typeof rows[0].runLog[0].at).toBe("number");
    },
  );

  test("ERRORS and books nothing when Pool details are incomplete (the gate)", async () => {
    const t = convexTest(schema, modules);
    setPoolGateway(fakeGateway);
    // A signed-in User who has not completed their Pool details.
    const userId = await t.run((ctx) => ctx.db.insert("users", {}));
    await t.run((ctx) => ctx.db.insert("classes", FUTURE_CLASS));

    await expect(
      t
        .withIdentity({ subject: userId })
        .action(api.book.bookNow, {
          pid: FUTURE_CLASS.pid,
          date: FUTURE_CLASS.date,
        }),
    ).rejects.toThrow(POOL_DETAILS_INCOMPLETE_MESSAGE);

    // It must refuse before reaching the pool, and write no Booking.
    expect(bookCalls).toEqual([]);
    const rows = await t.run((ctx) => ctx.db.query("bookings").collect());
    expect(rows).toEqual([]);
  });

  test("SUCCEEDS (and books) when Pool details are complete", async () => {
    const t = convexTest(schema, modules);
    setPoolGateway(fakeGateway);
    bookResult = "registered";
    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        poolDetails: await encryptedPoolDetails(VALID, VALID.email),
        detailsComplete: true,
      }),
    );
    await t.run((ctx) => ctx.db.insert("classes", FUTURE_CLASS));

    const returned = await t
      .withIdentity({ subject: userId })
      .action(api.book.bookNow, {
        pid: FUTURE_CLASS.pid,
        date: FUTURE_CLASS.date,
      });

    expect(returned).toBe("registered");
    expect(bookCalls).toHaveLength(1);
    const rows = await t.run((ctx) => ctx.db.query("bookings").collect());
    expect(rows).toHaveLength(1);
  });

  test("refuses a finished class without booking", async () => {
    const t = convexTest(schema, modules);
    setPoolGateway(fakeGateway);
    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        poolDetails: await encryptedPoolDetails(VALID, VALID.email),
        detailsComplete: true,
      }),
    );
    // A class on a past date is always 'finished' → not bookable.
    await t.run((ctx) =>
      ctx.db.insert("classes", { ...FUTURE_CLASS, date: "2020-01-01" }),
    );

    await expect(
      t
        .withIdentity({ subject: userId })
        .action(api.book.bookNow, { pid: FUTURE_CLASS.pid, date: "2020-01-01" }),
    ).rejects.toThrow(/finished/i);

    expect(bookCalls).toEqual([]);
    const rows = await t.run((ctx) => ctx.db.query("bookings").collect());
    expect(rows).toEqual([]);
  });

  test("refuses to book a class missing from this week's schedule", async () => {
    const t = convexTest(schema, modules);
    setPoolGateway(fakeGateway);
    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        poolDetails: await encryptedPoolDetails(VALID, VALID.email),
        detailsComplete: true,
      }),
    );
    // No class inserted → classForBooking returns null.

    await expect(
      t
        .withIdentity({ subject: userId })
        .action(api.book.bookNow, { pid: "404", date: FUTURE_CLASS.date }),
    ).rejects.toThrow(/not in this week/i);

    expect(bookCalls).toEqual([]);
  });

  test("rejects an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);
    setPoolGateway(fakeGateway);

    await expect(
      t.action(api.book.bookNow, {
        pid: FUTURE_CLASS.pid,
        date: FUTURE_CLASS.date,
      }),
    ).rejects.toThrow("Not authenticated");
    expect(bookCalls).toEqual([]);
  });
});

describe("bookNow — ADR-0003 manual threshold (injectable clock)", () => {
  // A fixed class whose status `now` decides; June Vilnius is UTC+3.
  const CLASS = {
    date: "2026-06-18",
    startTime: "07:00",
    endTime: "07:50",
    pid: "707",
    name: "Aqua",
    intensity: 2,
  };
  const IN_PROGRESS = Date.parse("2026-06-18T04:20:00Z"); // 07:20 Vilnius — underway
  const FINISHED = Date.parse("2026-06-18T05:00:00Z"); // 08:00 Vilnius — over

  test("books a class already IN PROGRESS — a manual click may grab a started class", async () => {
    const t = convexTest(schema, modules);
    setPoolGateway(fakeGateway);
    bookResult = "registered";
    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        poolDetails: await encryptedPoolDetails(VALID, VALID.email),
        detailsComplete: true,
      }),
    );
    await t.run((ctx) => ctx.db.insert("classes", CLASS));

    const returned = await t
      .withIdentity({ subject: userId })
      .action(api.book.bookNow, { pid: CLASS.pid, date: CLASS.date, now: IN_PROGRESS });

    expect(returned).toBe("registered");
    expect(bookCalls).toHaveLength(1);
  });

  test("refuses the same class once it has FINISHED", async () => {
    const t = convexTest(schema, modules);
    setPoolGateway(fakeGateway);
    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        poolDetails: await encryptedPoolDetails(VALID, VALID.email),
        detailsComplete: true,
      }),
    );
    await t.run((ctx) => ctx.db.insert("classes", CLASS));

    await expect(
      t
        .withIdentity({ subject: userId })
        .action(api.book.bookNow, { pid: CLASS.pid, date: CLASS.date, now: FINISHED }),
    ).rejects.toThrow(/finished/i);
    expect(bookCalls).toEqual([]);
  });
});
