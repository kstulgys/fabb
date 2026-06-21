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
