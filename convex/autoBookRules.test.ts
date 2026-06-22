/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { POOL_DETAILS_INCOMPLETE_MESSAGE } from "./poolDetails";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

type Harness = TestConvex<typeof schema>;

const POOL_DETAILS = {
  name: "Jonas",
  surname: "Jonaitis",
  phone: "+37061234567",
  email: "jonas@example.com",
};

// 2026-06-18 is a Thursday → ISO weekday 4 (same fixtures as week.test.ts).
const THURSDAY_CLASS = {
  date: "2026-06-18",
  startTime: "07:00",
  endTime: "07:50",
  pid: "101",
  name: "Aqua",
  intensity: 2,
};
const FROM_THURSDAY = { pid: THURSDAY_CLASS.pid, date: THURSDAY_CLASS.date };

/** Seed a User whose Pool details are complete, so the booking gate passes. */
function seedUserWithDetails(t: Harness): Promise<Id<"users">> {
  return t.run((ctx) =>
    ctx.db.insert("users", { detailsComplete: true, poolDetails: POOL_DETAILS }),
  );
}

/** Seed the canonical class a rule is created from. */
function seedClass(t: Harness): Promise<Id<"classes">> {
  return t.run((ctx) => ctx.db.insert("classes", THURSDAY_CLASS));
}

describe("createFromClass", () => {
  test("captures pid, weekday (ISO), startTime and nameMatch from the canonical class", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUserWithDetails(t);
    await seedClass(t);
    const asUser = t.withIdentity({ subject: userId });

    await asUser.mutation(api.autoBookRules.createFromClass, FROM_THURSDAY);

    const rules = await asUser.query(api.autoBookRules.listMine, {});
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({
      weekday: 4, // ISO Thursday
      startTime: "07:00",
      nameMatch: "Aqua",
      pid: "101",
      enabled: true,
    });
  });

  test("refuses until Pool details are complete (booking gate)", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) => ctx.db.insert("users", {}));
    await seedClass(t);
    const asUser = t.withIdentity({ subject: userId });

    await expect(
      asUser.mutation(api.autoBookRules.createFromClass, FROM_THURSDAY),
    ).rejects.toThrow(POOL_DETAILS_INCOMPLETE_MESSAGE);

    expect(await asUser.query(api.autoBookRules.listMine, {})).toHaveLength(0);
  });

  test("throws when the class is not in the cached schedule", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUserWithDetails(t);
    const asUser = t.withIdentity({ subject: userId });

    await expect(
      asUser.mutation(api.autoBookRules.createFromClass, {
        pid: "999",
        date: "2026-06-18",
      }),
    ).rejects.toThrow(/not in this week/i);
  });

  test("is idempotent on pid and re-enables a disabled match", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUserWithDetails(t);
    await seedClass(t);
    const asUser = t.withIdentity({ subject: userId });

    const ruleId = await asUser.mutation(
      api.autoBookRules.createFromClass,
      FROM_THURSDAY,
    );
    await asUser.mutation(api.autoBookRules.setRuleEnabled, {
      ruleId,
      enabled: false,
    });

    const again = await asUser.mutation(
      api.autoBookRules.createFromClass,
      FROM_THURSDAY,
    );

    expect(again).toBe(ruleId);
    const rules = await asUser.query(api.autoBookRules.listMine, {});
    expect(rules).toHaveLength(1);
    expect(rules[0].enabled).toBe(true);
  });

  test("dedupe is by pid: two slots sharing name+time but different pid → two rules", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUserWithDetails(t);
    await seedClass(t); // pid 101
    // A second class, same date/time/name, different pid (what would have been
    // "ambiguous" under name+time matching). pid is the dedupe key now.
    await t.run((ctx) =>
      ctx.db.insert("classes", { ...THURSDAY_CLASS, pid: "102" }),
    );
    const asUser = t.withIdentity({ subject: userId });

    await asUser.mutation(api.autoBookRules.createFromClass, FROM_THURSDAY); // 101
    await asUser.mutation(api.autoBookRules.createFromClass, {
      pid: "102",
      date: THURSDAY_CLASS.date,
    });

    const rules = await asUser.query(api.autoBookRules.listMine, {});
    expect(rules).toHaveLength(2);
    expect(rules.map((r) => r.pid).sort()).toEqual(["101", "102"]);
  });
});

describe("listMine — per-User isolation", () => {
  test("a User sees only their own rules", async () => {
    const t = convexTest(schema, modules);
    const userA = await seedUserWithDetails(t);
    const userB = await seedUserWithDetails(t);
    await seedClass(t);

    await t
      .withIdentity({ subject: userA })
      .mutation(api.autoBookRules.createFromClass, FROM_THURSDAY);

    expect(
      await t.withIdentity({ subject: userA }).query(api.autoBookRules.listMine, {}),
    ).toHaveLength(1);
    expect(
      await t.withIdentity({ subject: userB }).query(api.autoBookRules.listMine, {}),
    ).toHaveLength(0);
  });

  test("an unauthenticated caller cannot list rules", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.autoBookRules.listMine, {})).rejects.toThrow(
      "Not authenticated",
    );
  });
});

describe("setRuleEnabled / deleteRule — owner-scoped", () => {
  test("the owner can disable then re-enable their rule", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUserWithDetails(t);
    await seedClass(t);
    const asUser = t.withIdentity({ subject: userId });
    const ruleId = await asUser.mutation(
      api.autoBookRules.createFromClass,
      FROM_THURSDAY,
    );

    await asUser.mutation(api.autoBookRules.setRuleEnabled, {
      ruleId,
      enabled: false,
    });
    expect((await asUser.query(api.autoBookRules.listMine, {}))[0].enabled).toBe(
      false,
    );

    await asUser.mutation(api.autoBookRules.setRuleEnabled, {
      ruleId,
      enabled: true,
    });
    expect((await asUser.query(api.autoBookRules.listMine, {}))[0].enabled).toBe(
      true,
    );
  });

  test("a User cannot toggle another User's rule", async () => {
    const t = convexTest(schema, modules);
    const userA = await seedUserWithDetails(t);
    const userB = await seedUserWithDetails(t);
    await seedClass(t);
    const ruleId = await t
      .withIdentity({ subject: userA })
      .mutation(api.autoBookRules.createFromClass, FROM_THURSDAY);

    await expect(
      t
        .withIdentity({ subject: userB })
        .mutation(api.autoBookRules.setRuleEnabled, { ruleId, enabled: false }),
    ).rejects.toThrow(/not found/i);

    // A's rule is untouched.
    expect(
      (await t.withIdentity({ subject: userA }).query(api.autoBookRules.listMine, {}))[0]
        .enabled,
    ).toBe(true);
  });

  test("the owner can delete their rule", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUserWithDetails(t);
    await seedClass(t);
    const asUser = t.withIdentity({ subject: userId });
    const ruleId = await asUser.mutation(
      api.autoBookRules.createFromClass,
      FROM_THURSDAY,
    );

    await asUser.mutation(api.autoBookRules.deleteRule, { ruleId });
    expect(await asUser.query(api.autoBookRules.listMine, {})).toHaveLength(0);
  });

  test("a User cannot delete another User's rule", async () => {
    const t = convexTest(schema, modules);
    const userA = await seedUserWithDetails(t);
    const userB = await seedUserWithDetails(t);
    await seedClass(t);
    const ruleId = await t
      .withIdentity({ subject: userA })
      .mutation(api.autoBookRules.createFromClass, FROM_THURSDAY);

    await expect(
      t
        .withIdentity({ subject: userB })
        .mutation(api.autoBookRules.deleteRule, { ruleId }),
    ).rejects.toThrow(/not found/i);

    expect(
      await t.withIdentity({ subject: userA }).query(api.autoBookRules.listMine, {}),
    ).toHaveLength(1);
  });

  test("an unauthenticated caller cannot toggle or delete", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUserWithDetails(t);
    await seedClass(t);
    const ruleId = await t
      .withIdentity({ subject: userId })
      .mutation(api.autoBookRules.createFromClass, FROM_THURSDAY);

    await expect(
      t.mutation(api.autoBookRules.setRuleEnabled, { ruleId, enabled: false }),
    ).rejects.toThrow("Not authenticated");
    await expect(
      t.mutation(api.autoBookRules.deleteRule, { ruleId }),
    ).rejects.toThrow("Not authenticated");
  });
});

describe("backfillRulePids", () => {
  test("fills a legacy rule's pid from the matching slot; leaves it unset on no match", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUserWithDetails(t);
    await seedClass(t); // Thursday 07:00 "Aqua" pid 101
    // Legacy rule (no pid) for that slot → backfillable.
    const fillable = await t.run((ctx) =>
      ctx.db.insert("autoBookRules", {
        userId,
        weekday: 4,
        startTime: "07:00",
        nameMatch: "Aqua",
        enabled: true,
      }),
    );
    // Legacy rule whose slot is not in the cached schedule → cannot backfill.
    const orphan = await t.run((ctx) =>
      ctx.db.insert("autoBookRules", {
        userId,
        weekday: 2,
        startTime: "19:00",
        nameMatch: "Gone",
        enabled: true,
      }),
    );

    const res = await t.mutation(internal.autoBookRules.backfillRulePids, {});
    expect(res).toEqual({ total: 2, filled: 1, skipped: 1 });

    expect(
      (await t.run((ctx) => ctx.db.get("autoBookRules", fillable)))?.pid,
    ).toBe("101");
    expect(
      (await t.run((ctx) => ctx.db.get("autoBookRules", orphan)))?.pid,
    ).toBeUndefined();
  });

  test("is idempotent — a rule that already has a pid is untouched", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUserWithDetails(t);
    await seedClass(t);
    const ruleId = await t.run((ctx) =>
      ctx.db.insert("autoBookRules", {
        userId,
        pid: "999",
        weekday: 4,
        startTime: "07:00",
        nameMatch: "Aqua",
        enabled: true,
      }),
    );

    const res = await t.mutation(internal.autoBookRules.backfillRulePids, {});
    expect(res).toEqual({ total: 1, filled: 0, skipped: 0 });
    expect(
      (await t.run((ctx) => ctx.db.get("autoBookRules", ruleId)))?.pid,
    ).toBe("999");
  });
});
