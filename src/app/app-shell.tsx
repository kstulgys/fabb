"use client";

import { Box, Container, Flex, Heading, HStack, Icon } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { LuBicepsFlexed } from "react-icons/lu";
import { ColorModeButton } from "@/components/ui/color-mode";

/**
 * The shared app frame: a sticky header carrying the brand, a page-supplied
 * `actions` slot, and the light/dark toggle, above a width-constrained content
 * area. Sets `colorPalette="teal"` once at the root so the whole app inherits
 * the accent — individual components only set a palette when they override it to
 * a status colour (success / warning / error).
 */
export function AppShell({
  children,
  actions,
  maxW = "3xl",
}: {
  children: ReactNode;
  actions?: ReactNode;
  maxW?: string;
}) {
  return (
    <Box colorPalette="teal" minH="100dvh" bg="bg">
      <Box
        as="header"
        position="sticky"
        top="0"
        zIndex="sticky"
        bg="bg.panel"
        borderBottomWidth="1px"
        borderColor="border"
      >
        <Container maxW={maxW} py="3">
          <Flex align="center" justify="space-between" gap="3">
            <HStack gap="2">
              <Icon color="teal.fg" boxSize="6">
                <LuBicepsFlexed />
              </Icon>
              <Heading size="md" letterSpacing="tight">
                fabb
              </Heading>
            </HStack>
            <HStack gap="1">
              {actions}
              <ColorModeButton />
            </HStack>
          </Flex>
        </Container>
      </Box>
      <Container maxW={maxW} py={{ base: "5", md: "8" }}>
        {children}
      </Container>
    </Box>
  );
}
