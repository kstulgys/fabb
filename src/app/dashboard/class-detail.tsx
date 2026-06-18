"use client";

import {
  Badge,
  Box,
  Button,
  Dialog,
  Flex,
  Heading,
  Portal,
  Spinner,
  Stack,
  Text,
} from "@chakra-ui/react";
import { useAction } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import type { Availability } from "../../../convex/pool/parse";
import { type ClassStatus, classStatus } from "../../../convex/week";

const STATUS_META: Record<
  ClassStatus,
  { label: string; palette: string }
> = {
  finished: { label: "Finished", palette: "gray" },
  "in-progress": { label: "In progress", palette: "green" },
  upcoming: { label: "Upcoming", palette: "blue" },
};

/** A coloured pill for a class's {@link ClassStatus}. Shared by the calendar
 * row and the detail dialog so the marking is identical in both places. */
export function StatusBadge({ status }: { status: ClassStatus }) {
  const meta = STATUS_META[status];
  return (
    <Badge colorPalette={meta.palette} variant="subtle">
      {meta.label}
    </Badge>
  );
}

const formatTime = (cls: Doc<"classes">) =>
  cls.endTime && cls.endTime !== cls.startTime
    ? `${cls.startTime}–${cls.endTime}`
    : cls.startTime;

type LiveState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; data: Availability };

/** The live free-spot block. Owns its own fetch so it (re)runs whenever the
 * dialog opens a class — availability is volatile and never cached (ADR-0002). */
function LiveSpots({ cls }: { cls: Doc<"classes"> }) {
  const fetchAvailability = useAction(api.pool.availability.liveAvailability);
  const [state, setState] = useState<LiveState>({ kind: "loading" });
  const [reloadAt, setReloadAt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    fetchAvailability({ pid: cls.pid, date: cls.date })
      .then((data) => {
        if (!cancelled) setState({ kind: "ready", data });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [fetchAvailability, cls.pid, cls.date, reloadAt]);

  if (state.kind === "loading") {
    return (
      <Flex align="center" gap="2" color="fg.muted">
        <Spinner size="sm" />
        <Text fontSize="sm">Loading live availability…</Text>
      </Flex>
    );
  }

  if (state.kind === "error") {
    return (
      <Stack gap="2" align="flex-start">
        <Text fontSize="sm" color="red.500">
          Couldn't load live availability.
        </Text>
        <Button
          size="xs"
          variant="outline"
          onClick={() => setReloadAt((n) => n + 1)}
        >
          Retry
        </Button>
      </Stack>
    );
  }

  const { free, max, registered } = state.data;
  const headline =
    free != null && max != null
      ? `${free} / ${max}`
      : free != null
        ? `${free}`
        : "—";

  return (
    <Stack gap="1">
      <Flex align="baseline" gap="2">
        <Heading size="lg">{headline}</Heading>
        <Text color="fg.muted">spots free</Text>
      </Flex>
      <Text fontSize="sm" color="fg.muted">
        {registered != null ? `${registered} registered` : "Registrations —"}
        {max != null ? ` · ${max} max` : ""}
      </Text>
    </Stack>
  );
}

/** A read-only labelled fact in the detail grid. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Text fontSize="xs" color="fg.muted" textTransform="uppercase">
        {label}
      </Text>
      <Text>{value}</Text>
    </Box>
  );
}

/**
 * Class detail modal: stable schedule info + the LIVE free-spot count + the
 * class's status (finished / in-progress / upcoming for today). A finished class
 * is marked and exposes no book affordance — Task 6 gates booking on
 * {@link classStatus}'s `bookable` flag.
 *
 * Rendered controlled: `cls` non-null opens it; the inner body is mounted only
 * while open, so the live fetch re-runs on every open.
 */
export function ClassDetailDialog({
  cls,
  now,
  onClose,
}: {
  cls: Doc<"classes"> | null;
  now: Date;
  onClose: () => void;
}) {
  return (
    <Dialog.Root
      open={cls !== null}
      onOpenChange={(e) => {
        if (!e.open) onClose();
      }}
      placement="center"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>{cls && <DetailContent cls={cls} now={now} onClose={onClose} />}</Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

function DetailContent({
  cls,
  now,
  onClose,
}: {
  cls: Doc<"classes">;
  now: Date;
  onClose: () => void;
}) {
  const { status, bookable } = classStatus(cls, now);
  const kcal =
    cls.kcalMin != null && cls.kcalMax != null
      ? `${cls.kcalMin}–${cls.kcalMax} kcal`
      : "—";
  const duration = cls.durationMin != null ? `${cls.durationMin} min` : "—";
  const hearts = cls.intensity > 0 ? "❤".repeat(cls.intensity) : "—";

  return (
    <>
      <Dialog.Header>
        <Stack gap="2">
          <Dialog.Title>{cls.name}</Dialog.Title>
          <Flex gap="2" align="center">
            <Badge variant="subtle">{formatTime(cls)}</Badge>
            <StatusBadge status={status} />
          </Flex>
        </Stack>
      </Dialog.Header>

      <Dialog.Body>
        <Stack gap="5">
          <Box>
            <Text
              fontSize="xs"
              color="fg.muted"
              textTransform="uppercase"
              mb="1"
            >
              Live availability
            </Text>
            <LiveSpots cls={cls} />
          </Box>

          <Flex gap="6" wrap="wrap">
            <Fact label="Date" value={cls.date} />
            <Fact label="Duration" value={duration} />
            <Fact label="Calories" value={kcal} />
            <Box>
              <Text fontSize="xs" color="fg.muted" textTransform="uppercase">
                Intensity
              </Text>
              <Text color="red.500">{hearts}</Text>
            </Box>
          </Flex>
        </Stack>
      </Dialog.Body>

      <Dialog.Footer justifyContent="space-between" gap="3">
        {bookable ? (
          <Stack gap="1" align="flex-start">
            <Button disabled>Book</Button>
            <Text fontSize="xs" color="fg.muted">
              Booking arrives in a later update.
            </Text>
          </Stack>
        ) : (
          <Text fontSize="sm" color="fg.muted">
            This class has finished — it can no longer be booked.
          </Text>
        )}
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </Dialog.Footer>
    </>
  );
}
