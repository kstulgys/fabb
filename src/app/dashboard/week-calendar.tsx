"use client";

import {
  Badge,
  Box,
  Card,
  Flex,
  Heading,
  HStack,
  Icon,
  SimpleGrid,
  Span,
  Stack,
  Text,
} from "@chakra-ui/react";
import { useQuery } from "convex/react";
import { useState, type ReactNode } from "react";
import { LuCalendarDays, LuClock, LuFlame } from "react-icons/lu";
import { api } from "../../../convex/_generated/api";
import type { WeekClasses } from "../../../convex/classes";
import type { Doc } from "../../../convex/_generated/dataModel";
import { format, fromColumns } from "../../../convex/calories";
import { classStatus, todayDate } from "../../../convex/week";
import { ClassDetailDialog, StatusBadge } from "./class-detail";
import { Intensity } from "./intensity";
import { pickInitialView } from "./pick-initial-view";
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

/** One day's button in the week strip: weekday, date number, and a teal dot
 * when that day has classes. The selected day is filled teal; today (when not
 * selected) carries a teal outline so "where am I" and "what's today" stay
 * distinct. */
function DayTab({
  day,
  isActive,
  isToday,
  onSelect,
}: {
  day: WeekClasses["days"][number];
  isActive: boolean;
  isToday: boolean;
  onSelect: () => void;
}) {
  const count = day.classes.length;
  return (
    <Stack
      as="button"
      onClick={onSelect}
      align="center"
      gap="1"
      py="2"
      rounded="md"
      cursor="pointer"
      bg={isActive ? "colorPalette.solid" : "bg.muted"}
      color={isActive ? "colorPalette.contrast" : "fg"}
      borderWidth="1px"
      borderColor={
        isActive
          ? "colorPalette.solid"
          : isToday
            ? "colorPalette.solid"
            : "transparent"
      }
      transition="background-color 0.15s ease-out, border-color 0.15s ease-out"
      _hover={isActive ? undefined : { bg: "bg.emphasized" }}
      _focusVisible={{
        outline: "2px solid",
        outlineColor: "colorPalette.focusRing",
        outlineOffset: "2px",
      }}
      aria-pressed={isActive}
      aria-label={`${day.weekday} ${day.date}, ${
        count === 0
          ? "no classes"
          : `${count} ${count === 1 ? "class" : "classes"}`
      }`}
    >
      <Text
        fontSize="2xs"
        fontWeight="medium"
        textTransform="uppercase"
        letterSpacing="wide"
        color={isActive ? "inherit" : "fg.muted"}
      >
        {day.weekday.slice(0, 3)}
      </Text>
      <Text
        fontSize="md"
        fontWeight="semibold"
        lineHeight="1"
        fontVariantNumeric="tabular-nums"
      >
        {Number(day.date.slice(8))}
      </Text>
      <Box
        boxSize="1.5"
        rounded="full"
        bg={
          count === 0
            ? "transparent"
            : isActive
              ? "colorPalette.contrast"
              : "colorPalette.solid"
        }
      />
    </Stack>
  );
}

/**
 * The week schedule, one day at a time. A seven-day strip selects the day —
 * the caller's `initialDate` when it lands in this week, else today, else the
 * week's first day; only that day's classes show below, so the whole week is a
 * glance instead of a long scroll. Presentational: it takes the already-loaded
 * week, so it can render from mock data and be unit-tested without Convex.
 */
export function WeekSchedule({
  week,
  now,
  initialDate,
}: {
  week: WeekClasses;
  now: Date;
  initialDate?: string;
}) {
  const today = todayDate(now);
  const [selected, setSelected] = useState<Doc<"classes"> | null>(null);
  const [activeDate, setActiveDate] = useState(
    initialDate && week.days.some((d) => d.date === initialDate)
      ? initialDate
      : week.days.some((d) => d.date === today)
        ? today
        : week.days[0].date,
  );
  const activeDay =
    week.days.find((d) => d.date === activeDate) ?? week.days[0];

  return (
    <Stack gap="6">
      <Stack gap="1">
        <HStack gap="2">
          <Icon color="colorPalette.fg" boxSize="5">
            <LuCalendarDays />
          </Icon>
          <Heading size="md">Schedule</Heading>
        </HStack>
        <Text color="fg.muted" fontSize="sm">
          {week.weekStart} – {week.weekEnd}
        </Text>
      </Stack>

      <SimpleGrid columns={7} gap="1.5">
        {week.days.map((day) => (
          <DayTab
            key={day.date}
            day={day}
            isActive={day.date === activeDate}
            isToday={day.date === today}
            onSelect={() => setActiveDate(day.date)}
          />
        ))}
      </SimpleGrid>

      <Stack gap="3">
        <HStack gap="2">
          <Heading size="sm">
            {activeDay.weekday}{" "}
            <Span color="fg.muted" fontWeight="normal">
              · {activeDay.date}
            </Span>
          </Heading>
          {activeDay.date === today && (
            <Badge colorPalette="teal" variant="subtle" size="sm">
              Today
            </Badge>
          )}
        </HStack>
        {activeDay.classes.length === 0 ? (
          <Card.Root variant="outline">
            <Card.Body py="8">
              <Stack align="center" gap="1" textAlign="center">
                <Text fontWeight="medium">
                  No classes on {activeDay.weekday}
                </Text>
                <Text color="fg.muted" fontSize="sm">
                  Pick another day to see what&apos;s on.
                </Text>
              </Stack>
            </Card.Body>
          </Card.Root>
        ) : (
          <Stack gap="2">
            {activeDay.classes.map((cls) => (
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

      <ClassDetailDialog
        cls={selected}
        now={now}
        onClose={() => setSelected(null)}
      />
    </Stack>
  );
}

/** The "This week / Next week" selector above the day strip. Mirrors the main
 * nav tabs: the active segment is teal foreground text only (no solid fill), so
 * the toggle stays within the One Voice teal budget. */
function WeekToggle({
  weeks,
  active,
  onSelect,
}: {
  weeks: WeekClasses[];
  active: number;
  onSelect: (index: number) => void;
}) {
  return (
    <HStack gap="1" role="tablist" aria-label="Schedule week">
      {weeks.map((week, index) => {
        const isActive = index === active;
        return (
          <Box
            as="button"
            key={week.weekStart}
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(index)}
            px="3"
            py="1.5"
            rounded="md"
            fontSize="sm"
            fontWeight="medium"
            color={isActive ? "colorPalette.fg" : "fg.muted"}
            _hover={{ bg: "bg.muted" }}
            _focusVisible={{
              outline: "2px solid",
              outlineColor: "colorPalette.focusRing",
              outlineOffset: "2px",
            }}
          >
            {index === 0 ? "This week" : "Next week"}
          </Box>
        );
      })}
    </HStack>
  );
}

/**
 * The loaded Schedule window: the week toggle above the selected week's day
 * schedule. Split out from {@link WeekCalendar} so it mounts only once
 * `scheduleWeeks` has resolved — its initial selection, the smart landing week
 * and day from {@link pickInitialView} (current-unless-spent, today-as-anchor),
 * is then computed from real data in `useState` initializers, no effect needed.
 * One `now` for this render drives that choice and every status marking. The
 * `initialDate` only "sticks" to the week that contains it, so toggling to the
 * other week falls back to {@link WeekSchedule}'s own naive day default.
 */
function ScheduleWindow({ weeks, now }: { weeks: WeekClasses[]; now: Date }) {
  const [initial] = useState(() => pickInitialView(weeks, now));
  const [active, setActive] = useState(initial.weekIndex);
  const week = weeks[active] ?? weeks[0];

  return (
    <Stack gap="5">
      <WeekToggle weeks={weeks} active={active} onSelect={setActive} />
      <WeekSchedule
        key={week.weekStart}
        week={week}
        now={now}
        initialDate={initial.date}
      />
    </Stack>
  );
}

/**
 * Loads the Schedule window (the current Mon–Sun week and the next) from the
 * shared `classes` cache (ADR-0002) — populated by the scrape action, read
 * reactively, never scraped per view — and hands it to {@link ScheduleWindow}
 * once resolved. Opening a class fetches its volatile free-spot count live
 * (never cached).
 */
export function WeekCalendar() {
  const data = useQuery(api.classes.scheduleWeeks, {});

  if (data === undefined) {
    return <ScheduleSkeleton />;
  }

  return <ScheduleWindow weeks={data.weeks} now={new Date()} />;
}
