"use client";

import { Center } from "@chakra-ui/react";
import { useConvexAuth } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
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

  return (
    <Center minH="100dvh" p="4">
      <AuthForm />
    </Center>
  );
}
