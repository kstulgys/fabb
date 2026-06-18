/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";

// Convex functions are tested with `convex-test` in the edge runtime, matching
// the Convex backend runtime. Tests live next to the functions in `convex/`.
export default defineConfig({
  test: {
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
    include: ["convex/**/*.test.ts"],
    setupFiles: ["./convex/test.setup.ts"],
  },
});
