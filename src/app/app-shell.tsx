"use client";

import {
  Box,
  Container,
  Flex,
  Heading,
  HStack,
  Icon,
  IconButton,
} from "@chakra-ui/react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { LuBicepsFlexed, LuInfo } from "react-icons/lu";
import { ColorModeButton } from "@/components/ui/color-mode";
import { DisclaimerDialog } from "./disclaimer-dialog";

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
  const [aboutOpen, setAboutOpen] = useState(false);
  useEffect(() => {
    if (localStorage.getItem("fabb.disclaimerSeen") !== "1") {
      // First visit only: open the disclaimer once. Reading localStorage must
      // happen in an effect (not a lazy initializer) to stay SSR-safe.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAboutOpen(true);
      localStorage.setItem("fabb.disclaimerSeen", "1");
    }
  }, []);
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
              <IconButton
                aria-label="About this app"
                variant="ghost"
                size="sm"
                onClick={() => setAboutOpen(true)}
              >
                <LuInfo />
              </IconButton>
              <ColorModeButton />
            </HStack>
          </Flex>
        </Container>
      </Box>
      <Container maxW={maxW} py={{ base: "5", md: "8" }}>
        {children}
      </Container>
      <DisclaimerDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </Box>
  );
}
