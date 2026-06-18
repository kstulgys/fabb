/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { POOL_DETAILS_INCOMPLETE_MESSAGE, validatePoolDetails } from "./poolDetails";
import schema from "./schema";
import { requirePoolDetails, requirePoolDetailsForAction } from "./users";

const modules = import.meta.glob("./**/*.ts");

const VALID = {
  name: "Jonas",
  surname: "Jonaitis",
  phone: "+37061234567",
  email: "jonas@example.com",
};

describe("setPoolDetails + myPoolDetails", () => {
  test("valid details flip detailsComplete and are readable by the owner", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) => ctx.db.insert("users", {}));
    const asUser = t.withIdentity({ subject: userId });

    await asUser.mutation(api.users.setPoolDetails, VALID);

    const mine = await asUser.query(api.users.myPoolDetails, {});
    expect(mine.detailsComplete).toBe(true);
    expect(mine.poolDetails).toEqual(VALID);
  });

  test("a later edit overwrites the earlier values (settings re-save)", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) => ctx.db.insert("users", {}));
    const asUser = t.withIdentity({ subject: userId });

    await asUser.mutation(api.users.setPoolDetails, VALID);
    await asUser.mutation(api.users.setPoolDetails, {
      ...VALID,
      surname: "Petraitis",
      phone: "+37060000000",
    });

    const mine = await asUser.query(api.users.myPoolDetails, {});
    expect(mine.poolDetails?.surname).toBe("Petraitis");
    expect(mine.poolDetails?.phone).toBe("+37060000000");
  });

  test("an invalid email is rejected and nothing is persisted", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) => ctx.db.insert("users", {}));
    const asUser = t.withIdentity({ subject: userId });

    await expect(
      asUser.mutation(api.users.setPoolDetails, { ...VALID, email: "not-an-email" }),
    ).rejects.toThrow(/valid email/i);

    const mine = await asUser.query(api.users.myPoolDetails, {});
    expect(mine.detailsComplete).toBe(false);
    expect(mine.poolDetails).toBeNull();
  });

  test("a phone that is not +370… is rejected", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) => ctx.db.insert("users", {}));
    const asUser = t.withIdentity({ subject: userId });

    await expect(
      asUser.mutation(api.users.setPoolDetails, { ...VALID, phone: "861234567" }),
    ).rejects.toThrow(/\+370/);
  });

  test("an unauthenticated caller cannot set or read details", async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.users.setPoolDetails, VALID)).rejects.toThrow(
      "Not authenticated",
    );
    await expect(t.query(api.users.myPoolDetails, {})).rejects.toThrow(
      "Not authenticated",
    );
  });
});

describe("requirePoolDetails — booking gate (query/mutation ctx)", () => {
  test("passes and returns the details when complete", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) => ctx.db.insert("users", {}));
    const asUser = t.withIdentity({ subject: userId });
    await asUser.mutation(api.users.setPoolDetails, VALID);

    const gated = await asUser.query((ctx) => requirePoolDetails(ctx));
    expect(gated.userId).toBe(userId);
    expect(gated.poolDetails).toEqual(VALID);
  });

  test("refuses with the complete-your-details signal when incomplete", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) => ctx.db.insert("users", {}));
    const asUser = t.withIdentity({ subject: userId });

    await expect(asUser.query((ctx) => requirePoolDetails(ctx))).rejects.toThrow(
      POOL_DETAILS_INCOMPLETE_MESSAGE,
    );
  });
});

describe("requirePoolDetailsForAction — booking gate (action ctx)", () => {
  test("passes and returns the details when complete", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) => ctx.db.insert("users", {}));
    const asUser = t.withIdentity({ subject: userId });
    await asUser.mutation(api.users.setPoolDetails, VALID);

    const gated = await asUser.action((ctx) => requirePoolDetailsForAction(ctx));
    expect(gated.userId).toBe(userId);
    expect(gated.poolDetails).toEqual(VALID);
  });

  test("refuses with the complete-your-details signal when incomplete", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) => ctx.db.insert("users", {}));
    const asUser = t.withIdentity({ subject: userId });

    await expect(
      asUser.action((ctx) => requirePoolDetailsForAction(ctx)),
    ).rejects.toThrow(POOL_DETAILS_INCOMPLETE_MESSAGE);
  });

  test("refuses an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.action((ctx) => requirePoolDetailsForAction(ctx)),
    ).rejects.toThrow("Not authenticated");
  });
});

test("a second User cannot read the first User's Pool details (isolation)", async () => {
  const t = convexTest(schema, modules);
  const { userA, userB } = await t.run(async (ctx) => {
    const userA = await ctx.db.insert("users", { email: "a@example.com" });
    const userB = await ctx.db.insert("users", { email: "b@example.com" });
    return { userA, userB };
  });

  await t.withIdentity({ subject: userA }).mutation(api.users.setPoolDetails, VALID);

  // B's own details view never contains A's PII.
  const bDetails = await t
    .withIdentity({ subject: userB })
    .query(api.users.myPoolDetails, {});
  expect(bDetails.detailsComplete).toBe(false);
  expect(bDetails.poolDetails).toBeNull();

  // B reading their own User doc never leaks A's poolDetails either.
  const bUser = await t
    .withIdentity({ subject: userB })
    .query(api.users.currentUser, {});
  expect(bUser?.poolDetails).toBeUndefined();
  expect(bUser?.email).toBe("b@example.com");

  // Sanity: A still reads their own.
  const aDetails = await t
    .withIdentity({ subject: userA })
    .query(api.users.myPoolDetails, {});
  expect(aDetails.poolDetails).toEqual(VALID);
});

describe("validatePoolDetails (pure)", () => {
  test("accepts and trims valid input", () => {
    const r = validatePoolDetails({
      name: " Jonas ",
      surname: " Jonaitis ",
      phone: " +37061234567 ",
      email: " jonas@example.com ",
    });
    expect(r).toEqual({ ok: true, value: VALID });
  });

  test.each([
    "861234567", // missing +370
    "+3706123456", // too short
    "+370612345678", // too long
    "+37061234abc", // non-digits
  ])("rejects phone %s", (phone) => {
    const r = validatePoolDetails({ ...VALID, phone });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe("phone");
  });

  test.each([
    "plain",
    "a@b", // no dot in domain
    "a b@c.com", // whitespace
  ])("rejects email %s", (email) => {
    const r = validatePoolDetails({ ...VALID, email });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe("email");
  });

  test("flags an empty name or surname", () => {
    expect(validatePoolDetails({ ...VALID, name: "  " }).ok).toBe(false);
    expect(validatePoolDetails({ ...VALID, surname: "" }).ok).toBe(false);
  });
});
