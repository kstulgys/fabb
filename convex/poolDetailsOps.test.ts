/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import {
  ACCOUNT_EMAIL_MISSING_MESSAGE,
  POOL_DETAILS_INCOMPLETE_MESSAGE,
  validatePoolDetails,
} from "./poolDetails";
import schema from "./schema";
import { requirePoolDetails, requirePoolDetailsForAction } from "./poolDetailsOps";

const modules = import.meta.glob("./**/*.ts");

// The booking email is the User's account/signup email, never typed in the form.
const ACCOUNT_EMAIL = "jonas@example.com";
// What the form sends to setPoolDetails: the three user-entered fields.
const INPUT = { name: "Jonas", surname: "Jonaitis", phone: "+37061234567" };
// What gets stored: the three input fields plus the stamped account email.
const STORED = { ...INPUT, email: ACCOUNT_EMAIL };

describe("setPoolDetails + myPoolDetails", () => {
  test("valid details flip detailsComplete and stamp the account email", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", { email: ACCOUNT_EMAIL }),
    );
    const asUser = t.withIdentity({ subject: userId });

    await asUser.mutation(api.poolDetailsOps.setPoolDetails, INPUT);

    const mine = await asUser.query(api.poolDetailsOps.myPoolDetails, {});
    expect(mine.detailsComplete).toBe(true);
    // The stored email is the account email — never asked for in the form.
    expect(mine.poolDetails).toEqual(STORED);
  });

  test("a later edit overwrites the earlier values, email stays the account one", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", { email: ACCOUNT_EMAIL }),
    );
    const asUser = t.withIdentity({ subject: userId });

    await asUser.mutation(api.poolDetailsOps.setPoolDetails, INPUT);
    await asUser.mutation(api.poolDetailsOps.setPoolDetails, {
      ...INPUT,
      surname: "Petraitis",
      phone: "+37060000000",
    });

    const mine = await asUser.query(api.poolDetailsOps.myPoolDetails, {});
    expect(mine.poolDetails?.surname).toBe("Petraitis");
    expect(mine.poolDetails?.phone).toBe("+37060000000");
    expect(mine.poolDetails?.email).toBe(ACCOUNT_EMAIL);
  });

  test("an account with no email cannot complete details", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) => ctx.db.insert("users", {}));
    const asUser = t.withIdentity({ subject: userId });

    await expect(
      asUser.mutation(api.poolDetailsOps.setPoolDetails, INPUT),
    ).rejects.toThrow(ACCOUNT_EMAIL_MISSING_MESSAGE);

    const mine = await asUser.query(api.poolDetailsOps.myPoolDetails, {});
    expect(mine.detailsComplete).toBe(false);
    expect(mine.poolDetails).toBeNull();
  });

  test("a phone that is not +370… is rejected", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", { email: ACCOUNT_EMAIL }),
    );
    const asUser = t.withIdentity({ subject: userId });

    await expect(
      asUser.mutation(api.poolDetailsOps.setPoolDetails, {
        ...INPUT,
        phone: "861234567",
      }),
    ).rejects.toThrow(/\+370/);
  });

  test("an unauthenticated caller cannot set or read details", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.poolDetailsOps.setPoolDetails, INPUT),
    ).rejects.toThrow("Not authenticated");
    await expect(t.query(api.poolDetailsOps.myPoolDetails, {})).rejects.toThrow(
      "Not authenticated",
    );
  });
});

describe("requirePoolDetails — booking gate (query/mutation ctx)", () => {
  test("passes and returns the details when complete", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", { email: ACCOUNT_EMAIL }),
    );
    const asUser = t.withIdentity({ subject: userId });
    await asUser.mutation(api.poolDetailsOps.setPoolDetails, INPUT);

    const gated = await asUser.query((ctx) => requirePoolDetails(ctx));
    expect(gated.userId).toBe(userId);
    expect(gated.poolDetails).toEqual(STORED);
  });

  test("refuses with the complete-your-details signal when incomplete", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", { email: ACCOUNT_EMAIL }),
    );
    const asUser = t.withIdentity({ subject: userId });

    await expect(asUser.query((ctx) => requirePoolDetails(ctx))).rejects.toThrow(
      POOL_DETAILS_INCOMPLETE_MESSAGE,
    );
  });
});

describe("requirePoolDetailsForAction — booking gate (action ctx)", () => {
  test("passes and returns the details when complete", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", { email: ACCOUNT_EMAIL }),
    );
    const asUser = t.withIdentity({ subject: userId });
    await asUser.mutation(api.poolDetailsOps.setPoolDetails, INPUT);

    const gated = await asUser.action((ctx) => requirePoolDetailsForAction(ctx));
    expect(gated.userId).toBe(userId);
    expect(gated.poolDetails).toEqual(STORED);
  });

  test("refuses with the complete-your-details signal when incomplete", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", { email: ACCOUNT_EMAIL }),
    );
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

  await t
    .withIdentity({ subject: userA })
    .mutation(api.poolDetailsOps.setPoolDetails, INPUT);

  // B's own details view never contains A's PII.
  const bDetails = await t
    .withIdentity({ subject: userB })
    .query(api.poolDetailsOps.myPoolDetails, {});
  expect(bDetails.detailsComplete).toBe(false);
  expect(bDetails.poolDetails).toBeNull();

  // B reading their own User doc never leaks A's poolDetails either.
  const bUser = await t
    .withIdentity({ subject: userB })
    .query(api.users.currentUser, {});
  expect(bUser?.poolDetails).toBeUndefined();
  expect(bUser?.email).toBe("b@example.com");

  // Sanity: A reads their own — stamped with A's account email, not B's.
  const aDetails = await t
    .withIdentity({ subject: userA })
    .query(api.poolDetailsOps.myPoolDetails, {});
  expect(aDetails.poolDetails).toEqual({ ...INPUT, email: "a@example.com" });
});

describe("validatePoolDetails (pure)", () => {
  test("accepts and trims the three input fields", () => {
    const r = validatePoolDetails({
      name: " Jonas ",
      surname: " Jonaitis ",
      phone: " +37061234567 ",
    });
    expect(r).toEqual({ ok: true, value: INPUT });
  });

  test.each([
    "861234567", // missing +370
    "+3706123456", // too short
    "+370612345678", // too long
    "+37061234abc", // non-digits
  ])("rejects phone %s", (phone) => {
    const r = validatePoolDetails({ ...INPUT, phone });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe("phone");
  });

  test("flags an empty name or surname", () => {
    expect(validatePoolDetails({ ...INPUT, name: "  " }).ok).toBe(false);
    expect(validatePoolDetails({ ...INPUT, surname: "" }).ok).toBe(false);
  });
});
