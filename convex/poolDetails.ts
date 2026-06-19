import { type Infer, v } from "convex/values";

/**
 * Pool details: the four-field shape plus the validation shared by the client
 * form and the server mutation so both enforce identical rules. Pure and
 * runtime-agnostic — NO Convex server imports (only `convex/values`) — so it is
 * safe to import from React client components (the same pattern as
 * {@link ./week} and {@link ./calories}).
 *
 * Pool details are the User's identity *to the pool* (it keys bookings off the
 * email) and the exact four fields submitted on every Booking
 * (see `fabb.py` DETAIL_FIELDS): name, surname, phone, email.
 */

/**
 * The single source for the four-field Pool details shape, in the order the
 * pool's booking form wants. The stored column ({@link ../schema}) and
 * `setPoolDetails`'s args both derive from this validator, and
 * {@link PoolDetails} is its inferred type — so the shape is spelled exactly
 * once.
 */
export const poolDetailsValidator = v.object({
  name: v.string(),
  surname: v.string(),
  phone: v.string(),
  email: v.string(),
});

/** The four Pool details fields, in the order the pool's booking form wants. */
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
  email: "Enter a valid email address.",
} as const;

/** The signal a booking entry point shows / throws when details are incomplete. */
export const POOL_DETAILS_INCOMPLETE_MESSAGE =
  "Complete your pool details before booking.";

export type PoolDetailsValidation =
  | { ok: true; value: PoolDetails }
  | { ok: false; field: keyof PoolDetails; error: string };

/**
 * Validate raw Pool details input. Trims every field, then requires a name and
 * surname, a `+370…` phone, and an email-shaped email. Returns the trimmed
 * values on success or the first offending field + message on failure.
 *
 * `detailsComplete` is exactly "this returns `ok: true`" — all four present and
 * valid.
 */
export function validatePoolDetails(input: PoolDetails): PoolDetailsValidation {
  const value: PoolDetails = {
    name: input.name.trim(),
    surname: input.surname.trim(),
    phone: input.phone.trim(),
    email: input.email.trim(),
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
  if (!EMAIL_RE.test(value.email)) {
    return { ok: false, field: "email", error: POOL_DETAILS_ERRORS.email };
  }
  return { ok: true, value };
}
