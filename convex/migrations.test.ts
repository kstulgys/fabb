/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { decryptPoolFields, isEncrypted } from "./crypto";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("migratePoolDetailsToEncrypted", () => {
  test("encrypts legacy plaintext rows and is idempotent", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", {
        email: "a@b.com",
        poolDetails: { name: "Jonas", surname: "J", phone: "+37061234567", email: "a@b.com" },
        detailsComplete: true,
      }),
    );

    const first = await t.action(internal.migrations.migratePoolDetailsToEncrypted, {});
    expect(first.migrated).toBe(1);

    const row = await t.run((ctx) => ctx.db.get("users", userId));
    expect(isEncrypted(row!.poolDetails!.name)).toBe(true);
    expect(await decryptPoolFields(row!.poolDetails!)).toEqual({
      name: "Jonas", surname: "J", phone: "+37061234567",
    });

    const second = await t.action(internal.migrations.migratePoolDetailsToEncrypted, {});
    expect(second.migrated).toBe(0); // idempotent
  });
});
