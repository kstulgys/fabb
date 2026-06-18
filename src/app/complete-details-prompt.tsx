"use client";

import { Box, Button, Stack, Text } from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { POOL_DETAILS_INCOMPLETE_MESSAGE } from "../../convex/poolDetails";

/**
 * The reusable "complete your details" affordance.
 *
 * Booking entry points (Tasks 6/7/8) render this in place of the booking
 * control when the User's Pool details are incomplete. It is the UI twin of the
 * server-side booking gate (`requirePoolDetails` / `requirePoolDetailsForAction`
 * in `convex/users.ts`): the server is the hard stop, this gives the User a
 * clear way to fix it. The button links to the settings screen, which hosts the
 * Pool details form.
 */
export function CompleteDetailsPrompt({ message }: { message?: string }) {
  const router = useRouter();
  return (
    <Box
      borderWidth="1px"
      borderRadius="lg"
      p="4"
      bg="orange.50"
      borderColor="orange.200"
    >
      <Stack gap="3">
        <Text fontWeight="medium">{message ?? POOL_DETAILS_INCOMPLETE_MESSAGE}</Text>
        <Button
          colorPalette="teal"
          size="sm"
          alignSelf="flex-start"
          onClick={() => router.push("/settings")}
        >
          Complete details
        </Button>
      </Stack>
    </Box>
  );
}
