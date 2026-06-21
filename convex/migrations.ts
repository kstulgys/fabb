import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { encryptField, isEncrypted } from "./crypto";
import { poolDetailsValidator } from "./poolDetails";

/** Users whose poolDetails still hold any plaintext field. */
export const listForMigration = internalQuery({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    return users
      .filter(
        (u) =>
          u.poolDetails &&
          !(
            isEncrypted(u.poolDetails.name) &&
            isEncrypted(u.poolDetails.surname) &&
            isEncrypted(u.poolDetails.phone)
          ),
      )
      .map((u) => ({ userId: u._id, poolDetails: u.poolDetails! }));
  },
});

export const patchPoolDetails = internalMutation({
  args: { userId: v.id("users"), poolDetails: poolDetailsValidator },
  handler: async (ctx, { userId, poolDetails }): Promise<null> => {
    await ctx.db.patch("users", userId, { poolDetails });
    return null;
  },
});

/**
 * One-off: encrypt any legacy plaintext name/surname/phone. An action because
 * encryption is actions-only. Idempotent. Run once after deploy:
 * `npx convex run migrations:migratePoolDetailsToEncrypted`.
 */
export const migratePoolDetailsToEncrypted = internalAction({
  args: {},
  handler: async (ctx): Promise<{ migrated: number }> => {
    const rows: {
      userId: Id<"users">;
      poolDetails: { name: string; surname: string; phone: string; email: string };
    }[] = await ctx.runQuery(internal.migrations.listForMigration, {});
    for (const { userId, poolDetails: pd } of rows) {
      await ctx.runMutation(internal.migrations.patchPoolDetails, {
        userId,
        poolDetails: {
          name: isEncrypted(pd.name) ? pd.name : await encryptField(pd.name),
          surname: isEncrypted(pd.surname) ? pd.surname : await encryptField(pd.surname),
          phone: isEncrypted(pd.phone) ? pd.phone : await encryptField(pd.phone),
          email: pd.email,
        },
      });
    }
    return { migrated: rows.length };
  },
});
