"use client";

import { Box, Button, chakra, Heading, Input, Stack, Text } from "@chakra-ui/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";

/**
 * Passwordless sign-in. The User enters their email and receives a one-time
 * magic link; clicking it lands back on the app (via `SITE_URL`) already signed
 * in. The same flow signs up a first-time email and signs in a returning one —
 * there is no password. Once the link is sent we show a "check your email"
 * confirmation rather than waiting on this screen.
 */
export function AuthForm() {
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn("resend", { email });
      setSent(true);
    } catch {
      setError("Couldn't send the sign-in link — check the email and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <Box maxW="sm" w="full" p="8" borderWidth="1px" borderRadius="xl">
        <Heading size="lg">Check your email</Heading>
        <Text color="fg.muted" mt="2">
          We sent a one-time sign-in link to{" "}
          <chakra.span fontWeight="medium" color="fg">
            {email}
          </chakra.span>
          . Open it on this device to finish signing in — the link expires
          shortly.
        </Text>
        <Button
          mt="6"
          variant="outline"
          colorPalette="teal"
          onClick={() => {
            setSent(false);
            setError(null);
          }}
        >
          Use a different email
        </Button>
      </Box>
    );
  }

  return (
    <Box maxW="sm" w="full" p="8" borderWidth="1px" borderRadius="xl">
      <Heading size="lg">Sign in</Heading>
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

          {error ? (
            <Text color="red.500" fontSize="sm">
              {error}
            </Text>
          ) : null}

          <Button type="submit" colorPalette="teal" loading={submitting}>
            Send sign-in link
          </Button>
        </Stack>
      </form>

      <Text mt="6" fontSize="sm" textAlign="center" color="fg.muted">
        No password — we email you a one-time link.
      </Text>
    </Box>
  );
}
