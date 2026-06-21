import { encryptPoolFields } from "./crypto";

export async function encryptedPoolDetails(
  input: { name: string; surname: string; phone: string },
  email: string,
): Promise<{ name: string; surname: string; phone: string; email: string }> {
  return { ...(await encryptPoolFields(input)), email };
}
