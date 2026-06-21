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

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(`${SCHEME}:`);
}

export async function encryptField(plain: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes(),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      cryptoKey,
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
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes(),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
  const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
  const data = Uint8Array.from(atob(ctB64), (c) => c.charCodeAt(0));
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    data,
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
