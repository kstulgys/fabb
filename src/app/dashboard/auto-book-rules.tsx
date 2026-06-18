"use client";

import {
  Badge,
  Box,
  Button,
  Flex,
  Heading,
  Spinner,
  Stack,
  Text,
} from "@chakra-ui/react";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
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
  const runs = useQuery(api.autoBook.recentRuns, { ruleId: rule._id });

  return (
    <Stack
      borderWidth="1px"
      borderRadius="lg"
      p="3"
      gap="2"
      opacity={rule.enabled ? 1 : 0.6}
    >
      <Flex gap="3" align="center" justify="space-between">
        <Box>
          <Flex gap="2" align="baseline">
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
        </Box>
        <Flex gap="2" flexShrink="0">
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void setEnabled({
                ruleId: rule._id,
                enabled: !rule.enabled,
              }).finally(() => setBusy(false));
            }}
          >
            {rule.enabled ? "Disable" : "Enable"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            colorPalette="red"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void deleteRule({ ruleId: rule._id }).finally(() =>
                setBusy(false),
              );
            }}
          >
            Delete
          </Button>
        </Flex>
      </Flex>
      <RuleRunLog runs={runs} />
    </Stack>
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
    <Stack gap="3">
      <Box>
        <Heading size="md">Auto-book rules</Heading>
        <Text color="fg.muted" fontSize="sm" mt="1">
          Standing weekly instructions — the day before, each enabled rule books
          its class. Disabling or deleting a rule stops future bookings but does{" "}
          <Text as="span" fontWeight="medium">
            not
          </Text>{" "}
          cancel a booking already placed; the pool's confirmation email holds the
          only cancel link.
        </Text>
      </Box>

      {rules === undefined ? (
        <Flex justify="center" py="6">
          <Spinner />
        </Flex>
      ) : rules.length === 0 ? (
        <Text color="fg.muted" fontSize="sm">
          No auto-book rules yet. Open a class and choose “Auto-book weekly”.
        </Text>
      ) : (
        <Stack gap="2">
          {rules.map((rule) => (
            <RuleRow key={rule._id} rule={rule} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
