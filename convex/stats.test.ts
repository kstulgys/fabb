/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

type Harness = TestConvex<typeof schema>;

// Pin "now" so period/streak math is deterministic: 2026-06-18 (Thursday) in
// Europe/Vilnius (UTC+3 in June), the same canonical day the rest of the suite
// uses. Its week is 2026-06-15 … 06-21 and its month is 2026-06.
const NOW = Date.parse("2026-06-18T10:00:00Z");

function seedUser(t: Harness): Promise<Id<"users">> {
  return t.run((ctx) => ctx.db.insert("users", {}));
}

/** Insert a Training log directly — stats read logs, they don't create them, and
 * the create paths are covered in `trainingLogs.test.ts`. Defaults to an
 * attended "Aqua" with no Calories on the canonical Thursday. */
function seedLog(
  t: Harness,
  userId: Id<"users">,
  over: Partial<{
    className: string;
    date: string;
    intensity: number;
    kcalMin: number;
    kcalMax: number;
    attended: boolean;
  }> = {},
): Promise<Id<"trainingLogs">> {
  return t.run((ctx) =>
    ctx.db.insert("trainingLogs", {
      userId,
      className: over.className ?? "Aqua",
      date: over.date ?? "2026-06-18",
      intensity: over.intensity ?? 2,
      attended: over.attended ?? true,
      ...(over.kcalMin !== undefined ? { kcalMin: over.kcalMin } : {}),
      ...(over.kcalMax !== undefined ? { kcalMax: over.kcalMax } : {}),
    }),
  );
}

describe("stats.summary — period totals", () => {
  /** Seed a fixed mix once per period assertion. */
  async function seedMix(t: Harness, userId: Id<"users">) {
    await seedLog(t, userId, {
      className: "Aqua",
      date: "2026-06-16",
      kcalMin: 300,
      kcalMax: 450,
    }); // this week, mid 375
    await seedLog(t, userId, {
      className: "Aqua",
      date: "2026-06-18",
      kcalMin: 200,
      kcalMax: 400,
    }); // this week, mid 300
    await seedLog(t, userId, { className: "Spin", date: "2026-06-17" }); // this week, NULL calories
    await seedLog(t, userId, {
      className: "Aqua",
      date: "2026-06-10",
      kcalMin: 100,
      kcalMax: 200,
    }); // last week (same month), mid 150
    await seedLog(t, userId, {
      className: "Yoga",
      date: "2026-05-20",
      kcalMin: 500,
      kcalMax: 600,
    }); // last month, mid 550
    // attended:false — must be excluded from EVERY figure.
    await seedLog(t, userId, {
      className: "Boot",
      date: "2026-06-16",
      kcalMin: 999,
      kcalMax: 1000,
      attended: false,
    });
  }

  test("week sums midpoints, counts the null-Calorie class, drops the skipped one", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedMix(t, userId);

    const s = await t
      .withIdentity({ subject: userId })
      .query(api.stats.summary, { now: NOW });

    // 3 attended this week (incl. the null-Calorie Spin); calories 375 + 300.
    expect(s.totals.week).toEqual({ classes: 3, calories: 675 });
  });

  test("month and all-time totals scope correctly", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedMix(t, userId);
    const asUser = t.withIdentity({ subject: userId });

    const month = await asUser.query(api.stats.summary, { now: NOW });
    expect(month.totals.month).toEqual({ classes: 4, calories: 825 });

    const all = await asUser.query(api.stats.summary, { now: NOW });
    expect(all.totals.all).toEqual({ classes: 5, calories: 1375 });
  });

  test("weekly series and top types reflect attended logs only", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedMix(t, userId);

    const s = await t
      .withIdentity({ subject: userId })
      .query(api.stats.summary, { now: NOW });

    // Buckets ascending; the attended:false "Boot" never appears.
    expect(s.weekly).toEqual([
      { week: "2026-05-18", classes: 1, calories: 550 },
      { week: "2026-06-08", classes: 1, calories: 150 },
      { week: "2026-06-15", classes: 3, calories: 675 },
    ]);
    expect(s.topTypes).toEqual([
      { className: "Aqua", count: 3 },
      { className: "Spin", count: 1 },
      { className: "Yoga", count: 1 },
    ]);
  });
});

describe("stats.summary — null Calories vs attendance", () => {
  test("a null-Calorie attended log counts as a class but not as Calories", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedLog(t, userId, { date: "2026-06-16", kcalMin: 300, kcalMax: 450 });
    await seedLog(t, userId, { date: "2026-06-17" }); // null Calories

    const s = await t
      .withIdentity({ subject: userId })
      .query(api.stats.summary, { now: NOW });

    expect(s.totals.week).toEqual({ classes: 2, calories: 375 });
    expect(s.streak).toBe(1);
    expect(s.topTypes).toEqual([{ className: "Aqua", count: 2 }]);
  });
});

describe("stats.summary — attended:false is excluded everywhere", () => {
  test("a skipped class affects no count, calorie, streak, or type", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedLog(t, userId, { className: "Aqua", date: "2026-06-16" }); // attended, week 06-15
    // Skipped class in the gap week 06-08 with big calories + its own type.
    await seedLog(t, userId, {
      className: "Ghost",
      date: "2026-06-09",
      kcalMin: 1000,
      kcalMax: 1000,
      attended: false,
    });

    const s = await t
      .withIdentity({ subject: userId })
      .query(api.stats.summary, { now: NOW });

    expect(s.totals.all).toEqual({ classes: 1, calories: 0 });
    expect(s.topTypes).toEqual([{ className: "Aqua", count: 1 }]);
    // Were "Ghost" counted, week 06-08 would extend the streak to 2.
    expect(s.streak).toBe(1);
  });
});

describe("stats.summary — current streak across Vilnius week boundaries", () => {
  test("a Sunday log and the next Monday log are consecutive weeks", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedLog(t, userId, { date: "2026-06-15" }); // Monday → week 06-15
    await seedLog(t, userId, { date: "2026-06-14" }); // Sunday → week 06-08
    await seedLog(t, userId, { date: "2026-06-01" }); // Monday → week 06-01

    const s = await t
      .withIdentity({ subject: userId })
      .query(api.stats.summary, { now: NOW });

    expect(s.streak).toBe(3);
  });

  test("a fresh empty week keeps the run, but a two-week gap breaks it", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedLog(t, userId, { date: "2026-06-18" }); // week 06-15
    await seedLog(t, userId, { date: "2026-06-08" }); // week 06-08
    const asUser = t.withIdentity({ subject: userId });

    // Monday 2026-06-22 — the new week has no logs yet → grace via last week.
    const grace = await asUser.query(api.stats.summary, {
      now: Date.parse("2026-06-22T10:00:00Z"),
    });
    expect(grace.streak).toBe(2);

    // 2026-06-29 — last activity (week 06-15) is now two weeks back → broken.
    const broken = await asUser.query(api.stats.summary, {
      now: Date.parse("2026-06-29T10:00:00Z"),
    });
    expect(broken.streak).toBe(0);
  });
});

describe("stats.summary — owner isolation", () => {
  test("a User's stats never include another User's logs", async () => {
    const t = convexTest(schema, modules);
    const userA = await seedUser(t);
    const userB = await seedUser(t);

    // A: two Aqua this week with Calories.
    await seedLog(t, userA, { className: "Aqua", date: "2026-06-16", kcalMin: 300, kcalMax: 450 });
    await seedLog(t, userA, { className: "Aqua", date: "2026-06-17", kcalMin: 300, kcalMax: 450 });
    // B: one Spin this week, different type and Calories.
    await seedLog(t, userB, { className: "Spin", date: "2026-06-16", kcalMin: 100, kcalMax: 100 });

    const a = await t
      .withIdentity({ subject: userA })
      .query(api.stats.summary, { now: NOW });
    const b = await t
      .withIdentity({ subject: userB })
      .query(api.stats.summary, { now: NOW });

    expect(a.totals.week).toEqual({ classes: 2, calories: 750 });
    expect(a.topTypes).toEqual([{ className: "Aqua", count: 2 }]);
    expect(b.totals.week).toEqual({ classes: 1, calories: 100 });
    expect(b.topTypes).toEqual([{ className: "Spin", count: 1 }]);
  });

  test("an unauthenticated caller cannot read stats", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.query(api.stats.summary, {}),
    ).rejects.toThrow("Not authenticated");
  });
});
