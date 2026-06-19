"use client";

import { Button, Container, Heading, Stack } from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { PoolDetailsForm } from "../pool-details-form";
import { RequireAuth } from "../require-auth";

function Settings() {
  const router = useRouter();
  return (
    <Container maxW="lg" py="10">
      <Stack gap="6">
        <Stack direction="row" justify="space-between" align="center">
          <Heading size="xl">Settings</Heading>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/dashboard")}
          >
            Back to dashboard
          </Button>
        </Stack>

        <PoolDetailsForm
          heading="Pool details"
          description="Your name, surname, and phone are submitted to the pool on every booking, along with your account email — the pool keys your bookings off that email."
          submitLabel="Save details"
        />
      </Stack>
    </Container>
  );
}

export default function SettingsPage() {
  return (
    <RequireAuth>
      <Settings />
    </RequireAuth>
  );
}
