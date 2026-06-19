# Architecture Deepening Plan

Five behaviour-preserving deepening refactors found by the
`improve-codebase-architecture` review. Each turns a shallow, smeared concern
into a deep module with one interface. Execution order (dependency DAG):
**C3 → C1 → C4 → C5 → C2**, mapped to Task 1 → Task 5.

| Task | Candidate | Deepened module | Depends on |
|------|-----------|-----------------|------------|
| 1 | C3 booking-status vocab | `convex/bookingStatus.ts` | — |
| 2 | C1 calorie range | `convex/calories.ts` | — |
| 3 | C4 attendance conversion | `convex/attendance.ts` | Task 2 |
| 4 | C5 identity / pool-details split | `convex/poolDetailsOps.ts` | — |
| 5 | C2 booking decision | `convex/bookingDecision.ts` | Tasks 1, 4 |

Decisions already recorded (controller, committed before Task 1):
`CONTEXT.md` terms **Booking status**, **AutoBook outcome**, **Attendance
conversion** + sharpened **Calories**; **ADR-0003** (divergent bookable
thresholds, intentional); **ADR-0004** (calorie range = two columns, invariant
owned by the calories module).

## Global Constraints

These bind every task (the reviewer's attention lens):

- Stack is fixed: Convex `^1.41` + Convex Auth, TypeScript, React 19 / Next 16 /
  Chakra v3, bun. Do not change the stack or add dependencies.
- `bunx tsc --noEmit` MUST pass. `bun run test` (vitest) MUST stay green.
  Baseline is **169 tests / 15 files**. Net coverage never shrinks; counts may
  shift as tests move between files.
- NEVER hit the real network in tests. All pool I/O goes through `poolGateway()`;
  tests swap a fake via `setPoolGateway`. No test may perform a real booking.
- These refactors are **behaviour-preserving**. The only intentional behaviour
  changes are the two explicitly called out (Task 2 trusted-tier calorie read;
  Task 5 names — not alters — the two thresholds). No new product features. YAGNI.
- **Server-free modules** (no `convex/_generated/server` import) that React or
  pure modules import MUST stay server-free: `convex/poolDetails.ts`,
  `convex/week.ts`, `convex/statsHelpers.ts`, and every new value module in
  these tasks (`bookingStatus.ts`, `calories.ts`, `bookingDecision.ts`).
  Pulling `_generated/server` into a React-imported module breaks the client
  bundle. Verify with a grep after writing each.
- Shared vocabulary follows the existing proven pattern: a `v`-union validator +
  `type X = Infer<typeof validator>` in a server-free module, imported by
  `schema.ts`, parsers, and server modules alike (as `classRecord` /
  `attemptOutcomeValidator` already do).
- After editing Convex **functions/modules**, run `bunx convex codegen` and
  commit any resulting `convex/_generated/` diff. This regenerates the typed
  `api`/`internal` index against the existing **dev** deployment — it is the
  sanctioned regen flow, NOT a re-init. Never hand-edit `convex/_generated/**`.
  Pure value-module additions (no `query`/`mutation`/`action`) produce no
  `_generated` diff; running codegen is still a safe no-op.
- Use `CONTEXT.md` domain vocabulary and the architecture vocabulary
  (module / interface / seam / leverage / locality) in names and JSDoc.
- Match the existing JSDoc header style (a module-level block explaining the
  module's role + invariants, terse per-export blocks).
- Commit on branch `feat/architecture-deepening`. Do NOT merge, do NOT touch
  `main`, do NOT delete the branch.
- TDD where it adds signal (new pure modules in Tasks 2 and 5). Pure moves
  (Tasks 1, 3, 4) are proven by the existing suite staying green + `tsc` +
  a single-source grep; do not add tests that merely re-assert moved literals.

## Task 1: Single source for the Booking-status vocabulary

**Candidate C3.** The pool's four-value Booking status vocabulary is spelled
independently at four sites and its six-value AutoBook-outcome extension at two
more; the type and the validators are not linked, so adding or renaming a value
means editing up to six places. Create one server-free module that both the
type and every validator derive from.

### Files (read before editing)

- `convex/pool/parse.ts:154` — `export type BookingStatus = "registered" | "already" | "full" | "error"`; `parseBookingResult` (`:167`) returns it.
- `convex/bookings.ts:16-21` — `bookingStatusValidator` (`v.union` of the 4 literals); used by `recordBooking` args (`:57`).
- `convex/schema.ts:82-87` — `bookings.status` inline `v.union` (4 literals).
- `convex/schema.ts:91-96` — `bookings.runLog[].outcome` inline `v.union` (4 literals).
- `convex/schema.ts:143-150` — `ruleRuns.outcome` inline `v.union` (6 literals).
- `convex/autoBook.ts:31-40` — `attemptOutcomeValidator` (`v.union`, 6 literals) + `export type AttemptOutcome = Infer<...>`.

### Change

1. Create `convex/bookingStatus.ts` (server-free: import only `v` and `Infer`
   from `convex/values`; no `_generated/server`). Module-level JSDoc: the single
   source for the **Booking status** and **AutoBook outcome** vocabularies
   (cite `CONTEXT.md`), server-free so `schema.ts`, the parsers, and server
   modules all import it without an `_generated/server` cycle. Export exactly:

   ```ts
   export const bookingStatusValidator = v.union(
     v.literal("registered"),
     v.literal("already"),
     v.literal("full"),
     v.literal("error"),
   );
   export type BookingStatus = Infer<typeof bookingStatusValidator>;

   // AutoBook outcome STRUCTURALLY extends Booking status with two verdicts
   // that book nothing (rule resolved to 0/2+ classes; pool details missing).
   export const attemptOutcomeValidator = v.union(
     bookingStatusValidator,
     v.literal("no_match"),
     v.literal("no_details"),
   );
   export type AttemptOutcome = Infer<typeof attemptOutcomeValidator>;
   ```
   (Nested `v.union` flattens — verified: base members stay assignable, unknown
   literals rejected.)

2. `convex/pool/parse.ts`: delete the local `type BookingStatus` (`:154`); add
   `import type { BookingStatus } from "../bookingStatus";`. Keep
   `parseBookingResult`'s return type as `BookingStatus` (now imported). Update
   the surrounding JSDoc to point at the shared module. (Type-only import — no
   runtime `convex/values` pulled into the parser.)

3. `convex/bookings.ts`: delete the local `bookingStatusValidator` (`:16-21`);
   add `import { bookingStatusValidator } from "./bookingStatus";`. `recordBooking`
   args unchanged.

4. `convex/schema.ts`: add `import { bookingStatusValidator, attemptOutcomeValidator } from "./bookingStatus";`.
   - Replace `bookings.status` inline union (`:82-87`) with `bookingStatusValidator`.
   - Replace `bookings.runLog[].outcome` inline union (`:91-96`) with
     `bookingStatusValidator` — it stays **four** literals (a Booking run-log
     entry never holds `no_match`/`no_details`).
   - Replace `ruleRuns.outcome` inline union (`:143-150`) with
     `attemptOutcomeValidator` (**six** literals).

5. `convex/autoBook.ts`: delete the local `attemptOutcomeValidator` +
   `AttemptOutcome` (`:31-40`); add
   `import { attemptOutcomeValidator, type AttemptOutcome } from "./bookingStatus";`.
   All existing uses (`recordRuleRun` args, `RuleContextResult`) unchanged.

### Invariants

- `runLog[].outcome` MUST remain four literals; `ruleRuns.outcome` six. Do not
  widen or narrow either set.
- The resolved literal SETS are byte-for-byte the same as today, so this is a
  pure refactor: no schema value change, no migration, no behaviour change.
- `schema.ts` must still NOT import `_generated/server`.

### Acceptance

- `bunx tsc --noEmit` clean; `bun run test` green (still 169).
- `convex/bookingStatus.ts` is the ONLY file containing `v.literal("registered")`
  and the ONLY file containing `v.literal("no_match")` (grep proves single
  source).
- No new test file (pure move; existing book/autoBook/bookings tests already
  exercise every value). Do not add a test that merely re-lists the literals.

## Task 2: Calorie range value module

**Candidate C1 (ADR-0004).** The Calorie range invariant — an all-or-nothing
`(min, max)` pair, absent when unpublished, midpoint for stats, range-or-dash
for display, null excluded from totals — is re-encoded at ~8 sites with three
contradictory null disciplines. Concentrate it in one server-free value module;
storage stays two optional columns (ADR-0004), the module owns the behaviour.

### Files (read before editing)

- `convex/pool/parse.ts:117-125` — `parseEventDetail`: `kcalMin`/`kcalMax` born `number | null`.
- `convex/pool/scrape.ts:37-38` — `?? undefined` bridge into the `ClassRecord`.
- `convex/classes.ts:17-18` — `classRecord` validator: `kcalMin`/`kcalMax` optional.
- `convex/schema.ts:56-57` (classes) and `:175-176` (trainingLogs) — optional columns.
- `convex/trainingLogs.ts:29-41` — `caloriePair` (all-or-nothing, **throws**); used by `addManual`, `addFromClass`, `editLog`, and `convertCompletedBookings:282`.
- `convex/statsHelpers.ts:65-71` — `calorieMidpoint` (tolerant → null); null-exclusion at `:117-118` (`periodTotals`) and `:134-135` (`weeklySeries`).
- UI display: `src/app/dashboard/class-detail.tsx:348-351`, `week-calendar.tsx:28-31`, `training-log.tsx:177-181`.

### Change

Create `convex/calories.ts` (server-free: import only `v`/`Infer` from
`convex/values`; no `_generated/server`; React-importable like
`poolDetails.ts`). Module-level JSDoc cites `CONTEXT.md` **Calories** and
ADR-0004 (two columns, module owns the invariant). Export exactly:

```ts
export type CalorieRange = { min: number; max: number };

// The two stored columns, as one shared shape to spread into table + record
// validators (collapses three spellings of the same pair to one).
export const caloriesColumns = {
  kcalMin: v.optional(v.number()),
  kcalMax: v.optional(v.number()),
};

// TRUSTED read (stored/scraped data): a lone bound coerces to null.
export function fromColumns(row: { kcalMin?: number; kcalMax?: number }): CalorieRange | null;

// WRITE: range -> both columns; null -> {} (omit both).
export function toColumns(range: CalorieRange | null): { kcalMin?: number; kcalMax?: number };

// UNTRUSTED parse (user input): a lone bound THROWS the message below; both or
// neither succeed. Message verbatim (an existing test asserts it):
//   "Enter both a minimum and maximum calorie figure, or leave both blank."
export function requirePair(min: number | undefined, max: number | undefined): CalorieRange | null;

// Null-safe midpoint: (min + max) / 2, or null when absent.
export function midpoint(range: CalorieRange | null): number | null;

// Display: present -> `${min}–${max} kcal` (EN DASH U+2013); absent -> `absent`.
export function format(range: CalorieRange | null, absent?: string): string; // absent default "—"
```

Then rewire every site to the module:

1. `convex/classes.ts`: build `classRecord` with `v.object({ ...common, ...caloriesColumns, durationMin: v.optional(v.number()) })` — `durationMin` is NOT a calorie field, keep it separate.
2. `convex/schema.ts`: spread `...caloriesColumns` into the `classes` table (replacing `:56-57`) and the `trainingLogs` table (replacing `:175-176`). Field set is identical → no migration.
3. `convex/trainingLogs.ts`: delete `caloriePair` (`:29-41`). User-input paths (`addManual`, `editLog`, and `addFromClass` if it accepts typed calories) use `...toColumns(requirePair(kcalMin, kcalMax))`. Import from `./calories`.
4. `convex/statsHelpers.ts`: delete `calorieMidpoint` (`:65-71`); import `fromColumns`, `midpoint` from `./calories`. `periodTotals` and `weeklySeries` compute `const mid = midpoint(fromColumns(log));` keeping the existing `if (mid !== null)` exclusion. Behaviour identical.
5. `convex/pool/scrape.ts`: the `?? undefined` bridge (`:37-38`) may stay as-is (it already produces all-or-nothing trusted columns) OR use `toColumns(fromColumns(detail))` — pick the clearer; do not change the resulting stored data.
6. UI (`class-detail.tsx`, `week-calendar.tsx`): replace the display ternary with `format(fromColumns(cls))` (compact `"—"` absent). `training-log.tsx` (`:177-181`): `format(fromColumns(cls), "No published calories")` to preserve its verbose absent text. The manual-log FORM (parse at `:88-90`) is unchanged — it sends `kcalMin`/`kcalMax`; the server validates via `requirePair`. Import path from `src/app/dashboard/*` is `../../../convex/calories`.

### Intentional behaviour change (call out in report)

`convertCompletedBookings` reads TRUSTED cached class data. After Task 3 it
lives in `attendance.ts`; in THIS task, change its `...caloriePair(cls.kcalMin, cls.kcalMax)`
(`:282`) to `...toColumns(fromColumns(cls))` — the tolerant tier. Trusted data
must never throw mid-cron on a should-never-happen lone bound. This is the one
intended behaviour change in Task 2; note it explicitly.

### Invariants

- `convex/calories.ts` is server-free (grep for no `_generated/server` import).
- Storage shape unchanged (two optional columns); `_generated` diff is empty.
- `requirePair` throw message EXACTLY matches the old `caloriePair` message.
- `format` present-case is EXACTLY `${min}–${max} kcal` with EN DASH `–`
  (U+2013); compact absent `"—"`; `training-log.tsx` absent stays
  `"No published calories"`.
- `midpoint` numbers identical to old `calorieMidpoint` (stats unchanged).

### Tests

- New `convex/calories.test.ts`: `requirePair` (lone min throws the exact
  message; lone max throws; both → range; neither → null), `fromColumns`
  (tolerant: lone bound → null; both → range), `toColumns` (range → both; null →
  {} ; round-trips with `fromColumns`), `midpoint` (correct average; null when
  absent), `format` (range string with EN DASH; default and custom absent text).
- `convex/statsHelpers.test.ts`: move the `calorieMidpoint` unit tests here as
  `midpoint`/`fromColumns` tests if not already covered by `calories.test.ts`;
  KEEP the `periodTotals`/`weeklySeries` null-exclusion tests (still valid).
- `convex/trainingLogs.test.ts`: the lone-bound throw is now via `requirePair`;
  the existing `addManual`/`editLog` throw assertions must still pass unchanged.

### Acceptance

- `tsc` clean; full suite green (net coverage ≥ baseline).
- Grep: the `${min}–${max} kcal` / midpoint / all-or-nothing logic appears ONLY
  in `convex/calories.ts`; UI, stats, and trainingLogs call the module.
- `caloriesColumns` is spread in both schema tables and `classRecord`.

## Task 3: Extract Attendance conversion from trainingLogs

**Candidate C4.** `trainingLogs.ts` mixes owner-context CRUD (resolves the
caller, never trusts a client `userId`) with the system-context
`convertCompletedBookings` (trusts `booking.userId`). The module header
(`:14-15`) claims "Every entry point resolves the caller server-side (NEVER
trusts a client userId)" — false for the conversion. Split the conversion into
its own system-context module beside the cron. **Do Task 2 first** (the
conversion now uses the calories module).

### Files (read before editing)

- `convex/trainingLogs.ts:8-17` (header), `:219-291` (`convertCompletedBookings`), `:1-6` (imports).
- `convex/crons.ts:54-59` — registers `internal.trainingLogs.convertCompletedBookings`.
- `convex/trainingLogs.test.ts` — contains the conversion tests (and the CRUD + `setAttended` tests).
- `convex/crons.test.ts` — may assert the registered conversion function.

### Change

1. Create `convex/attendance.ts` (system-context module). Move
   `convertCompletedBookings` there verbatim (post-Task-2 form, using
   `toColumns(fromColumns(cls))`). Module-level JSDoc states the **Attendance
   conversion** concept (cite `CONTEXT.md`): system context, trusts each
   Booking's own `userId`, idempotent on `by_bookingId`, week-window bound.
   Import `internalMutation` from `./_generated/server`, calorie helpers from
   `./calories`, `classStatus`/`weekDatesFor` from `./week`.
2. `convex/trainingLogs.ts`: remove `convertCompletedBookings`. Fix the header
   (`:14-15`) — it is now TRUE for the remaining owner-scoped CRUD; reword to
   say so. Remove imports the remaining CRUD no longer uses (`tsc` flags them;
   e.g. `classStatus`/`weekDatesFor` if only the conversion used them — verify
   against `addFromClass`).
3. `convex/crons.ts`: change `internal.trainingLogs.convertCompletedBookings`
   (`:57`) to `internal.attendance.convertCompletedBookings`; update the JSDoc
   `{@link ...}` reference (`:49`).
4. Run `bunx convex codegen` (new `attendance` module enters the `internal`
   index) and commit the `_generated` diff.

### Tests

- Move the `convertCompletedBookings` tests from `trainingLogs.test.ts` into a
  new `convex/attendance.test.ts` (same cases: idempotent re-run, only
  `registered`/`already` convert, null calories, finished-only, system context).
  The CRUD + `setAttended` tests stay in `trainingLogs.test.ts`.
- If `crons.test.ts` references the conversion by module path, update it.

### Invariants

- Pure move + header fix + cron re-point + codegen. No behaviour change beyond
  Task 2's already-applied trusted-tier read.
- `_generated` reflects `internal.attendance.convertCompletedBookings`.

### Acceptance

- `tsc` clean; full suite green (conversion tests now under `attendance.test.ts`).
- `trainingLogs.ts` header no longer lies; `grep convertCompletedBookings convex/trainingLogs.ts` is empty.

## Task 4: Split identity from Pool-details ops

**Candidate C5.** `users.ts` is three modules in one: identity (`requireUserId`,
`currentUser`, the dead `myProfile`), Pool-details ops (`myPoolDetails`,
`setPoolDetails`), and the booking gate (`requirePoolDetails` ×2). The four-field
Pool-details shape is spelled three times. Split ops + gate into their own
module; keep identity in `users.ts`; delete the dead function; make the shape
one source. **`poolDetails.ts` MUST stay server-free — do NOT merge it.**

### Files (read before editing)

- `convex/users.ts` — `requireUserId:32`, `currentUser:46`, `myProfile:61` (DEAD), `myPoolDetails:76`, `MyPoolDetails:89`, `setPoolDetails:102`, `requirePoolDetails:135`, `requirePoolDetailsForAction:151`.
- `convex/poolDetails.ts` — server-free; `PoolDetails` type `:13-18`; React imports it (`src/app/pool-details-form.tsx:7`, `complete-details-prompt.tsx:5`).
- `convex/schema.ts:29-36` — inline `poolDetails` object (spelling #1).
- Callers of `api.users.myPoolDetails`: `src/app/pool-details-form.tsx:51`, `src/app/dashboard/class-detail.tsx:243`, `convex/poolDetails.test.ts` (many), `convex/users.ts:158` (internal call inside `requirePoolDetailsForAction`).
- Callers of `api.users.setPoolDetails`: `src/app/pool-details-form.tsx:52`, `convex/poolDetails.test.ts` (many).
- Importers of `requirePoolDetails`/`requirePoolDetailsForAction` from `./users`: `convex/autoBookRules.ts:5,52` (`requirePoolDetails`), `convex/book.ts:10,78` (`requirePoolDetailsForAction`), `convex/poolDetails.test.ts:7`.
- `api.users.currentUser` callers (STAY): `src/app/page.tsx:17`, `convex/auth.test.ts:34`, `convex/users.test.ts:20,23,41`, `convex/poolDetails.test.ts:156`.
- `api.users.myProfile`: ONLY `convex/users.test.ts:47` (delete with the function).

### Change

1. `convex/poolDetails.ts` (stays server-free): add
   `export const poolDetailsValidator = v.object({ name: v.string(), surname: v.string(), phone: v.string(), email: v.string() });`
   and make `export type PoolDetails = Infer<typeof poolDetailsValidator>;`
   (import `v`/`Infer` from `convex/values` — still server-free). This is the
   single source for the four-field shape.
2. `convex/schema.ts`: `poolDetails: v.optional(poolDetailsValidator)` (import
   from `./poolDetails`). Replaces the inline object (`:29-36`). Field set
   identical → no migration.
3. Create `convex/poolDetailsOps.ts` (server module). Move from `users.ts`:
   `myPoolDetails`, `MyPoolDetails`, `setPoolDetails`, `requirePoolDetails`,
   `requirePoolDetailsForAction`. `setPoolDetails` args become
   `poolDetailsValidator.fields` (spelling #3 → the shared shape). It imports
   `requireUserId` from `./users`, validation + message from `./poolDetails`.
   `requirePoolDetailsForAction`'s internal `ctx.runQuery` targets
   `api.poolDetailsOps.myPoolDetails`. Module JSDoc: the Pool-details ops + the
   booking gate (cite `CONTEXT.md` **Pool details**).
4. `convex/users.ts`: keep ONLY `requireUserId` + `currentUser`. DELETE
   `myProfile`. Drop now-unused imports (`PoolDetails`, `validatePoolDetails`,
   `POOL_DETAILS_INCOMPLETE_MESSAGE` — `tsc` flags them). Update the module JSDoc
   to "identity" scope.
5. Re-point callers:
   - `api.users.myPoolDetails` → `api.poolDetailsOps.myPoolDetails` (pool-details-form.tsx, class-detail.tsx, poolDetails.test.ts).
   - `api.users.setPoolDetails` → `api.poolDetailsOps.setPoolDetails` (pool-details-form.tsx, poolDetails.test.ts).
   - `requirePoolDetails` / `requirePoolDetailsForAction` imports → `./poolDetailsOps` (autoBookRules.ts, book.ts, poolDetails.test.ts).
   - `api.users.currentUser` and `requireUserId` imports stay on `./users`.
6. Delete the `myProfile` test (`users.test.ts:44-50`); add an equivalent
   "rejects an unauthenticated caller" assertion on `api.poolDetailsOps.myPoolDetails`
   (it also throws via `requireUserId`) so the guard-demo coverage survives.
7. Run `bunx convex codegen` (new `poolDetailsOps` module; `users` loses moved
   functions) and commit the `_generated` diff.

### Invariants

- `convex/poolDetails.ts` stays server-free (grep: no `_generated/server`).
- All `api.users.*` / `internal.users.*` references re-pointed; `tsc` clean
  proves no dangling reference.
- Four-field shape is ONE source (`poolDetailsValidator`): `schema.ts` and
  `setPoolDetails` args both reference it.
- `POOL_DETAILS_INCOMPLETE_MESSAGE` and gate semantics unchanged. `myProfile` is
  the only deletion (it was dead).

### Tests

- Re-point `poolDetails.test.ts` imports/`api` references to `poolDetailsOps`;
  consider renaming it `poolDetailsOps.test.ts` if it now tests that module
  (implementer judgment — minimum: it passes).
- `users.test.ts`: `currentUser` tests stay; `myProfile` test replaced per (6).

### Acceptance

- `tsc` clean; full suite green.
- `grep -rn "myProfile" convex src` is empty.
- `grep -n "v.string()" convex/schema.ts` no longer shows the four pool-details
  fields inline (they come from `poolDetailsValidator`).

## Task 5: Concentrate the Booking decision

**Candidate C2 (ADR-0003).** The booking PRE-decision — which class, is it
bookable, are Pool details complete, is it already booked — is split across
`bookNow` and `ruleContext`, with a divergent bookable threshold (manual allows
in-progress; auto requires upcoming) and the Pool-details gate written three
times. The Convex runtime split forces several entry points, so the win is
**locality**: name and co-locate the decision predicates so both paths read one
source. **Do Tasks 1 and 4 first.**

### Files (read before editing)

- `convex/book.ts:75-101` — `bookNow`: `if (!classStatus(cls, new Date()).bookable)` (`:87`) refuses only `finished`.
- `convex/autoBook.ts:110-161` — `ruleContext`: `if (status !== "upcoming") return { kind: "started" }` (`:153-157`) refuses in-progress too; inline details gate at `:121-124`.
- `convex/poolDetailsOps.ts` (from Task 4) — `requirePoolDetails`, `requirePoolDetailsForAction`.
- `convex/week.ts:147-170` — `classStatus`/`bookable`/`ClassStatus`.
- ADR-0003 (`docs/adr/0003-divergent-bookable-thresholds.md`).

### Change

1. Create `convex/bookingDecision.ts` (server-free pure predicates; import only
   types + `classStatus` from `./week`; no ctx, no `_generated/server`).
   Module JSDoc cites ADR-0003 for WHY the two differ. Export:

   ```ts
   // "Book now": a User may grab any class that has not finished (incl. one
   // already in progress).
   export function manualBookable(cls: ClassTimingInput, now: Date): boolean; // = classStatus(cls, now).bookable

   // AutoBook: the day-before cron only books a class still upcoming and gives
   // up once it has started (ADR-0003).
   export function autoBookable(cls: ClassTimingInput, now: Date): boolean; // = classStatus(cls, now).status === "upcoming"
   ```
   (Use the same minimal `{ date; startTime; endTime }` input `classStatus`
   accepts.)

2. `convex/book.ts`: `bookNow` uses `if (!manualBookable(cls, new Date()))`
   (replacing the `:87` check). Message unchanged.

3. `convex/autoBook.ts`: `ruleContext` uses `if (!autoBookable(cls, now))`
   (replacing `:153-157`), where `now` is the resolved `Date`.

4. Collapse the three-times-written Pool-details gate to one named predicate.
   Add to `convex/poolDetails.ts` (server-free):
   ```ts
   export function hasCompleteDetails(
     user: { detailsComplete?: boolean; poolDetails?: PoolDetails | null } | null,
   ): user is { detailsComplete: true; poolDetails: PoolDetails };
   ```
   (true iff `detailsComplete === true` AND `poolDetails` present — exactly
   today's checks.) Then:
   - `requirePoolDetails` / `requirePoolDetailsForAction` (poolDetailsOps): use
     `hasCompleteDetails(...)` for their throw checks.
   - `ruleContext` (autoBook.ts:121-124): use `hasCompleteDetails(owner)` for
     its `no_details` verdict (system context returns a verdict, not a throw —
     the predicate is shared, the action on it differs).

5. Run `bunx convex codegen` if any function signature/module changed
   (likely no `api` change — `bookingDecision`/`hasCompleteDetails` are not
   Convex functions; codegen is a no-op but run it to confirm).

### Invariants

- `manualBookable` = not finished; `autoBookable` = upcoming only. EXACT current
  thresholds — the divergence is preserved and now named (ADR-0003), not altered.
- `hasCompleteDetails` reproduces the existing gate semantics precisely.
- `bookNow` and `ruleContext` behaviour identical; `book.test.ts` and
  `autoBook.test.ts` stay green.
- `bookingDecision.ts` server-free.

### Tests

- New `convex/bookingDecision.test.ts`: `manualBookable` allows `upcoming` and
  `in-progress`, rejects `finished`; `autoBookable` allows ONLY `upcoming`,
  rejects `in-progress` and `finished`. This locks ADR-0003's divergence so a
  future "unify the thresholds" edit fails a test.
- Existing `book.test.ts` / `autoBook.test.ts` unchanged and green.

### Acceptance

- `tsc` clean; full suite green (+ the new `bookingDecision` tests).
- `grep -n "\\.bookable" convex` and `grep -n '=== "upcoming"' convex` show the
  threshold logic only inside `bookingDecision.ts` (callers use the predicates).
- The Pool-details completeness check (`detailsComplete` + `poolDetails`) is
  written once (`hasCompleteDetails`); `requirePoolDetails`,
  `requirePoolDetailsForAction`, and `ruleContext` all call it.
