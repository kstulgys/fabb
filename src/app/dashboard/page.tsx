"use client";

import { Button, Container, Heading, Stack, Text } from "@chakra-ui/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "../../../convex/_generated/api";
import { PoolDetailsForm } from "../pool-details-form";
import { RequireAuth } from "../require-auth";
import { AutoBookRules } from "./auto-book-rules";
import { Stats } from "./stats";
import { TrainingLog } from "./training-log";
import { WeekCalendar } from "./week-calendar";

function Dashboard() {
  const { signOut } = useAuthActions();
  const user = useQuery(api.users.currentUser);
  const router = useRouter();

  return (
    <Container maxW="3xl" py="10">
      <Stack gap="6">
        <Stack direction="row" justify="space-between" align="center">
          <Heading size="xl">Dashboard</Heading>
          <Stack direction="row" gap="2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/settings")}
            >
              Pool details
            </Button>
            <Button variant="outline" onClick={() => void signOut()}>
              Sign out
            </Button>
          </Stack>
        </Stack>

        <Text color="fg.muted" fontSize="sm">
          Signed in as{" "}
          <Text as="span" fontWeight="medium">
            {user?.email ?? "…"}
          </Text>
        </Text>

        {user && !user.detailsComplete ? (
          <PoolDetailsForm
            heading="Complete your pool details"
            description="We submit these four fields to the pool on every booking. You can edit them later in settings."
            submitLabel="Save and continue"
          />
        ) : (
          <Stack gap="10">
            <WeekCalendar />
            <AutoBookRules />
            <TrainingLog />
            <Stats />
          </Stack>
        )}
      </Stack>
    </Container>
  );
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <Dashboard />
    </RequireAuth>
  );
}
