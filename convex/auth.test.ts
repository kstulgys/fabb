/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("email/password sign-up creates a resolvable User", async () => {
  const t = convexTest(schema, modules);

  await t.action(api.auth.signIn, {
    provider: "password",
    params: {
      email: "newuser@example.com",
      password: "supersecret123",
      flow: "signUp",
    },
  });

  // Sign-up created exactly one User with that email.
  const userId = await t.run(async (ctx) => {
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", "newuser@example.com"))
      .unique();
    return user?._id ?? null;
  });
  expect(userId).not.toBeNull();

  // ...and that User is resolvable from its auth identity.
  const me = await t
    .withIdentity({ subject: userId! })
    .query(api.users.currentUser, {});
  expect(me?.email).toBe("newuser@example.com");
});
