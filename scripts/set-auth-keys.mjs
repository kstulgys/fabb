// One-shot helper: generate the RS256 keypair Convex Auth uses to sign/verify
// JWTs and set JWT_PRIVATE_KEY + JWKS on the configured Convex deployment.
// Equivalent to what `npx @convex-dev/auth` does, but deterministic and
// non-interactive. Safe to re-run (rotates the keys).
import { execFileSync } from "node:child_process";
import { exportJWK, exportPKCS8, generateKeyPair } from "jose";

const { publicKey, privateKey } = await generateKeyPair("RS256", {
  extractable: true,
});

// jose's importPKCS8 strips all whitespace, so a single-line PEM is fine and
// avoids multi-line env-var quoting issues.
const jwtPrivateKey = (await exportPKCS8(privateKey)).replace(/\n/g, " ").trim();
const jwks = JSON.stringify({
  keys: [{ use: "sig", ...(await exportJWK(publicKey)) }],
});

execFileSync(
  "npx",
  ["convex", "env", "set", "--", "JWT_PRIVATE_KEY", jwtPrivateKey],
  { stdio: "inherit" },
);
execFileSync("npx", ["convex", "env", "set", "--", "JWKS", jwks], {
  stdio: "inherit",
});

console.log("Auth keys set on the configured Convex deployment.");
