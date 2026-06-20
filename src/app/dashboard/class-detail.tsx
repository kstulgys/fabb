"use client";

import {
  Alert,
  Badge,
  Button,
  Card,
  CloseButton,
  DataList,
  Dialog,
  HStack,
  Portal,
  Span,
  Spinner,
  Stack,
  Stat,
  Text,
} from "@chakra-ui/react";
import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { type BookingStatus, isHeld } from "../../../convex/bookingStatus";
import { format, fromColumns } from "../../../convex/calories";
import type { Availability } from "../../../convex/pool/parse";
import {
  type ClassStatus,
  classStatus,
  isoWeekday,
  weekdayLabel,
} from "../../../convex/week";
import { CompleteDetailsPrompt } from "../complete-details-prompt";
import { Intensity } from "./intensity";

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
    // Reset to loading on every (re)open and manual retry so the spinner shows
    // while the volatile availability is refetched (ADR-0002, never cached).
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
      <HStack gap="2" color="fg.muted">
        <Spinner size="sm" />
        <Text fontSize="sm">Checking live availability…</Text>
      </HStack>
    );
  }

  if (state.kind === "error") {
    return (
      <Alert.Root status="error">
        <Alert.Indicator />
        <Alert.Content alignItems="flex-start" gap="2">
          <Alert.Title>Couldn&apos;t load live availability</Alert.Title>
          <Button
            size="xs"
            variant="outline"
            colorPalette="gray"
            onClick={() => setReloadAt((n) => n + 1)}
          >
            Retry
          </Button>
        </Alert.Content>
      </Alert.Root>
    );
  }

  const { free, max, registered } = state.data;
  const hasCount = free != null || max != null;
  const headline =
    free != null && max != null
      ? `${free} / ${max}`
      : free != null
        ? `${free}`
        : "—";
  const help =
    (registered != null ? `${registered} registered` : "Registrations —") +
    (max != null ? ` · ${max} max` : "");

  return (
    <Card.Root variant="subtle">
      <Card.Body>
        <Stat.Root>
          <Stat.Label>Live availability</Stat.Label>
          <Stat.ValueText>
            {headline}
            {hasCount && (
              <Span ms="2" fontSize="sm" fontWeight="medium" color="fg.muted">
                spots free
              </Span>
            )}
          </Stat.ValueText>
          <Stat.HelpText>{help}</Stat.HelpText>
        </Stat.Root>
      </Card.Body>
    </Card.Root>
  );
}

type BookState =
  | { kind: "idle" }
  | { kind: "booking" }
  | { kind: "done"; status: BookingStatus }
  | { kind: "failed"; message: string };

/** How each booking outcome reads to the User. `error` is surfaced as a
 * failure, NEVER as success. */
const RESULT_META: Record<BookingStatus, { palette: string; text: string }> = {
  registered: {
    palette: "green",
    text: "Booked! The pool will email your confirmation — it carries the only working cancel link.",
  },
  already: {
    palette: "blue",
    text: "You're already registered. The pool emailed your confirmation and the only cancel link.",
  },
  full: {
    palette: "orange",
    text: "This class is full — no spot was booked.",
  },
  error: {
    palette: "red",
    text: "Booking didn't go through — no spot was reserved. Please try again.",
  },
};

type AlertStatus = "success" | "info" | "warning" | "error";

/** Maps a booking-outcome palette to the matching Alert status, preserving the
 * truthful semantics (ADR-0001): green→success, blue→info, orange→warning,
 * red→error — so an `error` outcome surfaces as a failure, never as success. */
function alertStatus(palette: string): AlertStatus {
  switch (palette) {
    case "green":
      return "success";
    case "orange":
      return "warning";
    case "red":
      return "error";
    default:
      return "info";
  }
}

/**
 * The "Book now" control plus truthful outcome feedback.
 *
 * Calls {@link api.book.bookNow} and reports honestly: a success, an
 * already-registered class, and a full class are distinguished, and an `error`
 * (whether returned or thrown) is NEVER dressed up as success. A standing note
 * states (ADR-0001) that the pool's confirmation email carries the only working
 * cancel link — the app has no cancellation. Re-booking is blocked only once a
 * spot is held (registered / already); full and error stay retryable.
 */
function BookNow({ cls }: { cls: Doc<"classes"> }) {
  const book = useAction(api.book.bookNow);
  const [state, setState] = useState<BookState>({ kind: "idle" });

  const onBook = () => {
    setState({ kind: "booking" });
    book({ pid: cls.pid, date: cls.date })
      .then((status) => setState({ kind: "done", status }))
      .catch((err) =>
        setState({
          kind: "failed",
          message:
            err instanceof Error ? err.message : "Booking failed. Please try again.",
        }),
      );
  };

  const outcome =
    state.kind === "done"
      ? RESULT_META[state.status]
      : state.kind === "failed"
        ? { palette: "red", text: state.message }
        : null;
  const held = state.kind === "done" && isHeld(state.status);

  return (
    <Stack gap="3">
      <Button
        loading={state.kind === "booking"}
        loadingText="Booking…"
        disabled={held}
        onClick={onBook}
        w={{ base: "full", sm: "auto" }}
      >
        Book now
      </Button>
      {outcome && (
        <Alert.Root status={alertStatus(outcome.palette)}>
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{outcome.text}</Alert.Description>
          </Alert.Content>
        </Alert.Root>
      )}
      <Text fontSize="xs" color="fg.muted">
        The pool emails a confirmation with the only working cancel link —
        bookings can&apos;t be cancelled in the app.
      </Text>
    </Stack>
  );
}

type AutoBookState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "done" }
  | { kind: "failed"; message: string };

/**
 * The "Auto-book weekly" control: turns this class into a standing AutoBook rule
 * (issue 07). Unlike "Book now" it is offered regardless of THIS instance's
 * status — a rule is about future weeks. Gated on Pool details with the shared
 * {@link CompleteDetailsPrompt} so the UX matches the booking gate: a rule with
 * no details could never book. States plainly (ADR-0001) that disabling or
 * deleting a rule never cancels a Booking already placed.
 */
function AutoBookWeekly({ cls }: { cls: Doc<"classes"> }) {
  const details = useQuery(api.poolDetailsOps.myPoolDetails);
  const createRule = useMutation(api.autoBookRules.createFromClass);
  const [state, setState] = useState<AutoBookState>({ kind: "idle" });

  if (details === undefined) {
    return <Spinner size="sm" />;
  }
  if (!details.detailsComplete) {
    return (
      <CompleteDetailsPrompt message="Complete your pool details to set up auto-booking — a rule with no details can never book." />
    );
  }

  const weekday = weekdayLabel(isoWeekday(cls.date));
  const onCreate = () => {
    setState({ kind: "saving" });
    createRule({ pid: cls.pid, date: cls.date })
      .then(() => setState({ kind: "done" }))
      .catch((err) =>
        setState({
          kind: "failed",
          message:
            err instanceof Error ? err.message : "Couldn't set up auto-booking.",
        }),
      );
  };

  return (
    <Stack gap="3">
      <Button
        variant="outline"
        loading={state.kind === "saving"}
        loadingText="Setting up…"
        disabled={state.kind === "done"}
        onClick={onCreate}
        w={{ base: "full", sm: "auto" }}
      >
        Auto-book weekly
      </Button>
      {state.kind === "done" && (
        <Alert.Root status="success">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>
              Weekly auto-book set: every {weekday} at {cls.startTime} for “
              {cls.name}”. Manage it under Auto-book rules below.
            </Alert.Description>
          </Alert.Content>
        </Alert.Root>
      )}
      {state.kind === "failed" && (
        <Alert.Root status="error">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{state.message}</Alert.Description>
          </Alert.Content>
        </Alert.Root>
      )}
      <Text fontSize="xs" color="fg.muted">
        Books “{cls.name}” every {weekday} at {cls.startTime} from next week
        on — disabling or deleting the rule only stops future bookings.
      </Text>
    </Stack>
  );
}

/**
 * Class detail modal: stable schedule info + the LIVE free-spot count + the
 * class's status (finished / in-progress / upcoming for today). A bookable
 * class shows "Book now"; a finished one is marked and offers no booking —
 * booking is gated on {@link classStatus}'s `bookable` flag.
 *
 * Rendered controlled: `cls` non-null opens it; the inner body is mounted only
 * while open, so the live fetch re-runs on every open. On phones it is a
 * full-screen sheet (`size="full"` + slide-in-bottom); on desktop a centered
 * dialog. The teal accent is re-established on the content because the Portal
 * escapes the AppShell's `colorPalette="teal"` root.
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
      size={{ base: "full", md: "lg" }}
      placement="center"
      scrollBehavior="inside"
      motionPreset="slide-in-bottom"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content colorPalette="teal">
            {cls && <DetailContent cls={cls} now={now} onClose={onClose} />}
          </Dialog.Content>
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
  const kcal = format(fromColumns(cls));
  const duration = cls.durationMin != null ? `${cls.durationMin} min` : "—";
  const time =
    cls.endTime && cls.endTime !== cls.startTime
      ? `${cls.startTime}–${cls.endTime}`
      : cls.startTime;

  return (
    <>
      <Dialog.Header>
        <Stack gap="2" pe="10">
          <Dialog.Title>{cls.name}</Dialog.Title>
          <HStack gap="2">
            <Badge colorPalette="gray" variant="subtle">
              {time}
            </Badge>
            <StatusBadge status={status} />
          </HStack>
        </Stack>
        <Dialog.CloseTrigger asChild>
          <CloseButton size="sm" colorPalette="gray" />
        </Dialog.CloseTrigger>
      </Dialog.Header>

      <Dialog.Body>
        <Stack gap={{ base: "5", md: "6" }}>
          <LiveSpots cls={cls} />

          <DataList.Root
            orientation={{ base: "vertical", md: "horizontal" }}
            gap="3"
          >
            <DataList.Item>
              <DataList.ItemLabel>Date</DataList.ItemLabel>
              <DataList.ItemValue>{cls.date}</DataList.ItemValue>
            </DataList.Item>
            <DataList.Item>
              <DataList.ItemLabel>Duration</DataList.ItemLabel>
              <DataList.ItemValue>{duration}</DataList.ItemValue>
            </DataList.Item>
            <DataList.Item>
              <DataList.ItemLabel>Calories</DataList.ItemLabel>
              <DataList.ItemValue>{kcal}</DataList.ItemValue>
            </DataList.Item>
            <DataList.Item>
              <DataList.ItemLabel>Intensity</DataList.ItemLabel>
              <DataList.ItemValue>
                <Intensity value={cls.intensity} />
              </DataList.ItemValue>
            </DataList.Item>
          </DataList.Root>
        </Stack>
      </Dialog.Body>

      <Dialog.Footer flexDirection="column" alignItems="stretch" gap="4">
        {bookable ? (
          <BookNow key={cls._id} cls={cls} />
        ) : (
          <Alert.Root status="info">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>
                This class has finished — it can no longer be booked.
              </Alert.Description>
            </Alert.Content>
          </Alert.Root>
        )}
        <AutoBookWeekly key={`autobook-${cls._id}`} cls={cls} />
        <Button
          variant="outline"
          colorPalette="gray"
          onClick={onClose}
          w={{ base: "full", sm: "auto" }}
          alignSelf={{ base: "stretch", sm: "flex-end" }}
        >
          Close
        </Button>
      </Dialog.Footer>
    </>
  );
}
