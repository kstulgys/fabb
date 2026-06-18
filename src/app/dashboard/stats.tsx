"use client";

import { Chart, useChart } from "@chakra-ui/charts";
import {
  Box,
  Button,
  Flex,
  Heading,
  SimpleGrid,
  Spinner,
  Stack,
  Text,
} from "@chakra-ui/react";
import { useQuery } from "convex/react";
import { useState } from "react";
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

/** The three totals scopes, matching `stats.summary`'s `period` arg. */
type Period = "week" | "month" | "all";

const PERIOD_LABELS: Record<Period, string> = {
  week: "This week",
  month: "This month",
  all: "All time",
};

/** One headline figure. Three lockstep call sites (classes / calories / streak)
 * share this shell so they stay visually identical. */
function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Box borderWidth="1px" borderRadius="md" p="4">
      <Text color="fg.muted" fontSize="xs" textTransform="uppercase" letterSpacing="wide">
        {label}
      </Text>
      <Heading size="2xl" mt="1">
        {value}
      </Heading>
    </Box>
  );
}

/** A titled chart panel. */
function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Box borderWidth="1px" borderRadius="md" p="4">
      <Heading size="sm" mb="3">
        {title}
      </Heading>
      {children}
    </Box>
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
  const summary = useQuery(api.stats.summary, { period });

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
    series: [{ name: "count", color: "purple.solid" }],
  });

  return (
    <Stack gap="4">
      <Box>
        <Heading size="md">Your progress</Heading>
        <Text color="fg.muted" fontSize="sm" mt="1">
          Stats from the classes you attended. Calories use each class&apos;s
          published range midpoint; classes without a range still count as
          attendance.
        </Text>
      </Box>

      {summary === undefined ? (
        <Flex justify="center" py="6">
          <Spinner />
        </Flex>
      ) : topTypes.length === 0 ? (
        <Text color="fg.muted" fontSize="sm">
          No attended classes yet. Your stats appear once you log a class you
          went to.
        </Text>
      ) : (
        <Stack gap="6">
          <Stack direction="row" gap="2">
            {(["week", "month", "all"] as const).map((p) => (
              <Button
                key={p}
                size="sm"
                variant={p === period ? "solid" : "outline"}
                colorPalette="teal"
                onClick={() => setPeriod(p)}
              >
                {PERIOD_LABELS[p]}
              </Button>
            ))}
          </Stack>

          <SimpleGrid columns={{ base: 1, sm: 3 }} gap="3">
            <StatCard
              label={`Classes (${PERIOD_LABELS[period].toLowerCase()})`}
              value={String(summary.totals.classes)}
            />
            <StatCard
              label={`Calories (${PERIOD_LABELS[period].toLowerCase()})`}
              value={Math.round(summary.totals.calories).toLocaleString()}
            />
            <StatCard
              label="Current streak"
              value={
                summary.streak === 1
                  ? "1 week"
                  : `${summary.streak} weeks`
              }
            />
          </SimpleGrid>

          <SimpleGrid columns={{ base: 1, md: 2 }} gap="4">
            <ChartCard title="Calories over time">
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
            </ChartCard>

            <ChartCard title="Classes per week">
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
            </ChartCard>
          </SimpleGrid>

          <ChartCard title="Top class types">
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
          </ChartCard>
        </Stack>
      )}
    </Stack>
  );
}
