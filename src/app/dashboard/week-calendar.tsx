"use client";

import {
  Badge,
  Card,
  Flex,
  Heading,
  HStack,
  Icon,
  Span,
  Stack,
  Text,
} from "@chakra-ui/react";
import { useQuery } from "convex/react";
import { useState, type ReactNode } from "react";
import { LuCalendarDays, LuClock, LuFlame } from "react-icons/lu";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { format, fromColumns } from "../../../convex/calories";
import { classStatus } from "../../../convex/week";
import { ClassDetailDialog, StatusBadge } from "./class-detail";
import { Intensity } from "./intensity";
import { ScheduleSkeleton } from "./skeletons";

/** A read-only fact in a class row: a small muted icon beside its value. */
function Fact({ icon, value }: { icon: ReactNode; value: string }) {
  return (
    <HStack gap="1.5">
      <Icon boxSize="3.5">{icon}</Icon>
      <Span>{value}</Span>
    </HStack>
  );
}

/** One class within a day, rendered as a clickable card. Clicking opens the
 * detail dialog with its live free-spot count. Today's finished classes are
 * dimmed and struck through. */
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

  return (
    <Card.Root
      as="button"
      variant="outline"
      textAlign="left"
      w="full"
      cursor="pointer"
      onClick={onOpen}
      opacity={finished ? 0.6 : 1}
      transition="background-color 0.15s ease-out, border-color 0.15s ease-out"
      _hover={{ bg: "bg.subtle", borderColor: "border.emphasized" }}
      _active={{ bg: "bg.muted" }}
      _focusVisible={{
        outline: "2px solid",
        outlineColor: "colorPalette.focusRing",
        outlineOffset: "2px",
      }}
    >
      <Card.Body px="4" py="3.5">
        <Stack gap="1.5">
          <Flex justify="space-between" align="start" gap="3">
            <Text
              as="span"
              fontWeight="semibold"
              textDecoration={finished ? "line-through" : undefined}
            >
              {cls.name}
            </Text>
            <HStack gap="2" flexShrink="0">
              {status !== "upcoming" && <StatusBadge status={status} />}
              <Badge variant="subtle">{time}</Badge>
            </HStack>
          </Flex>
          <Flex
            wrap="wrap"
            align="center"
            columnGap="4"
            rowGap="1.5"
            fontSize="sm"
            color="fg.muted"
          >
            <Intensity value={cls.intensity} />
            <Fact icon={<LuFlame />} value={kcal} />
            <Fact icon={<LuClock />} value={duration} />
          </Flex>
        </Stack>
      </Card.Body>
    </Card.Root>
  );
}

/**
 * The current Mon–Sun week of pool classes, grouped by day. Reads the shared
 * `classes` cache reactively (ADR-0002) — populated by the scrape action — so
 * no per-view scraping happens here. Opening a class fetches its volatile
 * free-spot count live (never cached).
 */
export function WeekCalendar() {
  const week = useQuery(api.classes.weekClasses, {});
  const [selected, setSelected] = useState<Doc<"classes"> | null>(null);
  // One "now" for this render drives every status marking and the open dialog.
  const now = new Date();

  if (week === undefined) {
    return <ScheduleSkeleton />;
  }

  return (
    <Stack gap="8">
      <Stack gap="1">
        <HStack gap="2">
          <Icon color="colorPalette.fg" boxSize="5">
            <LuCalendarDays />
          </Icon>
          <Heading size="md">This week</Heading>
        </HStack>
        <Text color="fg.muted" fontSize="sm">
          {week.weekStart} – {week.weekEnd}. Only the current week is available.
        </Text>
      </Stack>

      <Stack gap="6">
        {week.days.map((day) => (
          <Stack gap="2" key={day.date}>
            <Heading size="sm">
              {day.weekday}{" "}
              <Span color="fg.muted" fontWeight="normal">
                · {day.date}
              </Span>
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
          </Stack>
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
