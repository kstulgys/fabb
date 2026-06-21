import { Dialog, Portal } from "@chakra-ui/react";
import type { ReactNode } from "react";

/**
 * Shared modal chrome for the dashboard's dialogs.
 *
 * On phones it is a **bottom sheet**: it hugs its content, sits flush against
 * the bottom edge with a rounded top, and slides up — so a short form never
 * floats in a full-screen void and its actions stay thumb-reachable. On desktop
 * (`md+`) it is a normal centered dialog. Tall content (e.g. the class detail)
 * scrolls inside via `scrollBehavior="inside"` rather than growing the sheet.
 *
 * The teal accent is re-established on the content because the Portal escapes
 * the AppShell's `colorPalette="teal"` root.
 */
export function SheetDialog({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(e) => {
        if (!e.open) onClose();
      }}
      scrollBehavior="inside"
      motionPreset="slide-in-bottom"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner alignItems={{ base: "flex-end", md: "center" }}>
          <Dialog.Content
            colorPalette="teal"
            w="full"
            maxW={{ base: "full", md: "2xl" }}
            mx="auto"
            my={{ base: "0", md: "auto" }}
            borderTopRadius="l3"
            borderBottomRadius={{ base: "0", md: "l3" }}
          >
            {children}
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
