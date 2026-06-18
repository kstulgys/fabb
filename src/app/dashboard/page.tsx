"use client";

import { Box, Button, Container, Heading, Stack, Text } from "@chakra-ui/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { RequireAuth } from "../require-auth";

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

        <Box borderWidth="1px" borderRadius="xl" p="6">
          <Text>
            Signed in as <Text as="span" fontWeight="semibold">{user?.email ?? "…"}</Text>.
          </Text>
          <Text color="fg.muted" mt="2">
            Your pool classes, auto-book rules and training log will appear here.
          </Text>
        </Box>
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
