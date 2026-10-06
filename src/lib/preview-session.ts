/**
 * Used by `POST /api/session` (src/app/api/session/route.ts), the Factory's
 * preview sign-in check. The app's own sign-in is the Convex Auth magic link
 * (convex/auth.ts), which has no password, so this account is separate from it.
 *
 * The preview test account: one account that exists only where the Worker has
 * `PREVIEW_TEST_EMAIL` and `PREVIEW_TEST_PASSWORD`. CI gives them to the
 * preview Workers alone, so the account signs in on every preview and does not
 * exist in production. A session is a cookie that holds the account's email signed
 * with the account's password.
 */
export interface TestAccount {
  email: string;
  password: string;
}

export const SESSION_COOKIE = "session";

/** The preview test account, or null where it does not exist (production). */
export function previewTestAccount(): TestAccount | null {
  const email = process.env.PREVIEW_TEST_EMAIL;
  const password = process.env.PREVIEW_TEST_PASSWORD;
  return email && password ? { email, password } : null;
}

/** Whether `email` and `password` are the preview test account's. */
export function isPreviewTestAccount(email: unknown, password: unknown): boolean {
  const account = previewTestAccount();
  return account !== null && typeof email === "string" && typeof password === "string" && email === account.email && sameText(password, account.password);
}

/** The session cookie value for the preview test account: its email, signed with its password. Null where the account does not exist. */
export async function sessionToken(): Promise<string | null> {
  const account = previewTestAccount();
  return account && signature(account.email, account.password);
}

/** The email of the preview test account when `token` is its session cookie value, or null. */
export async function sessionEmail(token: string | undefined): Promise<string | null> {
  const account = previewTestAccount();
  if (!account || !token) return null;
  return sameText(token, await signature(account.email, account.password)) ? account.email : null;
}

async function signature(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

/** Compares two strings in time that does not depend on where they differ. */
function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
