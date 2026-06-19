"use client";

import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { ColorModeProvider, type ColorModeProviderProps } from "./color-mode";

/**
 * Chakra UI provider paired with the color-mode provider. Uses the stock
 * `defaultSystem` (no custom theme) so every semantic token — `bg`, `fg`,
 * `border`, the status tokens, and each `colorPalette` slot — is the Chakra
 * default and adapts to light/dark automatically.
 */
export function Provider(props: ColorModeProviderProps) {
  return (
    <ChakraProvider value={defaultSystem}>
      <ColorModeProvider {...props} />
    </ChakraProvider>
  );
}
