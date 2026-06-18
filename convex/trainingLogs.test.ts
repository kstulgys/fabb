/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

type Harness = TestConvex<typeof schema>;

// 2026-06-18 is a Thursday (same fixtures as the rest of the suite). The pick
// path reads this canonical class; the typed path uses past, unpublished dates.
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
const FROM_THURSDAY = { pid: THURSDAY_CLASS.pid, date: THURSDAY_CLASS.date };

/** A bare User — logging isn't booking, so no Pool details are needed. */
function seedUser(t: Harness): Promise<Id<"users">> {
  return t.run((ctx) => ctx.db.insert("users", {}));
}

/** Seed the canonical class the pick path reads from the cache. */
function seedClass(
  t: Harness,
  overrides: Partial<typeof THURSDAY_CLASS> = {},
): Promise<Id<"classes">> {
  return t.run((ctx) =>
    ctx.db.insert("classes", { ...THURSDAY_CLASS, ...overrides }),
  );
}

describe("addFromClass — pick a current-week class", () => {
  test("copies name, date, intensity and Calories from the canonical class", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedClass(t);
    const asUser = t.withIdentity({ subject: userId });

    await asUser.mutation(api.trainingLogs.addFromClass, FROM_THURSDAY);

    const logs = await asUser.query(api.trainingLogs.listMine, {});
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      className: "Aqua",
      date: "2026-06-18",
      intensity: 2,
      kcalMin: 300,
      kcalMax: 450,
      attended: true,
    });
    // A manual log is never linked to a Booking.
    expect(logs[0].bookingId).toBeUndefined();
  });

  test("a picked class with no published Calories stores a null-calorie log", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedClass(t, { pid: "202", kcalMin: undefined, kcalMax: undefined });
    const asUser = t.withIdentity({ subject: userId });

    await asUser.mutation(api.trainingLogs.addFromClass, {
      pid: "202",
      date: "2026-06-18",
    });

    const logs = await asUser.query(api.trainingLogs.listMine, {});
    expect(logs[0].kcalMin).toBeUndefined();
    expect(logs[0].kcalMax).toBeUndefined();
    expect(logs[0].attended).toBe(true);
  });

  test("throws when the class is not in the cached schedule", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const asUser = t.withIdentity({ subject: userId });

    await expect(
      asUser.mutation(api.trainingLogs.addFromClass, {
        pid: "999",
        date: "2026-06-18",
      }),
    ).rejects.toThrow(/not in this week/i);
  });
});

describe("addManual — type details for a past class", () => {
  test("accepts a typed log with Calories left blank", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const asUser = t.withIdentity({ subject: userId });

    await asUser.mutation(api.trainingLogs.addManual, {
      className: "Spinning",
      date: "2026-05-01",
    });

    const logs = await asUser.query(api.trainingLogs.listMine, {});
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      className: "Spinning",
      date: "2026-05-01",
      intensity: 0,
      attended: true,
    });
    expect(logs[0].kcalMin).toBeUndefined();
    expect(logs[0].kcalMax).toBeUndefined();
    expect(logs[0].bookingId).toBeUndefined();
  });

  test("stores typed intensity and Calories when provided", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const asUser = t.withIdentity({ subject: userId });

    await asUser.mutation(api.trainingLogs.addManual, {
      className: "Yoga",
      date: "2026-05-02",
      intensity: 1,
      kcalMin: 100,
      kcalMax: 200,
    });

    const logs = await asUser.query(api.trainingLogs.listMine, {});
    expect(logs[0]).toMatchObject({ intensity: 1, kcalMin: 100, kcalMax: 200 });
  });

  test("requires a class name and a date", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const asUser = t.withIdentity({ subject: userId });

    await expect(
      asUser.mutation(api.trainingLogs.addManual, {
        className: "   ",
        date: "2026-05-02",
      }),
    ).rejects.toThrow(/name and date/i);
    await expect(
      asUser.mutation(api.trainingLogs.addManual, {
        className: "Yoga",
        date: "",
      }),
    ).rejects.toThrow(/name and date/i);
  });

  test("rejects a lone calorie bound — Calories are a range", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const asUser = t.withIdentity({ subject: userId });

    await expect(
      asUser.mutation(api.trainingLogs.addManual, {
        className: "Yoga",
        date: "2026-05-02",
        kcalMin: 100,
      }),
    ).rejects.toThrow(/both a minimum and maximum/i);
  });

  test("an unauthenticated caller cannot add", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.trainingLogs.addManual, {
        className: "Yoga",
        date: "2026-05-02",
      }),
    ).rejects.toThrow("Not authenticated");
  });
});

describe("listMine — per-User isolation + ordering", () => {
  test("a User sees only their own logs", async () => {
    const t = convexTest(schema, modules);
    const userA = await seedUser(t);
    const userB = await seedUser(t);

    await t
      .withIdentity({ subject: userA })
      .mutation(api.trainingLogs.addManual, {
        className: "A-class",
        date: "2026-05-01",
      });
    await t
      .withIdentity({ subject: userB })
      .mutation(api.trainingLogs.addManual, {
        className: "B-class",
        date: "2026-05-02",
      });

    const aLogs = await t
      .withIdentity({ subject: userA })
      .query(api.trainingLogs.listMine, {});
    const bLogs = await t
      .withIdentity({ subject: userB })
      .query(api.trainingLogs.listMine, {});

    expect(aLogs).toHaveLength(1);
    expect(aLogs[0].className).toBe("A-class");
    expect(bLogs).toHaveLength(1);
    expect(bLogs[0].className).toBe("B-class");
  });

  test("returns the caller's logs newest class date first", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const asUser = t.withIdentity({ subject: userId });

    await asUser.mutation(api.trainingLogs.addManual, {
      className: "Older",
      date: "2026-05-01",
    });
    await asUser.mutation(api.trainingLogs.addManual, {
      className: "Newer",
      date: "2026-06-01",
    });

    const logs = await asUser.query(api.trainingLogs.listMine, {});
    expect(logs.map((l) => l.className)).toEqual(["Newer", "Older"]);
  });

  test("an unauthenticated caller cannot list", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.trainingLogs.listMine, {})).rejects.toThrow(
      "Not authenticated",
    );
  });
});

describe("editLog / deleteLog — owner-scoped", () => {
  test("the owner can edit their log's details", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const asUser = t.withIdentity({ subject: userId });
    const logId = await asUser.mutation(api.trainingLogs.addManual, {
      className: "Yoga",
      date: "2026-05-02",
      kcalMin: 100,
      kcalMax: 200,
    });

    await asUser.mutation(api.trainingLogs.editLog, {
      logId,
      className: "Power Yoga",
      date: "2026-05-03",
      intensity: 3,
      kcalMin: 150,
      kcalMax: 250,
    });

    const logs = await asUser.query(api.trainingLogs.listMine, {});
    expect(logs[0]).toMatchObject({
      className: "Power Yoga",
      date: "2026-05-03",
      intensity: 3,
      kcalMin: 150,
      kcalMax: 250,
      attended: true,
    });
    expect(logs[0].bookingId).toBeUndefined();
  });

  test("editing with Calories left blank clears them", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const asUser = t.withIdentity({ subject: userId });
    const logId = await asUser.mutation(api.trainingLogs.addManual, {
      className: "Yoga",
      date: "2026-05-02",
      kcalMin: 100,
      kcalMax: 200,
    });

    await asUser.mutation(api.trainingLogs.editLog, {
      logId,
      className: "Yoga",
      date: "2026-05-02",
    });

    const logs = await asUser.query(api.trainingLogs.listMine, {});
    expect(logs[0].kcalMin).toBeUndefined();
    expect(logs[0].kcalMax).toBeUndefined();
  });

  test("a User cannot edit another User's log", async () => {
    const t = convexTest(schema, modules);
    const userA = await seedUser(t);
    const userB = await seedUser(t);
    const logId = await t
      .withIdentity({ subject: userA })
      .mutation(api.trainingLogs.addManual, {
        className: "A-class",
        date: "2026-05-01",
      });

    await expect(
      t.withIdentity({ subject: userB }).mutation(api.trainingLogs.editLog, {
        logId,
        className: "Hacked",
        date: "2026-05-01",
      }),
    ).rejects.toThrow(/not found/i);

    // A's log is untouched.
    const aLogs = await t
      .withIdentity({ subject: userA })
      .query(api.trainingLogs.listMine, {});
    expect(aLogs[0].className).toBe("A-class");
  });

  test("the owner can delete their log", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const asUser = t.withIdentity({ subject: userId });
    const logId = await asUser.mutation(api.trainingLogs.addManual, {
      className: "Yoga",
      date: "2026-05-02",
    });

    await asUser.mutation(api.trainingLogs.deleteLog, { logId });
    expect(await asUser.query(api.trainingLogs.listMine, {})).toHaveLength(0);
  });

  test("a User cannot delete another User's log", async () => {
    const t = convexTest(schema, modules);
    const userA = await seedUser(t);
    const userB = await seedUser(t);
    const logId = await t
      .withIdentity({ subject: userA })
      .mutation(api.trainingLogs.addManual, {
        className: "A-class",
        date: "2026-05-01",
      });

    await expect(
      t
        .withIdentity({ subject: userB })
        .mutation(api.trainingLogs.deleteLog, { logId }),
    ).rejects.toThrow(/not found/i);

    expect(
      await t
        .withIdentity({ subject: userA })
        .query(api.trainingLogs.listMine, {}),
    ).toHaveLength(1);
  });

  test("an unauthenticated caller cannot edit or delete", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const logId = await t
      .withIdentity({ subject: userId })
      .mutation(api.trainingLogs.addManual, {
        className: "Yoga",
        date: "2026-05-02",
      });

    await expect(
      t.mutation(api.trainingLogs.editLog, {
        logId,
        className: "X",
        date: "2026-05-02",
      }),
    ).rejects.toThrow("Not authenticated");
    await expect(
      t.mutation(api.trainingLogs.deleteLog, { logId }),
    ).rejects.toThrow("Not authenticated");
  });
});
