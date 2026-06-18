import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
  POOL_DETAILS_INCOMPLETE_MESSAGE,
  type PoolDetails,
  validatePoolDetails,
} from "./poolDetails";

/**
 * The id of the User making the call, or throws `"Not authenticated"`.
 *
 * This is the per-User isolation primitive every later slice reuses: derive the
 * userId server-side from the auth identity (NEVER accept it as a function
 * argument), then scope every read/write to it, e.g.
 *
 * ```ts
 * const userId = await requireUserId(ctx);
 * return await ctx.db
 *   .query("autoBookRules")
 *   .withIndex("userId", (q) => q.eq("userId", userId))
 *   .collect();
 * ```
 *
 * For read paths that should render a signed-out state instead of erroring,
 * call `getAuthUserId(ctx)` from `@convex-dev/auth/server` directly — it returns
 * `null` when unauthenticated.
 */
export async function requireUserId(
  ctx: QueryCtx | MutationCtx,
): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new Error("Not authenticated");
  }
  return userId;
}

/**
 * The User document for the current auth identity, or `null` when signed out.
 * Safe to call from the client to drive the signed-in UI.
 */
export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return null;
    }
    return await ctx.db.get("users", userId);
  },
});

/**
 * The current User's own profile. Throws when unauthenticated, demonstrating
 * the {@link requireUserId} guard used for all User-scoped data.
 */
export const myProfile = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    return await ctx.db.get("users", userId);
  },
});

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

/**
 * Set or overwrite the calling User's Pool details. The single entry point for
 * both onboarding and the settings screen — a later edit just overwrites.
 *
 * Validates server-side (email shape + `+370` phone form); invalid input is
 * rejected with a clear message. On success all four fields are present and
 * valid, so `detailsComplete` is set to `true`.
 */
export const setPoolDetails = mutation({
  args: {
    name: v.string(),
    surname: v.string(),
    phone: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args): Promise<null> => {
    const userId = await requireUserId(ctx);
    const result = validatePoolDetails(args);
    if (!result.ok) {
      throw new Error(result.error);
    }
    await ctx.db.patch("users", userId, {
      poolDetails: result.value,
      detailsComplete: true,
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
  if (!user?.detailsComplete || !user.poolDetails) {
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
  const details: MyPoolDetails = await ctx.runQuery(api.users.myPoolDetails, {});
  if (!details.detailsComplete || details.poolDetails === null) {
    throw new Error(POOL_DETAILS_INCOMPLETE_MESSAGE);
  }
  return { userId, poolDetails: details.poolDetails };
}
