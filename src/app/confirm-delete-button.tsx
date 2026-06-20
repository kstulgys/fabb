"use client";

import {
  Button,
  Flex,
  IconButton,
  Popover,
  Portal,
  Stack,
  Text,
} from "@chakra-ui/react";
import { type ReactNode, useState } from "react";
import { LuTrash2 } from "react-icons/lu";

/**
 * A delete control guarded by a confirmation popover, so a destructive action —
 * removing an AutoBook rule or a Training log — is never a single accidental
 * tap. The popover names what will be removed and runs {@link onConfirm} only on
 * the explicit confirm; `busy` disables the trigger while the delete is in
 * flight. Shared by every delete-a-row surface so the guard reads and behaves
 * identically everywhere (Error Prevention: there is no in-app undo, so the
 * confirm is the safety net).
 */
export function ConfirmDeleteButton({
  label,
  title,
  description,
  confirmLabel = "Delete",
  size = "sm",
  busy = false,
  onConfirm,
}: {
  /** Accessible name of the trigger, e.g. "Delete rule". */
  label: string;
  /** Popover heading, e.g. "Delete this rule?". */
  title: string;
  /** Names the specific item being removed. */
  description: ReactNode;
  confirmLabel?: string;
  size?: "xs" | "sm" | "md";
  busy?: boolean;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root
      open={open}
      onOpenChange={(e) => setOpen(e.open)}
      positioning={{ placement: "bottom-end" }}
    >
      <Popover.Trigger asChild>
        <IconButton
          aria-label={label}
          size={size}
          variant="ghost"
          colorPalette="red"
          disabled={busy}
        >
          <LuTrash2 />
        </IconButton>
      </Popover.Trigger>
      <Portal>
        <Popover.Positioner>
          <Popover.Content colorPalette="gray" maxW="xs">
            <Popover.Arrow>
              <Popover.ArrowTip />
            </Popover.Arrow>
            <Popover.Body>
              <Stack gap="3">
                <Stack gap="1">
                  <Popover.Title fontWeight="semibold">{title}</Popover.Title>
                  <Text fontSize="sm" color="fg.muted">
                    {description}
                  </Text>
                </Stack>
                <Flex gap="2" justify="flex-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    colorPalette="gray"
                    onClick={() => setOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    colorPalette="red"
                    onClick={() => {
                      setOpen(false);
                      onConfirm();
                    }}
                  >
                    {confirmLabel}
                  </Button>
                </Flex>
              </Stack>
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}
