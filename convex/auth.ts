import Resend from "@auth/core/providers/resend";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { convexAuth } from "@convex-dev/auth/server";

/**
 * Passwordless email (magic link) authentication.
 *
 * The User enters their email; Convex Auth emails a one-time sign-in link via
 * Resend (the `@auth/core` Resend provider). Clicking it lands them back on the
 * app — the `SITE_URL` env var — already signed in. First-time emails sign up,
 * returning emails sign in; there is no password.
 *
 * Runtime env (set on the Convex deployment, not in code):
 * - `AUTH_RESEND_KEY` — Resend API key (the provider reads it automatically).
 * - `SITE_URL` — the app URL the magic link redirects back to.
 * - `AUTH_EMAIL_FROM` — optional override of the sender; defaults to the
 *   verified fabbin.app sender. Set it to `onboarding@resend.dev` to test to
 *   your own inbox before the domain is verified in Resend.
 * - `ALLOW_ANONYMOUS_AUTH` — DEV ONLY. See the anonymous provider below.
 *
 * `convexAuth` exposes `signIn` / `signOut` / `store` / `isAuthenticated`, which
 * Convex's file-based routing serves as `api.auth.*`.
 */
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Resend({
      from: process.env.AUTH_EMAIL_FROM ?? "fabb <noreply@fabbin.app>",
    }),
    // DEV-ONLY guest sign-in, for automated/manual testing without an inbox.
    // Registered ONLY when `ALLOW_ANONYMOUS_AUTH === "true"` — an env var set
    // exclusively on dev deployments. Production never sets it, so the
    // "anonymous" provider does not exist there and `signIn("anonymous")`
    // fails: there is no passwordless back door in prod. The matching sign-in
    // button is independently gated out of production builds via `NODE_ENV`.
    ...(process.env.ALLOW_ANONYMOUS_AUTH === "true"
      ? [
          Anonymous({
            // Stamp a dev email so the guest clears the booking-email gate in
            // `setPoolDetails` (saving pool details requires an account email).
            profile: () => ({ isAnonymous: true, email: "guest@dev.local" }),
          }),
        ]
      : []),
  ],
});
