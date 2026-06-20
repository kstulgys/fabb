"use client";

import { HStack, Icon, Span } from "@chakra-ui/react";
import { LuHeart } from "react-icons/lu";

/**
 * A class's intensity drawn as filled hearts in the status-red palette
 * (theme-aware in light and dark). The row carries a single `aria-label` so a
 * screen reader hears the count once, not once per heart; an unrated class (0)
 * shows a muted em dash, never a red mark.
 *
 * The one shared rendering for the calendar, the class detail, and the training
 * log, so intensity reads identically everywhere — Lucide glyphs throughout, no
 * raw emoji (which ignores the theme and varies by platform).
 */
export function Intensity({ value }: { value: number }) {
  if (value <= 0) {
    return (
      <Span role="img" aria-label="Intensity not rated" color="fg.muted">
        —
      </Span>
    );
  }
  return (
    <HStack
      gap="0.5"
      role="img"
      aria-label={`Intensity ${value} of 5`}
      colorPalette="red"
      color="colorPalette.solid"
    >
      {Array.from({ length: value }, (_, i) => (
        <Icon key={i} boxSize="3.5">
          <LuHeart fill="currentColor" />
        </Icon>
      ))}
    </HStack>
  );
}
