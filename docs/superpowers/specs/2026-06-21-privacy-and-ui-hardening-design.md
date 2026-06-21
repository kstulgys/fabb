# Design: Privacy & UI hardening

- **Date:** 2026-06-21
- **Status:** Approved (pending spec review)
- **Scope:** Four requirements — PII encryption at rest, consistent screen width,
  an "unofficial app" disclaimer, and duplicate auto-registration prevention.

## Context (current state)

- A User's pool details live **in the database**, plaintext, at
  `users.poolDetails = { name, surname, phone, email }` (`convex/schema.ts`,
  `convex/poolDetails.ts`). `email` is the auth account email, stamped
  server-side in `setPoolDetails`.
- These details are read server-side to book against the pool:
  - Manual "Book now": `book.ts` → `requirePoolDetailsForAction`.
  - **AutoBook day-before cron** (`autoBook.ts` `runDayBefore` →
    `ruleContext` reads `owner.poolDetails` → `autoBookAttempt.ts` →
    `bookAndRecord`). The cron runs server-side with **no device present**, so
    the details must be recoverable server-side.
- `myPoolDetails` (query) returns `poolDetails` to the client (Settings form
  prefill, onboarding gate).
- AutoBook rules already dedupe at the data layer: `createFromClass` is
  idempotent on `(weekday, startTime, nameMatch)` (re-enables instead of
  inserting), and `ruleContext` dedupes bookings. There is **no UI feedback**
  for an attempted duplicate.
- The app frame (`AppShell`) constrains both header and content to a `maxW`
  that **differs per screen**: dashboard `3xl`, settings `lg`, signin `md`.
- There is no "this is an unofficial app" disclaimer anywhere.

### Decision that shaped this design

The original idea (store name/surname/phone only in device `localStorage`) was
**rejected** because the server-side AutoBook cron cannot read a device's
`localStorage`, which would break AutoBook entirely. Instead: **keep the details
in the DB but never store the three fields in plaintext** — encrypt them at rest
with a server-held key, decrypt server-side when booking (and for the owner's
own Settings prefill). `email` stays plaintext (auth identity, out of scope).

## Requirements

1. Never store raw `name`, `surname`, `phone`; encrypt at rest (AES-256-GCM).
2. Consistent frame width across all screens.
3. A disclaimer (modal) stating the app is unofficial and may break if the
   pool's site/API changes, reachable from an info icon in the nav/header.
4. Prevent setting multiple auto-registrations for the same class (UI feedback;
   server already enforces it).

---

## 1. PII encryption at rest

### Crypto module — `convex/crypto.ts`

- AES-256-GCM via the Web Crypto API (`globalThis.crypto.subtle`), available in
  both the Convex default runtime and Node. (Implementation will confirm; if the
  default runtime lacks it, the encrypt/decrypt steps move behind a Node action —
  but this is not expected to be necessary.)
- Key: 32 bytes from a Convex env var `POOL_DETAILS_KEY` (base64-encoded),
  imported once with `crypto.subtle.importKey("raw", …, "AES-GCM")`.
- API (async):
  - `encryptField(plain: string): Promise<string>` → returns `v1:<base64(iv)>.<base64(ciphertext)>` with a fresh 12-byte random IV per call.
  - `decryptField(stored: string): Promise<string>` → reverses it; throws on a
    missing/foreign scheme tag.
  - `encryptPoolFields({name,surname,phone})` / `decryptPoolFields(...)`
    convenience wrappers operating on the three fields.
- The `v1:` scheme prefix lets us detect ciphertext vs legacy plaintext during
  migration and version the format later.

### Stored vs decrypted shape

- Stored (`users.poolDetails`): `{ name, surname, phone, email }` where
  `name|surname|phone` are **ciphertext strings** and `email` is plaintext. The
  Convex validator shape is unchanged (four strings), so the schema edit is
  semantic, not structural.
- Decrypted (`PoolDetails`, used by the gateway): the same four fields, all
  plaintext. Introduce `StoredPoolDetails` (ciphertext) and keep `PoolDetails`
  (plaintext) distinct in `poolDetails.ts`.

### Touch points

- `setPoolDetails` (mutation): validate plaintext as today, then
  `encryptPoolFields` before `ctx.db.patch`. `detailsComplete` logic unchanged.
- `requirePoolDetails` / `requirePoolDetailsForAction`: decrypt before returning
  `PoolDetails`, so all downstream booking code is unchanged.
- `ruleContext` (internalQuery): decrypt `owner.poolDetails` before returning the
  `ready` verdict's `poolDetails`.
- `myPoolDetails` (query): **decrypt for the owner** (their own data) so the
  Settings form keeps prefilling (approved option a).
- `hasCompleteDetails`: unchanged (operates on presence/flags, not values).

### Migration

- One-off `internalMutation` `migratePoolDetailsToEncrypted`: scan all `users`
  with `poolDetails`; for each field lacking the `v1:` prefix, encrypt in place.
  Idempotent (skips already-encrypted fields). Run once via the dashboard/CLI.

### Transparency

- A short line on `PoolDetailsForm` (onboarding + settings): "Your name, surname
  and phone are encrypted at rest."

### Error handling

- Missing/short `POOL_DETAILS_KEY` → throw a clear configuration error at
  encrypt/decrypt time (fail closed; never silently store plaintext).
- Decrypt failure (tampered/foreign data) → throw; booking gate surfaces it as a
  normal error rather than booking with garbage.

---

## 2. Consistent frame width

- `AppShell` keeps a single frame width for **all** screens (default `maxW="3xl"`).
- Remove the per-screen `maxW` overrides: signin (`md`) and settings (`lg`).
- Screens needing a narrower *content block* constrain the inner element, not the
  frame:
  - Signin: keep `AuthForm` centered (`maxW="sm"` on the form) inside the 3xl frame.
  - Settings: wrap content in `maxW="lg"` (or similar) inside the 3xl frame.
  - Dashboard onboarding already does this (`maxW="md" mx="auto"`).
- Result: header brand, edges, and content gutters align across every screen.

---

## 3. Unofficial-app disclaimer

- New `DisclaimerDialog` component (reuses `SheetDialog`: bottom sheet on mobile,
  centered on desktop). Copy: this is an **unofficial** client for the pool's
  public site; it can break if the pool changes its website or API; no
  affiliation; use at your own discretion.
- An info `IconButton` (`LuInfo`, `aria-label="About this app"`) in the
  `AppShell` header actions, before the color-mode toggle — present on every
  screen since `AppShell` is shared.
- Auto-open **once** for first-time visitors via a `localStorage` flag
  (`fabb.disclaimerSeen`); always reopenable via the icon. `AppShell` is already
  a client component, so it owns the open state + the first-visit effect.

---

## 4. Duplicate auto-registration prevention (UI)

Server already prevents duplicates; this adds the missing feedback so a User
can't *attempt* an apparent duplicate.

- A class "already auto-booked" = the User has an **enabled** rule with
  `weekday === isoWeekday(class.date) && startTime === class.startTime &&
  nameMatch === class.name`. Computed client-side from `autoBookRules.listMine`.
- "Add rule" picker (`auto-book-rules.tsx` `AddRuleBody`): annotate already-ruled
  classes (e.g. "· already auto-booked") and disable their `Select.Item`, so they
  can't be re-picked.
- Class detail (`class-detail.tsx` `AutoBookWeekly`): when a matching enabled rule
  exists, show the button disabled as "Already auto-booking" with a one-line note,
  instead of offering to create another.
- Server `createFromClass` idempotency stays as the guarantee of record.

---

## Files touched

- New: `convex/crypto.ts`, `src/app/disclaimer-dialog.tsx`,
  `docs/superpowers/specs/2026-06-21-privacy-and-ui-hardening-design.md`.
- Edit: `convex/poolDetails.ts` (types), `convex/poolDetailsOps.ts`
  (encrypt/decrypt), `convex/autoBook.ts` (`ruleContext` decrypt),
  `convex/schema.ts` (doc/comment), a migration module.
- Edit: `src/app/app-shell.tsx` (single width + info icon + disclaimer),
  `src/app/signin/page.tsx`, `src/app/settings/page.tsx` (width),
  `src/app/pool-details-form.tsx` (encryption note),
  `src/app/dashboard/auto-book-rules.tsx` + `class-detail.tsx` (dup feedback).

## Testing

- `convex/crypto.test.ts`: encrypt→decrypt round-trip; ciphertext ≠ plaintext;
  fresh IV per call; bad key / foreign data throws.
- `setPoolDetails`: stored fields are ciphertext (`v1:` prefix), decrypt matches
  input; existing `poolDetailsOps.test.ts` updated for the encrypted store.
- Booking paths: existing `book.test.ts` / `autoBook.test.ts` pass with a test
  `POOL_DETAILS_KEY` set in `test.setup.ts` (round-trips through encryption).
- Migration: legacy plaintext row → encrypted; re-run is a no-op.
- #4: unit for the "rule exists for class" matcher; `createFromClass`
  idempotency already covered.
- Width/disclaimer: light verification (build + a browser pass).

## Out of scope / non-goals

- `email` encryption (auth identity; remains plaintext).
- Zero-knowledge / client-held keys (the cron must decrypt server-side; this is
  protection against DB exposure, not against full server/deployment compromise).
- The rejected device-`localStorage` storage model and its multi-device prompt.
