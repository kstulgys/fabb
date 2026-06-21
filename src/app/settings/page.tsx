"use client";

import { Button, Heading, Stack } from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { LuArrowLeft } from "react-icons/lu";
import { AppShell } from "../app-shell";
import { PoolDetailsForm } from "../pool-details-form";
import { RequireAuth } from "../require-auth";

function Settings() {
  const router = useRouter();
  return (
    <AppShell
      actions={
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/dashboard")}
        >
          <LuArrowLeft />
          Dashboard
        </Button>
      }
    >
      <Stack gap="6" maxW="lg">
        <Heading size="xl">Settings</Heading>
        <PoolDetailsForm
          heading="Pool details"
          description="Your name, surname, and phone are submitted to the pool on every booking, along with your account email — the pool keys your bookings off that email."
          submitLabel="Save details"
        />
      </Stack>
    </AppShell>
  );
}

export default function SettingsPage() {
  return (
    <RequireAuth>
      <Settings />
    </RequireAuth>
  );
}
