"use client";

import { Chart, useChart } from "@chakra-ui/charts";
import {
  Box,
  chakra,
  EmptyState,
  Flex,
  Heading,
  HStack,
  Icon,
  SegmentGroup,
  SimpleGrid,
  Span,
  Stack,
  Text,
} from "@chakra-ui/react";
import { useQuery } from "convex/react";
import { useState } from "react";
import { LuChartColumn, LuFlame } from "react-icons/lu";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../../../convex/_generated/api";
import { StatsSkeleton } from "./skeletons";

/** The three totals scopes, matching `stats.summary`'s `period` arg. */
type Period = "week" | "month" | "all";

const PERIOD_LABELS: Record<Period, string> = {
  week: "This week",
  month: "This month",
  all: "All time",
};

/** The period headline as a single teal-forward "scoreboard": the classes count
 * is the hero figure, with the streak (momentum, flame) and calories (energy) as
 * role-differentiated supporting stats. This is the one surface DESIGN.md
 * sanctions to go teal-forward — the brand's "raise your voice" moment — kept
 * honest: real numbers, no gamification. All text is `teal.fg` on `teal.subtle`
 * (~7:1 light / ~11:1 dark), so the commitment never costs legibility. */
function Scoreboard({
  periodLabel,
  classes,
  calories,
  streak,
}: {
  periodLabel: string;
  classes: number;
  calories: number;
  streak: number;
}) {
  return (
    <Box bg="teal.subtle" color="teal.fg" rounded="lg" p={{ base: "5", md: "6" }}>
      <Flex
        direction={{ base: "column", sm: "row" }}
        justify="space-between"
        align={{ base: "stretch", sm: "flex-end" }}
        gap={{ base: "5", sm: "6" }}
      >
        <Stack gap="1">
          <Text fontSize="sm" fontWeight="medium">
            {periodLabel}
          </Text>
          <Flex align="baseline" gap="2">
            <Text
              fontSize={{ base: "6xl", md: "7xl" }}
              fontWeight="bold"
              lineHeight="0.9"
              letterSpacing="tight"
              fontVariantNumeric="tabular-nums"
            >
              {classes}
            </Text>
            <Text fontSize="lg" fontWeight="medium">
              {classes === 1 ? "class" : "classes"}
            </Text>
          </Flex>
        </Stack>

        <HStack gap="6" align="flex-end" pb={{ sm: "2" }}>
          <Stack gap="0.5">
            <HStack gap="1.5">
              <Icon boxSize="4">
                <LuFlame />
              </Icon>
              <Text fontSize="2xl" fontWeight="bold" lineHeight="1" fontVariantNumeric="tabular-nums">
                {streak}
              </Text>
            </HStack>
            <Text fontSize="xs" fontWeight="medium">
              week streak
            </Text>
          </Stack>
          <Stack gap="0.5">
            <Text fontSize="2xl" fontWeight="bold" lineHeight="1" fontVariantNumeric="tabular-nums">
              {calories.toLocaleString()}
            </Text>
            <Text fontSize="xs" fontWeight="medium">
              calories
            </Text>
          </Stack>
        </HStack>
      </Flex>
    </Box>
  );
}

/** A titled chart panel. */
function ChartPanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Stack gap="3">
      <Text fontSize="sm" fontWeight="medium">
        {title}
      </Text>
      {children}
    </Stack>
  );
}

/** A screen-reader-only data table mirroring a chart, so the figures aren't
 * locked inside an SVG. The chart stays the visual; this is its text equivalent
 * for assistive tech. */
function SrChartTable({
  caption,
  head,
  rows,
}: {
  caption: string;
  head: readonly [string, string];
  rows: ReadonlyArray<readonly [string, string | number]>;
}) {
  return (
    <chakra.table srOnly>
      <chakra.caption>{caption}</chakra.caption>
      <chakra.thead>
        <chakra.tr>
          <chakra.th scope="col">{head[0]}</chakra.th>
          <chakra.th scope="col">{head[1]}</chakra.th>
        </chakra.tr>
      </chakra.thead>
      <chakra.tbody>
        {rows.map(([k, v]) => (
          <chakra.tr key={String(k)}>
            <chakra.th scope="row">{k}</chakra.th>
            <chakra.td>{v}</chakra.td>
          </chakra.tr>
        ))}
      </chakra.tbody>
    </chakra.table>
  );
}

/**
 * The stats dashboard (issue 11): the calling User's progress over their
 * attended Training logs. A period toggle drives the headline totals; the
 * Calories-over-time line, classes-per-week bars, current weekly streak, and
 * top class types come from `stats.summary` (owner-scoped server-side). All
 * aggregation runs in Convex — this only renders.
 */
export function Stats() {
  const [period, setPeriod] = useState<Period>("week");
  const summary = useQuery(api.stats.summary, {});

  const weekly = summary?.weekly ?? [];
  const topTypes = summary?.topTypes ?? [];

  // "YYYY-MM-DD" Monday → "MM-DD" axis label (unambiguous within a year).
  const caloriesData = weekly.map((w) => ({
    week: w.week.slice(5),
    calories: Math.round(w.calories),
  }));
  const classesData = weekly.map((w) => ({
    week: w.week.slice(5),
    classes: w.classes,
  }));

  // Hooks run unconditionally with []-safe data so the order is stable while the
  // query is still loading.
  const caloriesChart = useChart({
    data: caloriesData,
    series: [{ name: "calories", color: "teal.solid" }],
  });
  const classesChart = useChart({
    data: classesData,
    series: [{ name: "classes", color: "teal.solid" }],
  });
  const typesChart = useChart({
    data: topTypes,
    series: [{ name: "count", color: "teal.solid" }],
  });

  return (
    <Stack gap="6">
      <Stack gap="1">
        <Heading size="md">Your progress</Heading>
        <Text color="fg.muted" fontSize="sm">
          Stats from the classes you attended. Calories use each class&apos;s
          published range midpoint; classes without a range still count as
          attendance.
        </Text>
      </Stack>

      {summary === undefined ? (
        <StatsSkeleton />
      ) : topTypes.length === 0 ? (
        <EmptyState.Root>
          <EmptyState.Content>
            <EmptyState.Indicator>
              <LuChartColumn />
            </EmptyState.Indicator>
            <EmptyState.Title>No stats yet</EmptyState.Title>
            <EmptyState.Description>
              Your totals, streak, and trends appear once you log a class you
              attended.
            </EmptyState.Description>
          </EmptyState.Content>
        </EmptyState.Root>
      ) : (
        <Stack gap={{ base: "4", md: "5" }}>
          <SegmentGroup.Root
            value={period}
            onValueChange={(e) => setPeriod(e.value as Period)}
            w={{ base: "full", sm: "auto" }}
          >
            <SegmentGroup.Indicator />
            {(["week", "month", "all"] as const).map((p) => (
              <SegmentGroup.Item
                key={p}
                value={p}
                flex={{ base: "1", sm: "initial" }}
                justifyContent="center"
              >
                <SegmentGroup.ItemText>
                  {PERIOD_LABELS[p]}
                </SegmentGroup.ItemText>
                <SegmentGroup.ItemHiddenInput />
              </SegmentGroup.Item>
            ))}
          </SegmentGroup.Root>

          <Text fontSize="xs" color="fg.muted">
            The period above sets the totals below. Trends and top types span your full
            history.
          </Text>

          <Scoreboard
            periodLabel={PERIOD_LABELS[period]}
            classes={summary.totals[period].classes}
            calories={Math.round(summary.totals[period].calories)}
            streak={summary.streak}
          />

          <Text fontSize="sm" fontWeight="medium">
            Trends{" "}
            <Span color="fg.muted" fontWeight="normal">· last 12 weeks</Span>
          </Text>

          <SimpleGrid
            columns={{ base: 1, md: 2 }}
            gap="5"
            mt={{ base: "3", md: "5" }}
          >
            <ChartPanel title="Calories over time">
              <SrChartTable
                caption="Calories over time, by week"
                head={["Week", "Calories"]}
                rows={caloriesData.map((d) => [d.week, d.calories])}
              />
              <Chart.Root maxH="56" chart={caloriesChart}>
                <LineChart data={caloriesChart.data} responsive>
                  <CartesianGrid
                    stroke={caloriesChart.color("border.muted")}
                    vertical={false}
                  />
                  <XAxis
                    dataKey={caloriesChart.key("week")}
                    stroke={caloriesChart.color("border")}
                    tickLine={false}
                  />
                  <YAxis
                    stroke={caloriesChart.color("border")}
                    tickLine={false}
                    width={48}
                  />
                  <Tooltip
                    cursor={false}
                    animationDuration={100}
                    content={<Chart.Tooltip />}
                  />
                  {caloriesChart.series.map((s) => (
                    <Line
                      key={s.name}
                      dataKey={caloriesChart.key(s.name)}
                      stroke={caloriesChart.color(s.color)}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </Chart.Root>
            </ChartPanel>

            <ChartPanel title="Classes per week">
              <SrChartTable
                caption="Classes attended, by week"
                head={["Week", "Classes"]}
                rows={classesData.map((d) => [d.week, d.classes])}
              />
              <Chart.Root maxH="56" chart={classesChart}>
                <BarChart data={classesChart.data} responsive>
                  <CartesianGrid
                    stroke={classesChart.color("border.muted")}
                    vertical={false}
                  />
                  <XAxis
                    dataKey={classesChart.key("week")}
                    stroke={classesChart.color("border")}
                    tickLine={false}
                  />
                  <YAxis
                    stroke={classesChart.color("border")}
                    tickLine={false}
                    allowDecimals={false}
                    width={32}
                  />
                  <Tooltip
                    cursor={false}
                    animationDuration={100}
                    content={<Chart.Tooltip />}
                  />
                  {classesChart.series.map((s) => (
                    <Bar
                      key={s.name}
                      dataKey={classesChart.key(s.name)}
                      fill={classesChart.color(s.color)}
                      radius={4}
                    />
                  ))}
                </BarChart>
              </Chart.Root>
            </ChartPanel>
          </SimpleGrid>

          <ChartPanel title="Top class types · all time">
            <SrChartTable
              caption="Most-attended class types"
              head={["Class", "Times attended"]}
              rows={topTypes.map((t) => [t.className, t.count])}
            />
            <Chart.Root maxH="64" chart={typesChart}>
              <BarChart data={typesChart.data} layout="vertical" responsive>
                <CartesianGrid
                  stroke={typesChart.color("border.muted")}
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  stroke={typesChart.color("border")}
                  tickLine={false}
                  allowDecimals={false}
                />
                <YAxis
                  type="category"
                  dataKey={typesChart.key("className")}
                  stroke={typesChart.color("border")}
                  tickLine={false}
                  width={96}
                />
                <Tooltip
                  cursor={false}
                  animationDuration={100}
                  content={<Chart.Tooltip />}
                />
                {typesChart.series.map((s) => (
                  <Bar
                    key={s.name}
                    dataKey={typesChart.key(s.name)}
                    fill={typesChart.color(s.color)}
                    radius={4}
                  />
                ))}
              </BarChart>
            </Chart.Root>
          </ChartPanel>
        </Stack>
      )}
    </Stack>
  );
}
