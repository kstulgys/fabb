"use client";

import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * App-wide client providers. The whole tree renders inside the Convex auth
 * client provider (so `useQuery` / `useAuthActions` work and requests carry the
 * auth token) and Chakra UI's provider (so the theme is applied everywhere).
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ConvexAuthProvider client={convex}>
      <ChakraProvider value={defaultSystem}>{children}</ChakraProvider>
    </ConvexAuthProvider>
  );
}
