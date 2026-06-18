"use client";

import { Badge, Box, Flex, Heading, Spinner, Stack, Text } from "@chakra-ui/react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";

/** One class within a day. Absent calories/duration render as an em dash. */
function ClassRow({ cls }: { cls: Doc<"classes"> }) {
  const time =
    cls.endTime && cls.endTime !== cls.startTime
      ? `${cls.startTime}–${cls.endTime}`
      : cls.startTime;
  const kcal =
    cls.kcalMin != null && cls.kcalMax != null
      ? `${cls.kcalMin}–${cls.kcalMax} kcal`
      : "—";
  const duration = cls.durationMin != null ? `${cls.durationMin} min` : "—";
  const hearts = cls.intensity > 0 ? "❤".repeat(cls.intensity) : "—";

  return (
    <Box borderWidth="1px" borderRadius="lg" p="3">
      <Flex justify="space-between" align="baseline" gap="3">
        <Text fontWeight="semibold">{cls.name}</Text>
        <Badge variant="subtle" flexShrink="0">
          {time}
        </Badge>
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
    </Box>
  );
}

/**
 * The current Mon–Sun week of pool classes, grouped by day. Reads the shared
 * `classes` cache reactively (ADR-0002) — populated by the scrape action — so
 * no per-view scraping happens here.
 */
export function WeekCalendar() {
  const week = useQuery(api.classes.weekClasses);

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
                  <ClassRow key={cls._id} cls={cls} />
                ))}
              </Stack>
            )}
          </Box>
        ))}
      </Stack>
    </Stack>
  );
}
