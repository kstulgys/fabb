"use client";

import {
  Alert,
  Badge,
  Card,
  EmptyState,
  Flex,
  Heading,
  IconButton,
  Spinner,
  Stack,
  Switch,
  Text,
} from "@chakra-ui/react";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { LuRepeat2, LuTrash2 } from "react-icons/lu";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { weekdayLabel } from "../../../convex/week";

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
            title={`${run.date} — ${run.message}`}
          >
            {p.label}
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
            <IconButton
              aria-label="Delete rule"
              colorPalette="red"
              variant="ghost"
              disabled={busy}
              onClick={() => {
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
            >
              <LuTrash2 />
            </IconButton>
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
 * The calling User's AutoBook rules — this User only (`listMine` is scoped
 * server-side). States plainly (ADR-0001) that disabling or deleting a rule
 * stops FUTURE bookings but never cancels a Booking already placed.
 */
export function AutoBookRules() {
  const rules = useQuery(api.autoBookRules.listMine);

  return (
    <Stack gap="6">
      <Stack gap="1">
        <Heading size="md">Auto-book rules</Heading>
        <Text color="fg.muted" fontSize="sm">
          Standing weekly instructions — the day before, each enabled rule books
          its class. Disabling or deleting a rule stops future bookings but does{" "}
          <Text as="span" fontWeight="medium">
            not
          </Text>{" "}
          cancel a booking already placed; the pool&apos;s confirmation email
          holds the only cancel link.
        </Text>
      </Stack>

      {rules === undefined ? (
        <Flex justify="center" py="6">
          <Spinner />
        </Flex>
      ) : rules.length === 0 ? (
        <EmptyState.Root>
          <EmptyState.Content>
            <EmptyState.Indicator>
              <LuRepeat2 />
            </EmptyState.Indicator>
            <Stack gap="1" textAlign="center">
              <EmptyState.Title>No auto-book rules yet</EmptyState.Title>
              <EmptyState.Description>
                Open a class and choose “Auto-book weekly”.
              </EmptyState.Description>
            </Stack>
          </EmptyState.Content>
        </EmptyState.Root>
      ) : (
        <Stack gap="3">
          {rules.map((rule) => (
            <RuleRow key={rule._id} rule={rule} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
