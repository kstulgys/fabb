/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
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
  test("captures weekday (ISO), startTime and nameMatch from the canonical class", async () => {
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

  test("is idempotent on (weekday, startTime, nameMatch) and re-enables a disabled match", async () => {
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
