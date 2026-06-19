"use client";

import { Alert, Button } from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { POOL_DETAILS_INCOMPLETE_MESSAGE } from "../../convex/poolDetails";

/**
 * The reusable "complete your details" affordance.
 *
 * Booking entry points render this in place of the booking control when the
 * User's Pool details are incomplete. It is the UI twin of the server-side
 * booking gate (`requirePoolDetails` / `requirePoolDetailsForAction` in
 * `convex/poolDetailsOps.ts`): the server is the hard stop, this gives the User
 * a clear way to fix it. The button links to the settings screen, which hosts
 * the Pool details form. Rendered as a warning Alert; the button inherits the
 * Alert's `warning` palette so it stays theme-aware in light and dark.
 */
export function CompleteDetailsPrompt({ message }: { message?: string }) {
  const router = useRouter();
  return (
    <Alert.Root status="warning">
      <Alert.Indicator />
      <Alert.Content gap="3">
        <Alert.Description>
          {message ?? POOL_DETAILS_INCOMPLETE_MESSAGE}
        </Alert.Description>
        <Button
          size="sm"
          alignSelf="flex-start"
          onClick={() => router.push("/settings")}
        >
          Complete details
        </Button>
      </Alert.Content>
    </Alert.Root>
  );
}
