# shadcn on Base UI replaces Chakra UI

The app's UI is built from shadcn components on the **Base UI** primitive base
(`@base-ui/react`), vendored into `src/components/ui` with the shadcn CLI
(`components.json` committed) and styled with Tailwind CSS v4 — replacing
Chakra UI v3, `@chakra-ui/charts`, and Emotion. The owner asked for Base UI by
name; vendored components mean the app owns its controls' markup and there is no
runtime theme provider.

## Considered Options

- **shadcn on Radix** (the default registry): wider third-party coverage — most
  notably the vaul-based Drawer, a swipe-to-dismiss bottom sheet — but it pulls
  in the Radix family and is not what was asked for. Consequence of refusing it:
  the mobile bottom sheet (`SheetDialog`) stays the app's own wrapper over the
  Base UI Dialog, without swipe-to-dismiss. Do not "fix" it by adding vaul.

## Consequences

- Layout is plain elements with Tailwind utilities; there is deliberately no
  local Stack/Flex/Text kit re-creating Chakra's style props.
- Tailwind runs through one `postcss.config.mjs` (`@tailwindcss/postcss`),
  read by both `next` and vinext's PostCSS plugin, so both builds see the same CSS.
