"use client";

import { Box, Button, chakra, Heading, Input, Stack, Text } from "@chakra-ui/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Flow = "signIn" | "signUp";

/**
 * Email + password sign-in / sign-up form. The same form toggles between the
 * two flows; on success the User lands on the dashboard.
 */
export function AuthForm() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const [flow, setFlow] = useState<Flow>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn("password", { email, password, flow });
      router.replace("/dashboard");
    } catch {
      setError(
        flow === "signUp"
          ? "Could not create the account. Use a valid email and a password of at least 8 characters."
          : "Wrong email or password.",
      );
      setSubmitting(false);
    }
  };

  return (
    <Box maxW="sm" w="full" p="8" borderWidth="1px" borderRadius="xl">
      <Heading size="lg">{flow === "signIn" ? "Sign in" : "Create account"}</Heading>
      <Text color="fg.muted" mt="1" mb="6">
        Fabijoniškės pool class tracker
      </Text>

      <form onSubmit={handleSubmit}>
        <Stack gap="4">
          <Stack gap="1">
            <chakra.label htmlFor="email" fontSize="sm" fontWeight="medium">
              Email
            </chakra.label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Stack>

          <Stack gap="1">
            <chakra.label htmlFor="password" fontSize="sm" fontWeight="medium">
              Password
            </chakra.label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={flow === "signIn" ? "current-password" : "new-password"}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Stack>

          {error ? (
            <Text color="red.500" fontSize="sm">
              {error}
            </Text>
          ) : null}

          <Button type="submit" colorPalette="teal" loading={submitting}>
            {flow === "signIn" ? "Sign in" : "Sign up"}
          </Button>
        </Stack>
      </form>

      <Text mt="6" fontSize="sm" textAlign="center" color="fg.muted">
        {flow === "signIn" ? "New here?" : "Already have an account?"}{" "}
        <Button
          type="button"
          variant="plain"
          colorPalette="teal"
          size="sm"
          height="auto"
          padding="0"
          onClick={() => {
            setError(null);
            setFlow(flow === "signIn" ? "signUp" : "signIn");
          }}
        >
          {flow === "signIn" ? "Create one" : "Sign in"}
        </Button>
      </Text>
    </Box>
  );
}
