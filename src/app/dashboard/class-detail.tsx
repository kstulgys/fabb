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
import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import type { BookingStatus } from "../../../convex/bookingStatus";
import { format, fromColumns } from "../../../convex/calories";
import type { Availability } from "../../../convex/pool/parse";
import {
  type ClassStatus,
  classStatus,
  isoWeekday,
  weekdayLabel,
} from "../../../convex/week";
import { CompleteDetailsPrompt } from "../complete-details-prompt";

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
  const held =
    state.kind === "done" &&
    (state.status === "registered" || state.status === "already");

  return (
    <Stack gap="2" align="flex-start" flex="1">
      <Button
        colorPalette="teal"
        loading={state.kind === "booking"}
        loadingText="Booking…"
        disabled={held}
        onClick={onBook}
      >
        Book now
      </Button>
      {outcome && (
        <Text fontSize="sm" color={`${outcome.palette}.600`} maxW="sm">
          {outcome.text}
        </Text>
      )}
      <Text fontSize="xs" color="fg.muted" maxW="sm">
        The pool emails a confirmation with the only working cancel link —
        bookings can't be cancelled in the app.
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
    <Stack gap="2" align="flex-start">
      <Button
        variant="outline"
        colorPalette="teal"
        loading={state.kind === "saving"}
        loadingText="Setting up…"
        disabled={state.kind === "done"}
        onClick={onCreate}
      >
        Auto-book weekly
      </Button>
      {state.kind === "done" && (
        <Text fontSize="sm" color="green.600" maxW="sm">
          Weekly auto-book set: every {weekday} at {cls.startTime} for “{cls.name}
          ”. Manage it under Auto-book rules below.
        </Text>
      )}
      {state.kind === "failed" && (
        <Text fontSize="sm" color="red.600" maxW="sm">
          {state.message}
        </Text>
      )}
      <Text fontSize="xs" color="fg.muted" maxW="sm">
        Books “{cls.name}” every {weekday} at {cls.startTime} from next week on.
        Disabling or deleting the rule stops future bookings but never cancels a
        booking already placed.
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
  const kcal = format(fromColumns(cls));
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

      <Dialog.Footer
        justifyContent="space-between"
        gap="3"
        alignItems="flex-start"
      >
        <Stack gap="4" flex="1">
          {bookable ? (
            <BookNow key={cls._id} cls={cls} />
          ) : (
            <Text fontSize="sm" color="fg.muted">
              This class has finished — it can no longer be booked.
            </Text>
          )}
          <AutoBookWeekly key={`autobook-${cls._id}`} cls={cls} />
        </Stack>
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </Dialog.Footer>
    </>
  );
}
