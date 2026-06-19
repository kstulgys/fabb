"use client";

import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";
import { Provider as ChakraProvider } from "@/components/ui/provider";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * App-wide client providers. The whole tree renders inside the Convex auth
 * client provider (so `useQuery` / `useAuthActions` work and requests carry the
 * auth token) and Chakra UI's provider, which now also carries color-mode
 * (light/dark) support via `next-themes`.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ConvexAuthProvider client={convex}>
      <ChakraProvider>{children}</ChakraProvider>
    </ConvexAuthProvider>
  );
}
