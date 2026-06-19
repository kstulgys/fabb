import { type Infer, v } from "convex/values";

/**
 * Pool details: the stored four-field shape, the three user-entered fields, and
 * the validation shared by the client form and the server mutation so both
 * enforce identical rules. Pure and runtime-agnostic — NO Convex server imports
 * (only `convex/values`) — so it is safe to import from React client components
 * (the same pattern as {@link ./week} and {@link ./calories}).
 *
 * Pool details are the User's identity *to the pool* (it keys bookings off the
 * email). The pool's booking form takes four fields (see `fabb.py`
 * DETAIL_FIELDS): name, surname, phone, email. The User enters only the first
 * three; the email is their account/signup email, stamped server-side by
 * `setPoolDetails`, so it always matches the account and is never re-typed.
 */

/** The three fields the User actually enters in the form. The booking email is
 * deliberately NOT here — it is the account/signup email, stamped server-side
 * (see `setPoolDetails`), so the User never types it twice. */
export const poolDetailsInputValidator = v.object({
  name: v.string(),
  surname: v.string(),
  phone: v.string(),
});

/** What the form collects and {@link validatePoolDetails} checks. */
export type PoolDetailsInput = Infer<typeof poolDetailsInputValidator>;

/**
 * The stored Pool details shape submitted to the pool: the three input fields
 * plus the account `email`, in the order the pool's booking form wants. The
 * stored column ({@link ../schema}) derives from this validator and
 * {@link PoolDetails} is its inferred type, so the shape is spelled once.
 */
export const poolDetailsValidator = v.object({
  name: v.string(),
  surname: v.string(),
  phone: v.string(),
  email: v.string(),
});

/** The four Pool details fields stored per User and sent to the pool. */
export type PoolDetails = Infer<typeof poolDetailsValidator>;

/** A pragmatic "looks like an email" check: non-empty local + domain + TLD. */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Lithuanian number the pool keys on: `+370` followed by 8 digits
 * (e.g. `+37061234567`). The pool form stores the raw string, so we pin the
 * shape ourselves rather than trusting the upstream form.
 */
export const PHONE_RE = /^\+370\d{8}$/;

/** Per-field validation messages, surfaced inline by the form and thrown by the
 * mutation so the client and server speak with one voice. */
export const POOL_DETAILS_ERRORS = {
  name: "Enter your first name.",
  surname: "Enter your surname.",
  phone: "Phone must be in +370 format, e.g. +37061234567.",
} as const;

/** The signal a booking entry point shows / throws when details are incomplete. */
export const POOL_DETAILS_INCOMPLETE_MESSAGE =
  "Complete your pool details before booking.";

/** Thrown by `setPoolDetails` when the signed-in account has no usable email to
 * book with (the booking email is derived from the account, never the form). */
export const ACCOUNT_EMAIL_MISSING_MESSAGE =
  "Your account has no email address; sign in with an email to book.";

export type PoolDetailsValidation =
  | { ok: true; value: PoolDetailsInput }
  | { ok: false; field: keyof PoolDetailsInput; error: string };

/**
 * Validate the three user-entered Pool details fields. Trims each, then requires
 * a name and surname and a `+370…` phone. The booking email is not entered here
 * (it is the account email), so this function does not validate it.
 *
 * `detailsComplete` is "this returns `ok: true` AND the account has an email"
 * (enforced together in `setPoolDetails`).
 */
export function validatePoolDetails(
  input: PoolDetailsInput,
): PoolDetailsValidation {
  const value: PoolDetailsInput = {
    name: input.name.trim(),
    surname: input.surname.trim(),
    phone: input.phone.trim(),
  };
  if (value.name === "") {
    return { ok: false, field: "name", error: POOL_DETAILS_ERRORS.name };
  }
  if (value.surname === "") {
    return { ok: false, field: "surname", error: POOL_DETAILS_ERRORS.surname };
  }
  if (!PHONE_RE.test(value.phone)) {
    return { ok: false, field: "phone", error: POOL_DETAILS_ERRORS.phone };
  }
  return { ok: true, value };
}

/**
 * Whether a User's Pool details are complete: `detailsComplete === true` AND a
 * `poolDetails` object present. The SINGLE source for the "may this account
 * book?" completeness check — the three booking gates
 * ({@link ../poolDetailsOps} `requirePoolDetails` / `requirePoolDetailsForAction`
 * and `autoBook`'s `ruleContext`) all narrow through it, differing only in what
 * they do when it fails (throw vs return a `no_details` verdict). The param is
 * permissive so it accepts both a raw `users` doc and the `MyPoolDetails` query
 * shape the action gate reads.
 */
export function hasCompleteDetails(
  user: { detailsComplete?: boolean; poolDetails?: PoolDetails | null } | null,
): user is { detailsComplete: true; poolDetails: PoolDetails } {
  return user?.detailsComplete === true && user.poolDetails != null;
}
