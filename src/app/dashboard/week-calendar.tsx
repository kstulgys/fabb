"use client";

import { Badge, Box, chakra, Flex, Heading, Spinner, Stack, Text } from "@chakra-ui/react";
import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { format, fromColumns } from "../../../convex/calories";
import { classStatus } from "../../../convex/week";
import { ClassDetailDialog, StatusBadge } from "./class-detail";

/** One class within a day. Clicking opens the detail dialog with its live
 * free-spot count. Today's finished classes are struck through and marked. */
function ClassRow({
  cls,
  now,
  onOpen,
}: {
  cls: Doc<"classes">;
  now: Date;
  onOpen: () => void;
}) {
  const { status } = classStatus(cls, now);
  const finished = status === "finished";
  const time =
    cls.endTime && cls.endTime !== cls.startTime
      ? `${cls.startTime}–${cls.endTime}`
      : cls.startTime;
  const kcal = format(fromColumns(cls));
  const duration = cls.durationMin != null ? `${cls.durationMin} min` : "—";
  const hearts = cls.intensity > 0 ? "❤".repeat(cls.intensity) : "—";

  return (
    <chakra.button
      type="button"
      onClick={onOpen}
      textAlign="left"
      width="full"
      borderWidth="1px"
      borderRadius="lg"
      p="3"
      cursor="pointer"
      opacity={finished ? 0.6 : 1}
      _hover={{ borderColor: "fg.muted", bg: "bg.subtle" }}
      _focusVisible={{ outline: "2px solid", outlineColor: "blue.500" }}
    >
      <Flex justify="space-between" align="baseline" gap="3">
        <Text
          fontWeight="semibold"
          textDecoration={finished ? "line-through" : undefined}
        >
          {cls.name}
        </Text>
        <Flex gap="2" align="center" flexShrink="0">
          {status !== "upcoming" && <StatusBadge status={status} />}
          <Badge variant="subtle">{time}</Badge>
        </Flex>
      </Flex>
      <Flex
        gap="4"
        mt="1"
        fontSize="sm"
        color="fg.muted"
        align="center"
        wrap="wrap"
      >
        <Text color="red.500" aria-label={`intensity ${cls.intensity}`}>
          {hearts}
        </Text>
        <Text>{kcal}</Text>
        <Text>{duration}</Text>
      </Flex>
    </chakra.button>
  );
}

/**
 * The current Mon–Sun week of pool classes, grouped by day. Reads the shared
 * `classes` cache reactively (ADR-0002) — populated by the scrape action — so
 * no per-view scraping happens here. Opening a class fetches its volatile
 * free-spot count live (never cached).
 */
export function WeekCalendar() {
  const week = useQuery(api.classes.weekClasses);
  const [selected, setSelected] = useState<Doc<"classes"> | null>(null);
  // One "now" for this render drives every status marking and the open dialog.
  const now = new Date();

  if (week === undefined) {
    return (
      <Flex justify="center" py="10">
        <Spinner />
      </Flex>
    );
  }

  return (
    <Stack gap="6">
      <Box>
        <Heading size="md">This week</Heading>
        <Text color="fg.muted" fontSize="sm" mt="1">
          {week.weekStart} – {week.weekEnd}. Only the current week is available.
        </Text>
      </Box>

      <Stack gap="5">
        {week.days.map((day) => (
          <Box key={day.date}>
            <Heading size="sm" mb="2">
              {day.weekday}{" "}
              <Text as="span" color="fg.muted" fontWeight="normal">
                · {day.date}
              </Text>
            </Heading>
            {day.classes.length === 0 ? (
              <Text color="fg.muted" fontSize="sm">
                No classes.
              </Text>
            ) : (
              <Stack gap="2">
                {day.classes.map((cls) => (
                  <ClassRow
                    key={cls._id}
                    cls={cls}
                    now={now}
                    onOpen={() => setSelected(cls)}
                  />
                ))}
              </Stack>
            )}
          </Box>
        ))}
      </Stack>

      <ClassDetailDialog
        cls={selected}
        now={now}
        onClose={() => setSelected(null)}
      />
    </Stack>
  );
}
