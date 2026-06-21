"use client";

import { Button, Dialog, Stack, Text } from "@chakra-ui/react";
import { SheetDialog } from "./dashboard/sheet-dialog";

export function DisclaimerDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <SheetDialog open={open} onClose={onClose}>
      <Dialog.Header>
        <Dialog.Title>About fabb</Dialog.Title>
      </Dialog.Header>
      <Dialog.Body>
        <Stack gap="3">
          <Text>
            fabb is an unofficial helper for the Fabijoniškės pool&apos;s public
            booking site. It is not affiliated with or endorsed by the pool.
          </Text>
          <Text color="fg.muted">
            It works by reading and submitting to the pool&apos;s website on your
            behalf, so it can stop working at any time if the pool changes its
            website or how it works. Treat a booking as confirmed only when the
            pool emails you.
          </Text>
        </Stack>
      </Dialog.Body>
      <Dialog.Footer>
        <Button onClick={onClose}>Got it</Button>
      </Dialog.Footer>
    </SheetDialog>
  );
}
