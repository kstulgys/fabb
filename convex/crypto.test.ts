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
