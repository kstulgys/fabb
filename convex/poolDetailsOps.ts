import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { decryptPoolFields, encryptPoolFields } from "./crypto";
import {
  ACCOUNT_EMAIL_MISSING_MESSAGE,
  EMAIL_RE,
  POOL_DETAILS_INCOMPLETE_MESSAGE,
  type PoolDetails,
  hasCompleteDetails,
  poolDetailsInputValidator,
  validatePoolDetails,
} from "./poolDetails";
import { requireUserId } from "./users";

/**
 * Pool-details ops + the booking gate. Pool details are the User's identity *to
 * the pool* — the four fields (name, surname, phone, email) the pool requires to
 * book, stored once per User and submitted on every Booking (CONTEXT.md: **Pool
 * details**). This module owns reading them ({@link myPoolDetails}), writing
 * them ({@link setPoolDetails}), and the gate every booking entry point passes
 * through to assert they are complete ({@link requirePoolDetails} /
 * {@link requirePoolDetailsForAction}).
 *
 * The shape itself lives in the server-free `./poolDetails` (so React and the
 * schema share it); identity — resolving WHICH User is calling — lives in
 * `./users` ({@link requireUserId}). Everything here scopes strictly to the
 * caller resolved server-side, so it returns or writes ONLY that User's own PII,
 * never another's.
 */

/**
 * The calling User's own Pool details + a `detailsComplete` flag.
 *
 * Pool details are PII: this is server-only and derives the owner from the auth
 * identity, so it returns ONLY the caller's own details — never another User's.
 * Throws when unauthenticated.
 */
export const myPoolDetails = query({
  args: {},
  handler: async (ctx): Promise<MyPoolDetails> => {
    const userId = await requireUserId(ctx);
    const user = await ctx.db.get("users", userId);
    return {
      poolDetails: user?.poolDetails ?? null,
      detailsComplete: user?.detailsComplete ?? false,
    };
  },
});

/** Return shape of {@link myPoolDetails}. */
export type MyPoolDetails = {
  poolDetails: PoolDetails | null;
  detailsComplete: boolean;
};

export const accountEmail = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }): Promise<string> => {
    const user = await ctx.db.get("users", userId);
    const email = user?.email?.trim() ?? "";
    if (!EMAIL_RE.test(email)) throw new Error(ACCOUNT_EMAIL_MISSING_MESSAGE);
    return email;
  },
});

export const storePoolDetails = internalMutation({
  args: {
    userId: v.id("users"),
    encrypted: v.object({
      name: v.string(),
      surname: v.string(),
      phone: v.string(),
    }),
    email: v.string(),
  },
  handler: async (ctx, { userId, encrypted, email }): Promise<null> => {
    await ctx.db.patch("users", userId, {
      poolDetails: { ...encrypted, email },
      detailsComplete: true,
    });
    return null;
  },
});

/**
 * Set/overwrite the caller's pool details. An ACTION because encryption uses
 * `crypto.subtle` (Convex actions-only): validate -> fetch the account email ->
 * encrypt name/surname/phone -> persist via the internal mutation.
 */
export const setPoolDetails = action({
  args: poolDetailsInputValidator.fields,
  handler: async (ctx, args): Promise<null> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const result = validatePoolDetails(args);
    if (!result.ok) throw new Error(result.error);
    const email = await ctx.runQuery(internal.poolDetailsOps.accountEmail, {
      userId,
    });
    const encrypted = await encryptPoolFields(result.value);
    await ctx.runMutation(internal.poolDetailsOps.storePoolDetails, {
      userId,
      encrypted,
      email,
    });
    return null;
  },
});

/**
 * The booking gate (Query/Mutation ctx). Booking entry points call this to
 * resolve the caller AND assert their Pool details are complete; it returns the
 * validated details for the Booking to submit to the pool.
 *
 * Throws `"Not authenticated"` when signed out, or
 * {@link POOL_DETAILS_INCOMPLETE_MESSAGE} when details are missing/incomplete.
 *
 * Mirrors the {@link requireUserId} / `getAuthUserId` split:
 * - Query/Mutation entry points: `await requirePoolDetails(ctx)`.
 * - Action entry points (no `ctx.db`): {@link requirePoolDetailsForAction}.
 */
export async function requirePoolDetails(
  ctx: QueryCtx | MutationCtx,
): Promise<{ userId: Id<"users">; poolDetails: PoolDetails }> {
  const userId = await requireUserId(ctx);
  const user = await ctx.db.get("users", userId);
  if (!hasCompleteDetails(user)) {
    throw new Error(POOL_DETAILS_INCOMPLETE_MESSAGE);
  }
  return { userId, poolDetails: user.poolDetails };
}

/**
 * The booking gate (Action ctx). Same contract as {@link requirePoolDetails},
 * but for actions, which cannot touch `ctx.db` — it resolves the caller with
 * `getAuthUserId` and reads the details through the {@link myPoolDetails} query.
 */
export async function requirePoolDetailsForAction(
  ctx: ActionCtx,
): Promise<{ userId: Id<"users">; poolDetails: PoolDetails }> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new Error("Not authenticated");
  }
  const details: MyPoolDetails = await ctx.runQuery(
    api.poolDetailsOps.myPoolDetails,
    {},
  );
  if (!hasCompleteDetails(details)) {
    throw new Error(POOL_DETAILS_INCOMPLETE_MESSAGE);
  }
  const dec = await decryptPoolFields(details.poolDetails);
  return {
    userId,
    poolDetails: { ...dec, email: details.poolDetails.email },
  };
}

/** The caller's OWN pool details, decrypted (action — decryption is actions-only).
 * Used by the settings/onboarding form to prefill. */
export const getPoolDetailsDecrypted = action({
  args: {},
  handler: async (ctx): Promise<MyPoolDetails> => {
    const mine: MyPoolDetails = await ctx.runQuery(
      api.poolDetailsOps.myPoolDetails,
      {},
    );
    if (!mine.poolDetails) return mine;
    const dec = await decryptPoolFields(mine.poolDetails);
    return {
      detailsComplete: mine.detailsComplete,
      poolDetails: { ...dec, email: mine.poolDetails.email },
    };
  },
});
