import { exportJWK, exportPKCS8, generateKeyPair } from "jose";

// Convex Auth's `signIn` action signs a JWT with `JWT_PRIVATE_KEY` and uses
// `CONVEX_SITE_URL` as the issuer. Provide ephemeral test keys + URLs so the
// real sign-up / sign-in flow runs end-to-end under `convex-test` with no
// network and no dependency on the live deployment's secrets.
const { privateKey, publicKey } = await generateKeyPair("RS256", {
  extractable: true,
});

process.env.JWT_PRIVATE_KEY = await exportPKCS8(privateKey);
process.env.JWKS = JSON.stringify({
  keys: [{ use: "sig", ...(await exportJWK(publicKey)) }],
});
process.env.CONVEX_SITE_URL ??= "https://test-fabb.convex.site";
process.env.SITE_URL ??= "http://localhost:3000";
