# Privacy & UI Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Encrypt pool-details PII at rest, give the app one consistent width, add an "unofficial app" disclaimer, and surface duplicate-auto-registration feedback.

**Architecture:** Keep pool details in the DB (the server-side AutoBook cron needs them) but store `name/surname/phone` as AES-256-GCM ciphertext, decrypting only server-side for booking and for the owner's own reads. Frontend changes standardize the `AppShell` frame width, add a shared disclaimer dialog reachable from the header, and add UI guards for already-auto-booked classes.

**Tech Stack:** Convex (default + Node runtimes), Web Crypto (`crypto.subtle`, AES-GCM), Next.js 16 App Router, Chakra UI v3, vitest + convex-test.

## Global Constraints

- Convex functions use object syntax: `query({ args, handler })` etc. (per `convex/_generated/ai/guidelines.md`).
- Never add `"use node";` to a file exporting queries/mutations. `convex/crypto.ts` must work in the **default** runtime (no Node built-ins) — use Web Crypto globals (`crypto.subtle`, `crypto.getRandomValues`, `atob`, `btoa`, `TextEncoder`, `TextDecoder`).
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
- Produces:
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run convex/crypto.test.ts`
Expected: PASS (3 tests).

If `crypto.subtle` is unavailable in the Convex default runtime at deploy time (it is expected to be available), the fallback is to move encrypt/decrypt into a `"use node"` action module using `node:crypto`; this plan assumes the default-runtime path.

- [ ] **Step 5: Commit**

```bash
git add convex/crypto.ts convex/crypto.test.ts
git commit -m "feat(convex): AES-256-GCM field encryption helpers"
```

---

### Task 2: Test key + encrypted-seed helper

**Files:**
- Modify: `convex/test.setup.ts`
- Create: `convex/testHelpers.ts`

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

### Task 3: Encrypt on write, decrypt on owner read

**Files:**
- Modify: `convex/poolDetails.ts` (add `StoredPoolDetails` type)
- Modify: `convex/poolDetailsOps.ts:69-90` (`setPoolDetails`), `:40-50` (`myPoolDetails`)
- Test: `convex/poolDetailsOps.test.ts` (existing; verify still green + add ciphertext assertion)

**Interfaces:**
- Consumes: `encryptPoolFields`, `decryptPoolFields` (Task 1).
- Produces: stored `users.poolDetails` with ciphertext `name/surname/phone`; `myPoolDetails` returns decrypted `PoolDetails`.

- [ ] **Step 1: Add the failing assertion that storage is ciphertext**

Add to `convex/poolDetailsOps.test.ts` inside the first describe block:

```ts
  test("stores name/surname/phone as ciphertext, not plaintext", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", { email: ACCOUNT_EMAIL }),
    );
    const asUser = t.withIdentity({ subject: userId });
    await asUser.mutation(api.poolDetailsOps.setPoolDetails, INPUT);

    const raw = await t.run((ctx) => ctx.db.get("users", userId));
    expect(raw?.poolDetails?.name).toMatch(/^v1:/);
    expect(raw?.poolDetails?.name).not.toContain("Jonas");
    expect(raw?.poolDetails?.email).toBe(ACCOUNT_EMAIL); // email stays plaintext
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/poolDetailsOps.test.ts`
Expected: FAIL — `poolDetails.name` is `"Jonas"`, not `v1:...`.

- [ ] **Step 3: Add the stored-shape type**

In `convex/poolDetails.ts`, after the `PoolDetails` type (line 43), add:

```ts
/** The at-rest shape: name/surname/phone are AES-GCM ciphertext, email plaintext. */
export type StoredPoolDetails = PoolDetails;
```

(The validator shape is unchanged — four strings — so `schema.ts` needs no structural edit. Update the comment at `schema.ts:16` to note the three fields are encrypted at rest.)

- [ ] **Step 4: Encrypt in `setPoolDetails`**

Replace the `ctx.db.patch` block in `convex/poolDetailsOps.ts` (`setPoolDetails`, lines 84-87) with:

```ts
    const encrypted = await encryptPoolFields(result.value);
    await ctx.db.patch("users", userId, {
      poolDetails: { ...encrypted, email },
      detailsComplete: true,
    });
```

Add the import at the top of `poolDetailsOps.ts`:

```ts
import { decryptPoolFields, encryptPoolFields } from "./crypto";
```

- [ ] **Step 5: Decrypt in `myPoolDetails`**

Replace the `myPoolDetails` handler return (lines 44-48) with:

```ts
    const user = await ctx.db.get("users", userId);
    const stored = user?.poolDetails ?? null;
    return {
      poolDetails: stored
        ? { ...(await decryptPoolFields(stored)), email: stored.email }
        : null,
      detailsComplete: user?.detailsComplete ?? false,
    };
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run convex/poolDetailsOps.test.ts`
Expected: PASS — the `toEqual(STORED)` round-trip holds (myPoolDetails decrypts), plus the new ciphertext-at-rest test.

- [ ] **Step 7: Commit**

```bash
git add convex/poolDetails.ts convex/poolDetailsOps.ts convex/poolDetailsOps.test.ts convex/schema.ts
git commit -m "feat(convex): encrypt pool details at rest, decrypt for owner"
```

---

### Task 4: Decrypt in the booking gates + AutoBook cron

**Files:**
- Modify: `convex/poolDetailsOps.ts` (`requirePoolDetails` lines 104-113)
- Modify: `convex/autoBook.ts` (`ruleContext` line 221)
- Test: `convex/book.test.ts`, `convex/autoBook.test.ts` (update any direct `poolDetails` seeds to use `encryptedPoolDetails`)

**Interfaces:**
- Consumes: `decryptPoolFields` (Task 1), `encryptedPoolDetails` (Task 2).
- Note: `requirePoolDetailsForAction` already delegates to `myPoolDetails` (now decrypting), so it needs no change.

- [ ] **Step 1: Find direct pool-details seeds in the booking tests**

Run: `npx vitest run convex/book.test.ts convex/autoBook.test.ts`
Expected: FAIL after Step 2/3 unless seeds are encrypted — first, locate seeds:
Run: search for `poolDetails:` in `convex/book.test.ts` and `convex/autoBook.test.ts`.

- [ ] **Step 2: Decrypt in `requirePoolDetails`**

Replace the return in `convex/poolDetailsOps.ts` `requirePoolDetails` (lines 108-112) with:

```ts
  const user = await ctx.db.get("users", userId);
  if (!hasCompleteDetails(user)) {
    throw new Error(POOL_DETAILS_INCOMPLETE_MESSAGE);
  }
  const poolDetails = {
    ...(await decryptPoolFields(user.poolDetails)),
    email: user.poolDetails.email,
  };
  return { userId, poolDetails };
```

- [ ] **Step 3: Decrypt in `ruleContext`**

Replace the `ready` return in `convex/autoBook.ts` (line 221) with:

```ts
    return {
      kind: "ready",
      userId,
      pid: cls.pid,
      poolDetails: {
        ...(await decryptPoolFields(owner.poolDetails)),
        email: owner.poolDetails.email,
      },
    };
```

Add to `convex/autoBook.ts` imports: `import { decryptPoolFields } from "./crypto";`

- [ ] **Step 4: Update test seeds**

For every direct `ctx.db.insert("users", { ..., poolDetails: { name, surname, phone, email } })` (or `ctx.db.patch`) in `book.test.ts` / `autoBook.test.ts`, replace the inline `poolDetails` object with `await encryptedPoolDetails({ name, surname, phone }, email)` (import from `./testHelpers`). Example transform:

```ts
// before
poolDetails: { name: "Jonas", surname: "Jonaitis", phone: "+37061234567", email: "jonas@example.com" },
// after
poolDetails: await encryptedPoolDetails(
  { name: "Jonas", surname: "Jonaitis", phone: "+37061234567" },
  "jonas@example.com",
),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run convex/book.test.ts convex/autoBook.test.ts convex/poolDetailsOps.test.ts`
Expected: PASS — booking and cron paths decrypt correctly.

- [ ] **Step 6: Commit**

```bash
git add convex/poolDetailsOps.ts convex/autoBook.ts convex/book.test.ts convex/autoBook.test.ts
git commit -m "feat(convex): decrypt pool details in booking + autobook paths"
```

---

### Task 5: One-off migration of existing rows

**Files:**
- Create: `convex/migrations.ts`
- Test: `convex/migrations.test.ts`

**Interfaces:**
- Consumes: `encryptField`, `isEncrypted` (Task 1).
- Produces: `internal.migrations.migratePoolDetailsToEncrypted` (internalMutation) → `{ migrated: number }`.

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

    const first = await t.mutation(internal.migrations.migratePoolDetailsToEncrypted, {});
    expect(first.migrated).toBe(1);

    const row = await t.run((ctx) => ctx.db.get("users", userId));
    expect(isEncrypted(row!.poolDetails!.name)).toBe(true);
    expect(await decryptPoolFields(row!.poolDetails!)).toEqual({
      name: "Jonas",
      surname: "J",
      phone: "+37061234567",
    });

    const second = await t.mutation(internal.migrations.migratePoolDetailsToEncrypted, {});
    expect(second.migrated).toBe(0); // idempotent
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/migrations.test.ts`
Expected: FAIL — cannot find `internal.migrations`.

- [ ] **Step 3: Implement the migration**

```ts
// convex/migrations.ts
import { internalMutation } from "./_generated/server";
import { encryptField, isEncrypted } from "./crypto";

/**
 * One-off: encrypt any legacy plaintext name/surname/phone in users.poolDetails.
 * Idempotent — fields already ciphertext (v1:) are left untouched. Run once via
 * `npx convex run migrations:migratePoolDetailsToEncrypted` after deploy.
 */
export const migratePoolDetailsToEncrypted = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ migrated: number }> => {
    const users = await ctx.db.query("users").collect();
    let migrated = 0;
    for (const u of users) {
      const pd = u.poolDetails;
      if (!pd) continue;
      if (isEncrypted(pd.name) && isEncrypted(pd.surname) && isEncrypted(pd.phone)) {
        continue;
      }
      await ctx.db.patch("users", u._id, {
        poolDetails: {
          name: isEncrypted(pd.name) ? pd.name : await encryptField(pd.name),
          surname: isEncrypted(pd.surname) ? pd.surname : await encryptField(pd.surname),
          phone: isEncrypted(pd.phone) ? pd.phone : await encryptField(pd.phone),
          email: pd.email,
        },
      });
      migrated++;
    }
    return { migrated };
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run convex/migrations.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/migrations.ts convex/migrations.test.ts
git commit -m "feat(convex): one-off migration to encrypt existing pool details"
```

---

### Task 6: Encryption note on the pool-details form

**Files:**
- Modify: `src/app/pool-details-form.tsx`

- [ ] **Step 1: Add a reassurance line near the submit area**

In `src/app/pool-details-form.tsx`, add below the fields (above the submit button) a muted line:

```tsx
<Text fontSize="xs" color="fg.muted">
  Your name, surname and phone are encrypted at rest.
</Text>
```

Ensure `Text` is imported from `@chakra-ui/react`.

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit && npx eslint src/app/pool-details-form.tsx`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/pool-details-form.tsx
git commit -m "feat(ui): note that pool details are encrypted at rest"
```

---

### Task 7: Consistent frame width

**Files:**
- Modify: `src/app/app-shell.tsx`, `src/app/signin/page.tsx:28`, `src/app/settings/page.tsx:13-14`

- [ ] **Step 1: Standardize the frame**

In `src/app/app-shell.tsx`, keep `maxW = "3xl"` as the default and treat it as the single frame width. (No signature change needed — callers stop overriding it.)

- [ ] **Step 2: Signin — narrow content, not the frame**

In `src/app/signin/page.tsx`, change `<AppShell maxW="md">` to `<AppShell>`. The `AuthForm` is already `maxW="sm"` and centered by the wrapping `Flex`, so the form stays compact inside the 3xl frame.

- [ ] **Step 3: Settings — narrow content, not the frame**

In `src/app/settings/page.tsx`, change `<AppShell maxW="lg" ...>` to `<AppShell ...>` and wrap the inner `Stack` content in a `maxW="lg"` block:

```tsx
<Stack gap="6" maxW="lg">
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npx eslint src/app/app-shell.tsx src/app/signin/page.tsx src/app/settings/page.tsx`
Expected: clean. Browser check: header brand/edges align across dashboard, settings, signin.

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

Convert `AppShell` to own disclaimer state. Add imports: `useEffect, useState` from `react`; `IconButton` from `@chakra-ui/react`; `LuInfo` from `react-icons/lu`; `DisclaimerDialog` from `./disclaimer-dialog`. Inside the component:

```tsx
  const [aboutOpen, setAboutOpen] = useState(false);
  useEffect(() => {
    if (localStorage.getItem("fabb.disclaimerSeen") !== "1") {
      setAboutOpen(true);
      localStorage.setItem("fabb.disclaimerSeen", "1");
    }
  }, []);
```

In the header actions `HStack`, add the info button before `<ColorModeButton />`:

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
Expected: clean. Browser: info icon shows on every screen; dialog auto-opens once for a fresh `localStorage`, reopens via the icon.

- [ ] **Step 4: Commit**

```bash
git add src/app/disclaimer-dialog.tsx src/app/app-shell.tsx
git commit -m "feat(ui): unofficial-app disclaimer dialog with header info icon"
```

---

### Task 9: Duplicate auto-registration feedback

**Files:**
- Create: `src/app/dashboard/rule-match.ts` (pure matcher) + `src/app/dashboard/rule-match.test.ts`
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
const cls = { date: "2026-06-19", startTime: "07:00", name: "TRX" }; // 2026-06-19 is a Friday (ISO weekday 5)

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

In `src/app/dashboard/auto-book-rules.tsx` `AddRuleBody`: add `const rules = useQuery(api.autoBookRules.listMine) ?? [];`. When building the Select `collection` items, compute `disabled: hasEnabledRuleForClass(rules, cls)` and append " · already auto-booked" to the label when disabled. Pass `disabled` through to `<Select.Item item={item}>` (Chakra `Select.Item` respects an item's `disabled` via the collection's `isItemDisabled`, configured on `createListCollection({ items, isItemDisabled: (i) => i.disabled })`). Import `hasEnabledRuleForClass` from `./rule-match`.

- [ ] **Step 6: Disable "Auto-book weekly" when a rule exists**

In `src/app/dashboard/class-detail.tsx` `AutoBookWeekly`: add `const rules = useQuery(api.autoBookRules.listMine) ?? [];` and `const already = hasEnabledRuleForClass(rules, cls);`. When `already`, render the button disabled labeled "Already auto-booking" and a one-line note instead of the create flow. Import `hasEnabledRuleForClass` from `./rule-match`.

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
- #1 encryption → Tasks 1–6 (helpers, key, store/read, gates+cron, migration, UI note). ✓
- #2 width → Task 7. ✓
- #3 disclaimer → Task 8. ✓
- #4 dup auto-rule → Task 9. ✓

**Placeholder scan:** No TBD/TODO; every code step has concrete code. The Convex-runtime crypto fallback is stated once as a known contingency, not a placeholder.

**Type consistency:** `encryptPoolFields`/`decryptPoolFields` operate on `{name,surname,phone}` everywhere; stored `poolDetails` keeps the `{name,surname,phone,email}` four-string shape; `MyPoolDetails`/`PoolDetails` returns stay plaintext. `hasEnabledRuleForClass(rules, cls)` signature is consistent across Tasks 9 steps. `POOL_DETAILS_KEY` test value (`MDEy…`) is identical in Tasks 1 and 2.

**Risk note:** the booking/autobook test seeds must all route through `encryptedPoolDetails` (Task 4 Step 4) — missing one will surface as a decrypt error in Task 4 Step 5.
