"use client";

import { Center, Flex, Spinner } from "@chakra-ui/react";
import { useConvexAuth } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AppShell } from "../app-shell";
import { AuthForm } from "../auth-form";

export default function SignInPage() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const router = useRouter();

  // An already signed-in User shouldn't sit on the sign-in screen.
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [isLoading, isAuthenticated, router]);

  // While auth is resolving — or already signed in and about to redirect —
  // show a spinner rather than flashing the form to an authenticated visitor.
  if (isLoading || isAuthenticated) {
    return (
      <Center minH="100dvh">
        <Spinner size="lg" />
      </Center>
    );
  }

  return (
    <AppShell maxW="md">
      <Flex justify="center" pt={{ base: "8", md: "16" }}>
        <AuthForm />
      </Flex>
    </AppShell>
  );
}
