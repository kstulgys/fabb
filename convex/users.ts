import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { query } from "./_generated/server";

/**
 * Identity: resolving WHICH User is making a call, derived server-side from the
 * auth identity and NEVER trusted from a client argument. The per-User
 * isolation primitive every slice reuses — {@link requireUserId} for
 * write/guarded paths, {@link currentUser} for the signed-in/out UI.
 *
 * Distinct from the User's identity *to the pool* (their Pool details) and the
 * booking gate built on it — those live in `./poolDetailsOps`, keyed off the
 * userId this module resolves.
 */

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
