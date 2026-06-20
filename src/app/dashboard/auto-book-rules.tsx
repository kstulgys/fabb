"use client";

import {
  Alert,
  Badge,
  Button,
  Card,
  CloseButton,
  Dialog,
  EmptyState,
  Field,
  Flex,
  Heading,
  NativeSelect,
  Portal,
  Span,
  Spinner,
  Stack,
  Switch,
  Text,
} from "@chakra-ui/react";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { LuPlus, LuRepeat2 } from "react-icons/lu";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { weekdayLabel } from "../../../convex/week";
import { ConfirmDeleteButton } from "../confirm-delete-button";
import { CardRowsSkeleton } from "./skeletons";

/** How each run outcome reads in the per-rule history. */
const RUN_OUTCOME = {
  registered: { label: "Booked", palette: "green" },
  already: { label: "Already booked", palette: "green" },
  full: { label: "Full", palette: "orange" },
  no_match: { label: "No match", palette: "gray" },
  no_details: { label: "Details incomplete", palette: "red" },
  error: { label: "Error", palette: "red" },
} as const satisfies Record<
  Doc<"ruleRuns">["outcome"],
  { label: string; palette: string }
>;

/**
 * A rule's recent run outcomes (newest first), from the day-before cron's run
 * log. Owner-scoped server-side (`recentRuns`); each badge carries the attempt
 * date + message on hover.
 */
function RuleRunLog({ runs }: { runs: Doc<"ruleRuns">[] | undefined }) {
  if (runs === undefined) return null;
  if (runs.length === 0) {
    return (
      <Text fontSize="xs" color="fg.muted">
        No runs yet — outcomes appear here after the day-before cron runs.
      </Text>
    );
  }
  return (
    <Flex gap="1.5" wrap="wrap" align="center">
      <Text fontSize="xs" color="fg.muted">
        Recent runs:
      </Text>
      {runs.map((run) => {
        const p = RUN_OUTCOME[run.outcome];
        return (
          <Badge
            key={run._id}
            size="sm"
            variant="subtle"
            colorPalette={p.palette}
            aria-label={`${p.label} on ${run.date}: ${run.message}`}
          >
            {p.label}
            <Span color="fg.muted" fontWeight="normal">
              · {run.date.slice(5)}
            </Span>
          </Badge>
        );
      })}
    </Flex>
  );
}

/**
 * One AutoBook rule with its enable/disable toggle and delete control. Both
 * mutations are owner-scoped server-side; the row only reflects and drives them.
 * `busy` blocks a double-fire while a mutation is in flight (notably delete,
 * which would otherwise hit an already-removed rule).
 */
function RuleRow({ rule }: { rule: Doc<"autoBookRules"> }) {
  const setEnabled = useMutation(api.autoBookRules.setRuleEnabled);
  const deleteRule = useMutation(api.autoBookRules.deleteRule);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runs = useQuery(api.autoBook.recentRuns, { ruleId: rule._id });

  return (
    <Card.Root variant="outline" opacity={rule.enabled ? 1 : 0.6}>
      <Card.Body gap="3">
        <Flex gap="3" align="flex-start" justify="space-between" wrap="wrap">
          <Stack gap="1" flex="1" minW="0">
            <Flex gap="2" align="center" wrap="wrap">
              <Text fontWeight="semibold">{rule.nameMatch}</Text>
              <Badge
                colorPalette={rule.enabled ? "green" : "gray"}
                variant="subtle"
              >
                {rule.enabled ? "Enabled" : "Disabled"}
              </Badge>
            </Flex>
            <Text fontSize="sm" color="fg.muted">
              Every {weekdayLabel(rule.weekday)} at {rule.startTime}
            </Text>
          </Stack>
          <Flex gap="1" align="center" flexShrink="0">
            <Switch.Root
              checked={rule.enabled}
              disabled={busy}
              onCheckedChange={() => {
                setBusy(true);
                setError(null);
                void setEnabled({ ruleId: rule._id, enabled: !rule.enabled })
                  .catch((e) =>
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Couldn't update the rule.",
                    ),
                  )
                  .finally(() => setBusy(false));
              }}
            >
              <Switch.HiddenInput />
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
              <Switch.Label srOnly>
                Auto-book {rule.nameMatch} every {weekdayLabel(rule.weekday)}
              </Switch.Label>
            </Switch.Root>
            <ConfirmDeleteButton
              label="Delete rule"
              title="Delete this rule?"
              description={
                <>
                  Removes the weekly rule for “{rule.nameMatch}” every{" "}
                  {weekdayLabel(rule.weekday)} at {rule.startTime}. A booking
                  already placed for it isn’t cancelled.
                </>
              }
              busy={busy}
              onConfirm={() => {
                setBusy(true);
                setError(null);
                void deleteRule({ ruleId: rule._id })
                  .catch((e) =>
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Couldn't delete the rule.",
                    ),
                  )
                  .finally(() => setBusy(false));
              }}
            />
          </Flex>
        </Flex>
        <RuleRunLog runs={runs} />
        {error && (
          <Alert.Root status="error" size="sm">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>{error}</Alert.Description>
            </Alert.Content>
          </Alert.Root>
        )}
      </Card.Body>
    </Card.Root>
  );
}

/**
 * Class-picker dialog for creating an AutoBook rule. Mounted fresh on each open
 * so state resets. Mirrors `PickClassPanel` + `AddLogDialog` in training-log.tsx
 * but submits to `createFromClass` instead.
 */
function AddRuleDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(e) => {
        if (!e.open) onClose();
      }}
      placement="center"
      size={{ base: "full", md: "lg" }}
      motionPreset="slide-in-bottom"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content colorPalette="teal">
            {open && <AddRuleBody onClose={onClose} />}
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

/** Body mounted only while dialog is open so queries + state reset each time. */
function AddRuleBody({ onClose }: { onClose: () => void }) {
  const week = useQuery(api.classes.weekClasses, {});
  const createRule = useMutation(api.autoBookRules.createFromClass);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options =
    week?.days.flatMap((day) =>
      day.classes.map((cls) => ({
        key: `${cls.pid}|${cls.date}`,
        cls,
        label: `${day.weekday} ${cls.date} · ${cls.startTime} · ${cls.name}`,
      })),
    ) ?? [];

  const picked = options.find((o) => o.key === selected)?.cls ?? null;

  const submit = () => {
    if (picked === null) return;
    setBusy(true);
    setError(null);
    createRule({ pid: picked.pid, date: picked.date })
      .then(() => onClose())
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Couldn't add the rule."),
      )
      .finally(() => setBusy(false));
  };

  return (
    <>
      <Dialog.Header>
        <Dialog.Title>Add auto-book rule</Dialog.Title>
      </Dialog.Header>
      <Dialog.CloseTrigger asChild>
        <CloseButton size="sm" />
      </Dialog.CloseTrigger>
      <Dialog.Body>
        {week === undefined ? (
          <Flex justify="center" py="6">
            <Spinner />
          </Flex>
        ) : options.length === 0 ? (
          <Alert.Root status="info" mt="2">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>
                No classes in this week&apos;s schedule — check back when the
                schedule is published.
              </Alert.Description>
            </Alert.Content>
          </Alert.Root>
        ) : (
          <Stack gap="4" pt="2">
            <Field.Root>
              <Field.Label>Class</Field.Label>
              <NativeSelect.Root>
                <NativeSelect.Field
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  <option value="">Choose a class…</option>
                  {options.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
              <Field.HelperText>
                The rule repeats every week on the same day and time.
              </Field.HelperText>
            </Field.Root>
            <Button
              alignSelf={{ base: "stretch", sm: "flex-start" }}
              disabled={picked === null || busy}
              loading={busy}
              loadingText="Adding…"
              onClick={submit}
            >
              <LuPlus /> Add rule
            </Button>
            {error && (
              <Alert.Root status="error">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Description>{error}</Alert.Description>
                </Alert.Content>
              </Alert.Root>
            )}
          </Stack>
        )}
      </Dialog.Body>
      <Dialog.Footer>
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </Dialog.Footer>
    </>
  );
}

/**
 * The calling User's AutoBook rules — this User only (`listMine` is scoped
 * server-side). States plainly (ADR-0001) that disabling or deleting a rule
 * stops FUTURE bookings but never cancels a Booking already placed.
 */
export function AutoBookRules() {
  const rules = useQuery(api.autoBookRules.listMine);
  const [adding, setAdding] = useState(false);

  return (
    <Stack gap="6">
      <Flex
        direction={{ base: "column", md: "row" }}
        justify="space-between"
        align={{ md: "center" }}
        gap="3"
      >
        <Stack gap="1">
          <Heading size="md">Auto-book rules</Heading>
          <Text color="fg.muted" fontSize="sm">
            Standing weekly instructions — the day before, each enabled rule
            books its class. Disabling or deleting a rule stops future bookings
            but does{" "}
            <Text as="span" fontWeight="medium">
              not
            </Text>{" "}
            cancel a booking already placed; the pool&apos;s confirmation email
            holds the only cancel link.
          </Text>
        </Stack>
        <Button
          w={{ base: "full", md: "auto" }}
          flexShrink="0"
          onClick={() => setAdding(true)}
        >
          <LuPlus /> Add rule
        </Button>
      </Flex>

      {rules === undefined ? (
        <CardRowsSkeleton />
      ) : rules.length === 0 ? (
        <EmptyState.Root>
          <EmptyState.Content>
            <EmptyState.Indicator>
              <LuRepeat2 />
            </EmptyState.Indicator>
            <Stack gap="1" textAlign="center">
              <EmptyState.Title>No auto-book rules yet</EmptyState.Title>
              <EmptyState.Description>
                Add a weekly rule and the app books that class for you the day
                before — every week.
              </EmptyState.Description>
            </Stack>
            <Button variant="outline" mt="2" onClick={() => setAdding(true)}>
              <LuPlus /> Add rule
            </Button>
          </EmptyState.Content>
        </EmptyState.Root>
      ) : (
        <Stack gap="3">
          {rules.map((rule) => (
            <RuleRow key={rule._id} rule={rule} />
          ))}
        </Stack>
      )}

      <AddRuleDialog open={adding} onClose={() => setAdding(false)} />
    </Stack>
  );
}
