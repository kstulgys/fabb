// Builds the app for Cloudflare Workers with vinext (the Vite implementation of
// the Next.js API): `bun run build:worker` writes dist/, which
// .github/workflows/web-*.yml deploy with wrangler (see wrangler.jsonc).
// `next dev` / `next build` stay as they were for local development.
import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [
    vinext(),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
});
