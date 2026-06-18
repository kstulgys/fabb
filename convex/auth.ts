import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";

/**
 * Email + password authentication.
 *
 * `convexAuth` wires up the `signIn` / `signOut` actions, the `store` mutation
 * the auth flow calls internally, and the `isAuthenticated` query. They are
 * exported here so Convex's file-based routing exposes them as `api.auth.*`.
 */
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],
});
