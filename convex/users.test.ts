/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("per-User isolation", () => {
  test("currentUser resolves only the calling User's own record", async () => {
    const t = convexTest(schema, modules);
    const { userA, userB } = await t.run(async (ctx) => {
      const userA = await ctx.db.insert("users", { email: "a@example.com" });
      const userB = await ctx.db.insert("users", { email: "b@example.com" });
      return { userA, userB };
    });

    const asA = await t
      .withIdentity({ subject: userA })
      .query(api.users.currentUser, {});
    const asB = await t
      .withIdentity({ subject: userB })
      .query(api.users.currentUser, {});

    // Each caller sees their own record...
    expect(asA?._id).toBe(userA);
    expect(asA?.email).toBe("a@example.com");
    expect(asB?._id).toBe(userB);
    expect(asB?.email).toBe("b@example.com");
    // ...and never the other User's data.
    expect(asA?._id).not.toBe(asB?._id);
    expect(asA?.email).not.toBe(asB?.email);
  });

  test("currentUser returns null for an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("users", { email: "a@example.com" });
    });

    expect(await t.query(api.users.currentUser, {})).toBeNull();
  });

  test("the requireUserId guard rejects an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);

    // myPoolDetails (now in poolDetailsOps) guards on the same requireUserId
    // identity primitive this module owns — asserted here so the guard-demo
    // coverage outlives the dead profile query it replaced.
    await expect(t.query(api.poolDetailsOps.myPoolDetails, {})).rejects.toThrow(
      "Not authenticated",
    );
  });
});
