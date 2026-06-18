"use client";

import { Center, Spinner } from "@chakra-ui/react";
import { useConvexAuth } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { ReactNode } from "react";

/**
 * Gates a route on authentication. While auth state is loading it shows a
 * spinner; an unauthenticated visitor is redirected to the sign-in page and
 * never sees the protected content.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/signin");
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <Center minH="100dvh">
        <Spinner size="lg" />
      </Center>
    );
  }

  return <>{children}</>;
}
