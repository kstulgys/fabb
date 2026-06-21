"use client";

import { ChakraProvider } from "@chakra-ui/react";
import { ColorModeProvider, type ColorModeProviderProps } from "./color-mode";
import { system } from "./system";

/**
 * Chakra UI provider paired with the color-mode provider. Uses {@link system}
 * — the stock Chakra config with the `body`/`heading` font tokens pointed at
 * the Inter web font — so every other semantic token (`bg`, `fg`, `border`, the
 * status tokens, each `colorPalette` slot) stays the Chakra default and adapts
 * to light/dark automatically.
 */
export function Provider(props: ColorModeProviderProps) {
  return (
    <ChakraProvider value={system}>
      <ColorModeProvider {...props} />
    </ChakraProvider>
  );
}
