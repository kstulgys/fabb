"use client";

import { Card, Flex, SimpleGrid, Skeleton, Stack } from "@chakra-ui/react";

/**
 * Loading placeholders shaped like the content they stand in for, so a tab
 * arrives without a layout jump (product register: skeletons over a spinner in
 * the middle of content). Each mirrors the real surface's structure closely
 * enough that the swap to live data is calm.
 */

/** A stack of card rows — the AutoBook-rules and Training-log lists. */
export function CardRowsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Stack gap="3">
      {Array.from({ length: rows }, (_, i) => (
        <Card.Root key={i} variant="outline">
          <Card.Body>
            <Flex justify="space-between" align="center" gap="3">
              <Stack gap="2" flex="1" minW="0">
                <Skeleton h="4" w="45%" />
                <Skeleton h="3" w="65%" />
              </Stack>
              <Skeleton h="8" w="16" rounded="md" flexShrink="0" />
            </Flex>
          </Card.Body>
        </Card.Root>
      ))}
    </Stack>
  );
}

/** Day groups of class cards — the weekly Schedule. */
export function ScheduleSkeleton() {
  return (
    <Stack gap="6">
      {Array.from({ length: 3 }, (_, d) => (
        <Stack gap="2" key={d}>
          <Skeleton h="4" w="32" />
          <Stack gap="2">
            {Array.from({ length: 2 }, (_, c) => (
              <Card.Root key={c} variant="outline">
                <Card.Body px="4" py="3.5">
                  <Stack gap="2.5">
                    <Flex justify="space-between" gap="3">
                      <Skeleton h="4" w="50%" />
                      <Skeleton h="5" w="14" rounded="md" flexShrink="0" />
                    </Flex>
                    <Skeleton h="3" w="70%" />
                  </Stack>
                </Card.Body>
              </Card.Root>
            ))}
          </Stack>
        </Stack>
      ))}
    </Stack>
  );
}

/** The period toggle, the scoreboard panel, and the chart cards — the Stats tab.
 * Mirrors the same spacing rhythm the live tab uses. */
export function StatsSkeleton() {
  return (
    <Stack gap={{ base: "4", md: "5" }}>
      <Skeleton h="9" w={{ base: "full", sm: "2xs" }} rounded="md" />
      <Skeleton h={{ base: "28", md: "32" }} rounded="lg" />
      <SimpleGrid
        columns={{ base: 1, md: 2 }}
        gap="5"
        mt={{ base: "3", md: "5" }}
      >
        <Skeleton h="56" rounded="lg" />
        <Skeleton h="56" rounded="lg" />
      </SimpleGrid>
      <Skeleton h="64" rounded="lg" />
    </Stack>
  );
}
