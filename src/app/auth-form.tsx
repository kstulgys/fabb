"use client";

import {
  Alert,
  Button,
  Card,
  Field,
  Icon,
  Input,
  Stack,
  Text,
} from "@chakra-ui/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import { LuMailCheck } from "react-icons/lu";

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
      <Card.Root variant="elevated" maxW="sm" w="full">
        <Card.Body gap="5">
          <Icon size="2xl" color="colorPalette.fg">
            <LuMailCheck />
          </Icon>
          <Stack gap="1">
            <Card.Title>Check your email</Card.Title>
            <Card.Description>
              We sent a one-time sign-in link to{" "}
              <Text as="span" fontWeight="medium" color="fg">
                {email}
              </Text>
              . Open it on this device to finish signing in — the link expires
              shortly.
            </Card.Description>
          </Stack>
          <Button
            variant="outline"
            w="full"
            onClick={() => {
              setSent(false);
              setError(null);
            }}
          >
            Use a different email
          </Button>
        </Card.Body>
      </Card.Root>
    );
  }

  return (
    <Card.Root variant="elevated" maxW="sm" w="full">
      <Card.Body gap="5">
        <Stack gap="1">
          <Card.Title>Sign in</Card.Title>
          <Card.Description>Fabijoniškės pool class tracker</Card.Description>
        </Stack>

        <form onSubmit={handleSubmit}>
          <Stack gap="4">
            <Field.Root id="email" required>
              <Field.Label>Email</Field.Label>
              <Input
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field.Root>

            {error ? (
              <Alert.Root status="error">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Description>{error}</Alert.Description>
                </Alert.Content>
              </Alert.Root>
            ) : null}

            <Button type="submit" disabled={submitting} w="full">
              Send sign-in link
            </Button>
          </Stack>
        </form>

        <Text fontSize="sm" color="fg.muted" textAlign="center">
          No password — we email you a one-time link.
        </Text>
      </Card.Body>
    </Card.Root>
  );
}
