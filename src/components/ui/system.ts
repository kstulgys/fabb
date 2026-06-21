import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";

/**
 * The app's Chakra system: the stock `defaultConfig` with one override — the
 * `body` and `heading` font tokens point at the Inter web font that `next/font`
 * loads and exposes as the `--font-inter` CSS variable on `<html>` (see
 * `app/layout.tsx`), keeping Chakra's own system-sans fallback after it.
 *
 * DESIGN.md mandates "Inter throughout", and Chakra's default token already
 * *names* Inter — but no Inter is ever delivered to the browser, so on any
 * device without Inter installed locally the app silently renders in whatever
 * sans the OS happens to have. Wiring the self-hosted web font here makes the
 * intended typography real and identical on every device.
 */
const fallback =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"';

export const system = createSystem(
  defaultConfig,
  defineConfig({
    theme: {
      tokens: {
        fonts: {
          heading: { value: `var(--font-inter), ${fallback}` },
          body: { value: `var(--font-inter), ${fallback}` },
        },
      },
    },
  }),
);
