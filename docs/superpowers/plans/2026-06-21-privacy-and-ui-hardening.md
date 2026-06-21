# Privacy & UI Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Encrypt pool-details PII at rest, give the app one consistent width, add an "unofficial app" disclaimer, and surface duplicate-auto-registration feedback.

**Architecture:** Keep pool details in the DB (the server-side AutoBook cron needs them) but store `name/surname/phone` as AES-256-GCM ciphertext. Because Convex's `crypto.subtle` is actions-only, all encrypt/decrypt happens in **actions**: writes go through an action, and the booking actions / a dedicated owner-read action decrypt. Frontend changes standardize the `AppShell` frame width, add a shared disclaimer dialog reachable from the header, and add UI guards for already-auto-booked classes.

**Tech Stack:** Convex (default + Node action runtimes), Web Crypto (`crypto.subtle`, AES-GCM), Next.js 16 App Router, Chakra UI v3, vitest + convex-test.

## Global Constraints

- Convex functions use object syntax: `query({ args, handler })` etc. (per `convex/_generated/ai/guidelines.md`).
- Never add `"use node";` to a file exporting queries/mutations. `convex/crypto.ts` uses Web Crypto globals (`crypto.subtle`, `crypto.getRandomValues`, `atob`, `btoa`, `TextEncoder`, `TextDecoder`) and is imported by action files; its functions are only *called* from action contexts.
- **`crypto.subtle` AES-GCM is ACTIONS-ONLY in Convex** (queries/mutations must stay deterministic), per Convex ≥1.37 (we are on 1.41). ALL encrypt/decrypt happens inside `action`/`internalAction` — NEVER a `query`/`mutation`. Reads needing plaintext are exposed as actions; query/mutation gates pass ciphertext through (callers there need only userId + completeness).
- `name`, `surname`, `phone` are NEVER stored in plaintext. `email` stays plaintext (auth account identity).
- Ciphertext format: `v1:<base64(iv)>.<base64(ciphertext)>`, fresh 12-byte IV per encryption.
- Encryption key: env var `POOL_DETAILS_KEY` = base64 of exactly 32 bytes. Fail closed (throw) if missing/wrong length — never silently store plaintext.
- AppShell frame width is a single value for all screens (`3xl`). Narrower content is constrained inside the frame, not by resizing the frame.
- Reuse the existing `SheetDialog` (`src/app/dashboard/sheet-dialog.tsx`) for the disclaimer modal.

---

### Task 1: Crypto helpers (`convex/crypto.ts`)

**Files:**
- Create: `convex/crypto.ts`
- Test: `convex/crypto.test.ts`

**Interfaces:**
- Produces (pure helpers; only *called* from actions):
  - `encryptField(plain: string): Promise<string>`
  - `decryptField(stored: string): Promise<string>`
  - `isEncrypted(value: string): boolean`
  - `encryptPoolFields(f: { name: string; surname: string; phone: string }): Promise<{ name: string; surname: string; phone: string }>`
  - `decryptPoolFields(f: { name: string; surname: string; phone: string }): Promise<{ name: string; surname: string; phone: string }>`

- [ ] **Step 1: Write the failing test**

```ts
// convex/crypto.test.ts
import { describe, expect, test } from "vitest";

process.env.POOL_DETAILS_KEY = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="; // 32 bytes

import { decryptField, encryptField, isEncrypted } from "./crypto";

describe("crypto", () => {
  test("round-trips a value and never returns it in plaintext", async () => {
    const ct = await encryptField("Jonas");
    expect(ct).not.toContain("Jonas");
    expect(isEncrypted(ct)).toBe(true);
    expect(await decryptField(ct)).toBe("Jonas");
  });

  test("uses a fresh IV per call", async () => {
    expect(await encryptField("x")).not.toBe(await encryptField("x"));
  });

  test("rejects non-ciphertext", async () => {
    expect(isEncrypted("Jonas")).toBe(false);
    await expect(decryptField("Jonas")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/crypto.test.ts`
Expected: FAIL — cannot find module `./crypto`.

- [ ] **Step 3: Write minimal implementation**

```ts
// convex/crypto.ts
const SCHEME = "v1";

function keyBytes(): Uint8Array {
  const b64 = process.env.POOL_DETAILS_KEY;
  if (!b64) throw new Error("POOL_DETAILS_KEY is not set");
  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  if (raw.length !== 32) {
    throw new Error("POOL_DETAILS_KEY must be base64 of 32 bytes");
  }
  return raw;
}

async function key(): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", keyBytes(), { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(`${SCHEME}:`);
}

export async function encryptField(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      await key(),
      new TextEncoder().encode(plain),
    ),
  );
  return `${SCHEME}:${toB64(iv)}.${toB64(ct)}`;
}

export async function decryptField(stored: string): Promise<string> {
  const sep = stored.indexOf(":");
  if (sep === -1 || stored.slice(0, sep) !== SCHEME) {
    throw new Error("Unrecognized ciphertext scheme");
  }
  const [ivB64, ctB64] = stored.slice(sep + 1).split(".");
  if (!ivB64 || !ctB64) throw new Error("Malformed ciphertext");
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(ivB64) },
    await key(),
    fromB64(ctB64),
  );
  return new TextDecoder().decode(pt);
}

export async function encryptPoolFields(f: {
  name: string;
  surname: string;
  phone: string;
}): Promise<{ name: string; surname: string; phone: string }> {
  return {
    name: await encryptField(f.name),
    surname: await encryptField(f.surname),
    phone: await encryptField(f.phone),
  };
}

export async function decryptPoolFields(f: {
  name: string;
  surname: string;
  phone: string;
}): Promise<{ name: string; surname: string; phone: string }> {
  return {
    name: await decryptField(f.name),
    surname: await decryptField(f.surname),
    phone: await decryptField(f.phone),
  };
}
```

Note: the unit test runs under vitest/Node where `crypto.subtle` exists; the actions-only constraint is satisfied by DESIGN (these helpers are only called from action functions — Tasks 3–5).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run convex/crypto.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add convex/crypto.ts convex/crypto.test.ts
git commit -m "feat(convex): AES-256-GCM field encryption helpers"
```

---

### Task 2: Test key + encrypted-seed helper

**Files:**
- Modify: `convex/test.setup.ts`
- Create: `convex/testHelpers.ts`, `convex/testHelpers.test.ts`

**Interfaces:**
- Consumes: `encryptPoolFields` (Task 1).
- Produces: `encryptedPoolDetails(input: { name: string; surname: string; phone: string }, email: string): Promise<{ name: string; surname: string; phone: string; email: string }>` — builds the stored (ciphertext + plaintext email) shape for seeding users directly in tests.

- [ ] **Step 1: Add the key to the test environment**

```ts
// convex/test.setup.ts  (append after the existing SITE_URL line)
process.env.POOL_DETAILS_KEY ??=
  "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="; // 32 bytes, test only
```

- [ ] **Step 2: Write the failing test for the helper**

```ts
// convex/testHelpers.test.ts
import { describe, expect, test } from "vitest";
import { decryptPoolFields } from "./crypto";
import { encryptedPoolDetails } from "./testHelpers";

describe("encryptedPoolDetails", () => {
  test("produces ciphertext fields + plaintext email", async () => {
    const stored = await encryptedPoolDetails(
      { name: "Jonas", surname: "Jonaitis", phone: "+37061234567" },
      "jonas@example.com",
    );
    expect(stored.email).toBe("jonas@example.com");
    expect(stored.name).not.toBe("Jonas");
    expect(await decryptPoolFields(stored)).toEqual({
      name: "Jonas",
      surname: "Jonaitis",
      phone: "+37061234567",
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run convex/testHelpers.test.ts`
Expected: FAIL — cannot find module `./testHelpers`.

- [ ] **Step 4: Implement the helper**

```ts
// convex/testHelpers.ts
import { encryptPoolFields } from "./crypto";

export async function encryptedPoolDetails(
  input: { name: string; surname: string; phone: string },
  email: string,
): Promise<{ name: string; surname: string; phone: string; email: string }> {
  return { ...(await encryptPoolFields(input)), email };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run convex/testHelpers.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add convex/test.setup.ts convex/testHelpers.ts convex/testHelpers.test.ts
git commit -m "test(convex): pool-details encryption key + seed helper"
```

---

### Task 3: Encrypt on write (action) + owner decrypt action

**Files:**
- Modify: `convex/poolDetails.ts` (add `StoredPoolDetails` type alias)
- Modify: `convex/poolDetailsOps.ts` — `setPoolDetails` becomes an **action**; add `accountEmail` (internalQuery), `storePoolDetails` (internalMutation), `getPoolDetailsDecrypted` (action). `myPoolDetails` query is UNCHANGED (still returns the stored — now ciphertext — `poolDetails` + `detailsComplete`).
- Test: `convex/poolDetailsOps.test.ts`

**Interfaces:**
- Consumes: `encryptPoolFields`, `decryptPoolFields` (Task 1).
- Produces:
  - `api.poolDetailsOps.setPoolDetails` — now an **action**, same args `{ name, surname, phone }`.
  - `api.poolDetailsOps.getPoolDetailsDecrypted` — action → `MyPoolDetails` with PLAINTEXT `poolDetails` (owner only).
  - `internal.poolDetailsOps.accountEmail({ userId })` → validated account email or throws `ACCOUNT_EMAIL_MISSING_MESSAGE`.
  - `internal.poolDetailsOps.storePoolDetails({ userId, encrypted, email })` → persists ciphertext + plaintext email, sets `detailsComplete`.

- [ ] **Step 1: Update the test to the action API + ciphertext-at-rest**

In `convex/poolDetailsOps.test.ts`, change the first describe block's `setPoolDetails` calls from `asUser.mutation(...)` to `asUser.action(...)`, read the round-trip via `getPoolDetailsDecrypted`, and add a ciphertext assertion:

```ts
    await asUser.action(api.poolDetailsOps.setPoolDetails, INPUT);
    const mine = await asUser.action(api.poolDetailsOps.getPoolDetailsDecrypted, {});
    expect(mine.detailsComplete).toBe(true);
    expect(mine.poolDetails).toEqual(STORED); // decrypted round-trip

    const raw = await t.run((ctx) => ctx.db.get("users", userId));
    expect(raw?.poolDetails?.name).toMatch(/^v1:/); // ciphertext at rest
    expect(raw?.poolDetails?.name).not.toContain("Jonas");
    expect(raw?.poolDetails?.email).toBe(ACCOUNT_EMAIL); // email plaintext
```

Apply the same `mutation`→`action` change to the second test's two `setPoolDetails` calls and read back via `getPoolDetailsDecrypted`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/poolDetailsOps.test.ts`
Expected: FAIL — `setPoolDetails` is still a mutation / `getPoolDetailsDecrypted` undefined.

- [ ] **Step 3: Add the stored-shape type**

In `convex/poolDetails.ts`, after the `PoolDetails` type (line 43):

```ts
/** At-rest shape: name/surname/phone are AES-GCM ciphertext, email plaintext. */
export type StoredPoolDetails = PoolDetails;
```

Update the comment at `schema.ts:16` to note the three fields are encrypted at rest.

- [ ] **Step 4: Replace `setPoolDetails` with an action + internals**

In `convex/poolDetailsOps.ts`, add imports:

```ts
import { action, internalMutation, internalQuery } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import { decryptPoolFields, encryptPoolFields } from "./crypto";
```

Replace the whole `setPoolDetails` mutation (lines 69-90) with:

```ts
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
```

- [ ] **Step 5: Add the owner decrypt action**

Append to `convex/poolDetailsOps.ts`:

```ts
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
```

(`myPoolDetails` query stays exactly as-is — it now returns ciphertext, which is fine for the action gate that decrypts; the client form no longer reads it.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run convex/poolDetailsOps.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add convex/poolDetails.ts convex/poolDetailsOps.ts convex/poolDetailsOps.test.ts convex/schema.ts
git commit -m "feat(convex): encrypt pool details on write via action + owner decrypt action"
```

---

### Task 4: Decrypt in action contexts (booking + AutoBook)

**Files:**
- Modify: `convex/poolDetailsOps.ts` (`requirePoolDetailsForAction` — decrypt)
- Modify: `convex/autoBookAttempt.ts` (`attemptRule` — decrypt before `bookAndRecord`)
- Test: `convex/book.test.ts`, `convex/autoBook.test.ts`, `convex/poolDetailsOps.test.ts`

**Interfaces:**
- Consumes: `decryptPoolFields` (Task 1), `encryptedPoolDetails` (Task 2).
- Unchanged: `requirePoolDetails` (query/mutation gate) returns the stored ciphertext + userId; its only production caller (`autoBookRules.createFromClass`) uses just `userId`. `ruleContext` (internalQuery) still returns ciphertext in its `ready` verdict.

- [ ] **Step 1: Fix the requirePoolDetails gate test (returns ciphertext now)**

In `convex/poolDetailsOps.test.ts`, the `requirePoolDetails` gate test asserts `gated.poolDetails` equals plaintext `STORED`. The gate now returns ciphertext; change it to:

```ts
    const gated = await asUser.query((ctx) => requirePoolDetails(ctx));
    expect(gated.userId).toBe(userId);
    expect(gated.poolDetails.name).toMatch(/^v1:/);
```

Seed that test's user with `encryptedPoolDetails(...)` (import from `./testHelpers`) instead of an inline plaintext `poolDetails`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run convex/poolDetailsOps.test.ts convex/book.test.ts convex/autoBook.test.ts`
Expected: FAIL — gates/booking operate on ciphertext until Steps 3-4.

- [ ] **Step 3: Decrypt in `requirePoolDetailsForAction`**

In `convex/poolDetailsOps.ts`, replace the return of `requirePoolDetailsForAction` (`return { userId, poolDetails: details.poolDetails };`) with:

```ts
  const dec = await decryptPoolFields(details.poolDetails);
  return {
    userId,
    poolDetails: { ...dec, email: details.poolDetails.email },
  };
```

(Runs in ActionCtx — `crypto.subtle` allowed. `bookNow` consumes it unchanged.)

- [ ] **Step 4: Decrypt the verdict in `attemptRule`**

In `convex/autoBookAttempt.ts`, import `decryptPoolFields` from `./crypto`, and in the `book` branch decrypt before `bookAndRecord`:

```ts
    const dec = await decryptPoolFields(plan.poolDetails);
    const { status, bookingId } = await bookAndRecord(ctx, {
      userId: plan.userId,
      pid: plan.pid,
      date,
      poolDetails: { ...dec, email: plan.poolDetails.email },
      source: "rule",
      ruleId,
    });
```

- [ ] **Step 5: Encrypt all direct pool-details seeds in booking tests**

For every `ctx.db.insert("users", { ..., poolDetails: {...} })` / `ctx.db.patch` in `book.test.ts` and `autoBook.test.ts`, replace the inline `poolDetails` with `await encryptedPoolDetails({ name, surname, phone }, email)` (import from `./testHelpers`). Example:

```ts
poolDetails: await encryptedPoolDetails(
  { name: "Jonas", surname: "Jonaitis", phone: "+37061234567" },
  "jonas@example.com",
),
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run convex/poolDetailsOps.test.ts convex/book.test.ts convex/autoBook.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add convex/poolDetailsOps.ts convex/autoBookAttempt.ts convex/poolDetailsOps.test.ts convex/book.test.ts convex/autoBook.test.ts
git commit -m "feat(convex): decrypt pool details in booking + autobook actions"
```

---

### Task 5: One-off migration of existing rows (action)

**Files:**
- Create: `convex/migrations.ts`, `convex/migrations.test.ts`

**Interfaces:**
- Consumes: `encryptField`, `isEncrypted` (Task 1), `poolDetailsValidator` (poolDetails.ts).
- Produces: `internal.migrations.migratePoolDetailsToEncrypted` (**internalAction**) → `{ migrated: number }`; plus `internal.migrations.listForMigration` (internalQuery) and `internal.migrations.patchPoolDetails` (internalMutation).

- [ ] **Step 1: Write the failing test**

```ts
// convex/migrations.test.ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { decryptPoolFields, isEncrypted } from "./crypto";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("migratePoolDetailsToEncrypted", () => {
  test("encrypts legacy plaintext rows and is idempotent", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", {
        email: "a@b.com",
        poolDetails: { name: "Jonas", surname: "J", phone: "+37061234567", email: "a@b.com" },
        detailsComplete: true,
      }),
    );

    const first = await t.action(internal.migrations.migratePoolDetailsToEncrypted, {});
    expect(first.migrated).toBe(1);

    const row = await t.run((ctx) => ctx.db.get("users", userId));
    expect(isEncrypted(row!.poolDetails!.name)).toBe(true);
    expect(await decryptPoolFields(row!.poolDetails!)).toEqual({
      name: "Jonas", surname: "J", phone: "+37061234567",
    });

    const second = await t.action(internal.migrations.migratePoolDetailsToEncrypted, {});
    expect(second.migrated).toBe(0); // idempotent
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/migrations.test.ts`
Expected: FAIL — `internal.migrations` undefined.

- [ ] **Step 3: Implement the migration (action + internals)**

```ts
// convex/migrations.ts
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { encryptField, isEncrypted } from "./crypto";
import { poolDetailsValidator } from "./poolDetails";

/** Users whose poolDetails still hold any plaintext field. */
export const listForMigration = internalQuery({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    return users
      .filter(
        (u) =>
          u.poolDetails &&
          !(
            isEncrypted(u.poolDetails.name) &&
            isEncrypted(u.poolDetails.surname) &&
            isEncrypted(u.poolDetails.phone)
          ),
      )
      .map((u) => ({ userId: u._id, poolDetails: u.poolDetails! }));
  },
});

export const patchPoolDetails = internalMutation({
  args: { userId: v.id("users"), poolDetails: poolDetailsValidator },
  handler: async (ctx, { userId, poolDetails }): Promise<null> => {
    await ctx.db.patch("users", userId, { poolDetails });
    return null;
  },
});

/**
 * One-off: encrypt any legacy plaintext name/surname/phone. An action because
 * encryption is actions-only. Idempotent. Run once after deploy:
 * `npx convex run migrations:migratePoolDetailsToEncrypted`.
 */
export const migratePoolDetailsToEncrypted = internalAction({
  args: {},
  handler: async (ctx): Promise<{ migrated: number }> => {
    const rows: {
      userId: Id<"users">;
      poolDetails: { name: string; surname: string; phone: string; email: string };
    }[] = await ctx.runQuery(internal.migrations.listForMigration, {});
    for (const { userId, poolDetails: pd } of rows) {
      await ctx.runMutation(internal.migrations.patchPoolDetails, {
        userId,
        poolDetails: {
          name: isEncrypted(pd.name) ? pd.name : await encryptField(pd.name),
          surname: isEncrypted(pd.surname) ? pd.surname : await encryptField(pd.surname),
          phone: isEncrypted(pd.phone) ? pd.phone : await encryptField(pd.phone),
          email: pd.email,
        },
      });
    }
    return { migrated: rows.length };
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run convex/migrations.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/migrations.ts convex/migrations.test.ts
git commit -m "feat(convex): one-off action to encrypt existing pool details"
```

---

### Task 6: Pool-details form uses actions + encryption note

**Files:**
- Modify: `src/app/pool-details-form.tsx`

**Interfaces:**
- Consumes: `api.poolDetailsOps.setPoolDetails` (action), `api.poolDetailsOps.getPoolDetailsDecrypted` (action).

- [ ] **Step 1: Switch save + prefill to actions**

In `src/app/pool-details-form.tsx`:
- Imports: `import { useAction, useQuery } from "convex/react";` (keep `useQuery` for `currentUser`; drop `useMutation`).
- Replace lines 58-59 with:

```tsx
  const loadDetails = useAction(api.poolDetailsOps.getPoolDetailsDecrypted);
  const save = useAction(api.poolDetailsOps.setPoolDetails);
```

- Replace the prefill effect (lines 71-79) with a one-shot load on mount:

```tsx
  useEffect(() => {
    let active = true;
    void loadDetails().then((mine) => {
      if (active && mine.poolDetails) {
        const { name, surname, phone } = mine.poolDetails;
        setValues({ name, surname, phone });
      }
    });
    return () => {
      active = false;
    };
  }, [loadDetails]);
```

- `handleSubmit` keeps `await save(result.value)` (now the action) — no change there.

- [ ] **Step 2: Add the encryption note**

Below the booking-email `Field.Root` (after line 146), add:

```tsx
<Text fontSize="xs" color="fg.muted">
  Your name, surname and phone are encrypted at rest.
</Text>
```

Add `Text` to the `@chakra-ui/react` import.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npx eslint src/app/pool-details-form.tsx`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/pool-details-form.tsx
git commit -m "feat(ui): pool-details form via encrypt/decrypt actions + at-rest note"
```

---

### Task 7: Consistent frame width

**Files:**
- Modify: `src/app/app-shell.tsx`, `src/app/signin/page.tsx:28`, `src/app/settings/page.tsx:13-14`

- [ ] **Step 1: Standardize the frame**

In `src/app/app-shell.tsx`, keep `maxW = "3xl"` as the default and treat it as the single frame width. (No signature change — callers stop overriding it.)

- [ ] **Step 2: Signin — narrow content, not the frame**

In `src/app/signin/page.tsx`, change `<AppShell maxW="md">` to `<AppShell>`. `AuthForm` is already `maxW="sm"` and centered by the wrapping `Flex`, so it stays compact inside the 3xl frame.

- [ ] **Step 3: Settings — narrow content, not the frame**

In `src/app/settings/page.tsx`, change `<AppShell maxW="lg" ...>` to `<AppShell ...>` and wrap the inner content:

```tsx
<Stack gap="6" maxW="lg">
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npx eslint src/app/app-shell.tsx src/app/signin/page.tsx src/app/settings/page.tsx`
Expected: clean. Browser: header brand/edges align across dashboard, settings, signin.

- [ ] **Step 5: Commit**

```bash
git add src/app/app-shell.tsx src/app/signin/page.tsx src/app/settings/page.tsx
git commit -m "fix(ui): one consistent frame width across all screens"
```

---

### Task 8: Unofficial-app disclaimer

**Files:**
- Create: `src/app/disclaimer-dialog.tsx`
- Modify: `src/app/app-shell.tsx`

**Interfaces:**
- Consumes: `SheetDialog` from `src/app/dashboard/sheet-dialog.tsx`.
- Produces: `<DisclaimerDialog open onClose />`.

- [ ] **Step 1: Create the dialog**

```tsx
// src/app/disclaimer-dialog.tsx
"use client";

import { Button, Dialog, Stack, Text } from "@chakra-ui/react";
import { SheetDialog } from "./dashboard/sheet-dialog";

export function DisclaimerDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <SheetDialog open={open} onClose={onClose}>
      <Dialog.Header>
        <Dialog.Title>About fabb</Dialog.Title>
      </Dialog.Header>
      <Dialog.Body>
        <Stack gap="3">
          <Text>
            fabb is an unofficial helper for the Fabijoniškės pool&apos;s public
            booking site. It is not affiliated with or endorsed by the pool.
          </Text>
          <Text color="fg.muted">
            It works by reading and submitting to the pool&apos;s website on your
            behalf, so it can stop working at any time if the pool changes its
            website or how it works. Treat a booking as confirmed only when the
            pool emails you.
          </Text>
        </Stack>
      </Dialog.Body>
      <Dialog.Footer>
        <Button onClick={onClose}>Got it</Button>
      </Dialog.Footer>
    </SheetDialog>
  );
}
```

- [ ] **Step 2: Wire the info icon + first-visit auto-open into AppShell**

Add imports to `src/app/app-shell.tsx`: `useEffect, useState` from `react`; `IconButton` from `@chakra-ui/react`; `LuInfo` from `react-icons/lu`; `DisclaimerDialog` from `./disclaimer-dialog`. Inside the component:

```tsx
  const [aboutOpen, setAboutOpen] = useState(false);
  useEffect(() => {
    if (localStorage.getItem("fabb.disclaimerSeen") !== "1") {
      setAboutOpen(true);
      localStorage.setItem("fabb.disclaimerSeen", "1");
    }
  }, []);
```

In the header actions `HStack`, add before `<ColorModeButton />`:

```tsx
<IconButton
  aria-label="About this app"
  variant="ghost"
  size="sm"
  onClick={() => setAboutOpen(true)}
>
  <LuInfo />
</IconButton>
```

And render the dialog once, after the content `Container` (still inside the root `Box`):

```tsx
<DisclaimerDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npx eslint src/app/app-shell.tsx src/app/disclaimer-dialog.tsx`
Expected: clean. Browser: info icon on every screen; dialog auto-opens once for a fresh `localStorage`, reopens via the icon.

- [ ] **Step 4: Commit**

```bash
git add src/app/disclaimer-dialog.tsx src/app/app-shell.tsx
git commit -m "feat(ui): unofficial-app disclaimer dialog with header info icon"
```

---

### Task 9: Duplicate auto-registration feedback

**Files:**
- Create: `src/app/dashboard/rule-match.ts` + `src/app/dashboard/rule-match.test.ts`
- Modify: `src/app/dashboard/auto-book-rules.tsx` (`AddRuleBody` picker)
- Modify: `src/app/dashboard/class-detail.tsx` (`AutoBookWeekly`)

**Interfaces:**
- Consumes: `api.autoBookRules.listMine`, `isoWeekday` from `convex/week`.
- Produces: `hasEnabledRuleForClass(rules, cls): boolean`.

- [ ] **Step 1: Write the failing matcher test**

```ts
// src/app/dashboard/rule-match.test.ts
import { describe, expect, test } from "vitest";
import { hasEnabledRuleForClass } from "./rule-match";

const rule = (over: Partial<{ weekday: number; startTime: string; nameMatch: string; enabled: boolean }> = {}) => ({
  weekday: 5, startTime: "07:00", nameMatch: "TRX", enabled: true, ...over,
});
const cls = { date: "2026-06-19", startTime: "07:00", name: "TRX" }; // Friday = ISO weekday 5

describe("hasEnabledRuleForClass", () => {
  test("matches an enabled rule on weekday+time+name", () => {
    expect(hasEnabledRuleForClass([rule()], cls)).toBe(true);
  });
  test("ignores disabled rules", () => {
    expect(hasEnabledRuleForClass([rule({ enabled: false })], cls)).toBe(false);
  });
  test("no match on a different time", () => {
    expect(hasEnabledRuleForClass([rule({ startTime: "09:00" })], cls)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/dashboard/rule-match.test.ts`
Expected: FAIL — cannot find `./rule-match`.

- [ ] **Step 3: Implement the matcher**

```ts
// src/app/dashboard/rule-match.ts
import { isoWeekday } from "../../../convex/week";

type RuleLike = { weekday: number; startTime: string; nameMatch: string; enabled: boolean };
type ClassLike = { date: string; startTime: string; name: string };

/** True when the User already has an ENABLED auto-book rule that resolves to this class. */
export function hasEnabledRuleForClass(rules: RuleLike[], cls: ClassLike): boolean {
  const weekday = isoWeekday(cls.date);
  return rules.some(
    (r) =>
      r.enabled &&
      r.weekday === weekday &&
      r.startTime === cls.startTime &&
      r.nameMatch === cls.name,
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/dashboard/rule-match.test.ts`
Expected: PASS.

- [ ] **Step 5: Mark already-ruled classes in the Add-rule picker**

In `src/app/dashboard/auto-book-rules.tsx` `AddRuleBody`: add `const rules = useQuery(api.autoBookRules.listMine) ?? [];`. Build the Select collection with `createListCollection({ items, isItemDisabled: (i) => i.disabled })`, where each item gets `disabled: hasEnabledRuleForClass(rules, cls)` and a " · already auto-booked" suffix on the label when disabled. Import `hasEnabledRuleForClass` from `./rule-match`.

- [ ] **Step 6: Disable "Auto-book weekly" when a rule exists**

In `src/app/dashboard/class-detail.tsx` `AutoBookWeekly`: add `const rules = useQuery(api.autoBookRules.listMine) ?? [];` and `const already = hasEnabledRuleForClass(rules, cls);`. When `already`, render the button disabled labeled "Already auto-booking" with a one-line note instead of the create flow. Import `hasEnabledRuleForClass` from `./rule-match`.

- [ ] **Step 7: Verify**

Run: `npx vitest run src/app/dashboard/rule-match.test.ts && npx tsc --noEmit && npx eslint src/app/dashboard/auto-book-rules.tsx src/app/dashboard/class-detail.tsx src/app/dashboard/rule-match.ts`
Expected: clean. Browser: a class with an existing enabled rule is disabled/annotated in the picker and shows "Already auto-booking" in class detail.

- [ ] **Step 8: Commit**

```bash
git add src/app/dashboard/rule-match.ts src/app/dashboard/rule-match.test.ts src/app/dashboard/auto-book-rules.tsx src/app/dashboard/class-detail.tsx
git commit -m "feat(ui): block + signal duplicate auto-registrations"
```

---

### Task 10: Full verification

- [ ] **Step 1: Run the whole suite**

Run: `npm test`
Expected: all pass (including updated booking/autobook tests).

- [ ] **Step 2: Typecheck, lint, build**

Run: `npx tsc --noEmit && npx eslint && NEXT_PUBLIC_CONVEX_URL="https://example.convex.cloud" npx next build`
Expected: clean build.

- [ ] **Step 3: Post-deploy step (manual, documented)**

After deploying, set `POOL_DETAILS_KEY` (base64 of 32 random bytes) on the Convex deployment, then run the migration once:
`npx convex run migrations:migratePoolDetailsToEncrypted`

---

## Self-Review

**Spec coverage:**
- #1 encryption → Tasks 1–6 (helpers, key, action-based store + owner decrypt, action-context decrypt for booking/cron, migration action, form note). ✓
- #2 width → Task 7. ✓
- #3 disclaimer → Task 8. ✓
- #4 dup auto-rule → Task 9. ✓

**Actions-only correction (verified against Convex docs):** `crypto.subtle` is actions-only, so encryption lives in `setPoolDetails` (action) + `migratePoolDetailsToEncrypted` (internalAction); decryption lives in `getPoolDetailsDecrypted`/`requirePoolDetailsForAction`/`attemptRule` (all actions). `myPoolDetails`, `requirePoolDetails`, `ruleContext` stay in query/mutation context and pass ciphertext through (their consumers need only userId + completeness, except action consumers that decrypt).

**Placeholder scan:** No TBD/TODO; every code step has concrete code.

**Type consistency:** `encryptPoolFields`/`decryptPoolFields` operate on `{name,surname,phone}` everywhere; stored `poolDetails` keeps the `{name,surname,phone,email}` four-string shape; `MyPoolDetails`/`PoolDetails` plaintext returns only from action paths. `hasEnabledRuleForClass(rules, cls)` consistent across Task 9. `POOL_DETAILS_KEY` test value (`MDEy…`) identical in Tasks 1 and 2.

**Risk note:** the booking/autobook test seeds must all route through `encryptedPoolDetails` (Task 4 Step 5) — a missed seed surfaces as a decrypt error in Task 4 Step 6. `convex-test` runs in Node (where `crypto.subtle` exists), so it will NOT catch an accidental crypto call placed in a query/mutation — keep all crypto calls in action functions per the Global Constraints.
