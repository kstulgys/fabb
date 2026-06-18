"use client";

import { Button, Container, Heading, Stack, Text } from "@chakra-ui/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { RequireAuth } from "../require-auth";
import { WeekCalendar } from "./week-calendar";

function Dashboard() {
  const { signOut } = useAuthActions();
  const user = useQuery(api.users.currentUser);

  return (
    <Container maxW="3xl" py="10">
      <Stack gap="6">
        <Stack direction="row" justify="space-between" align="center">
          <Heading size="xl">Dashboard</Heading>
          <Button variant="outline" onClick={() => void signOut()}>
            Sign out
          </Button>
        </Stack>

        <Text color="fg.muted" fontSize="sm">
          Signed in as{" "}
          <Text as="span" fontWeight="medium">
            {user?.email ?? "…"}
          </Text>
        </Text>

        <WeekCalendar />
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
