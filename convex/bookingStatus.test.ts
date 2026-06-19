import { describe, expect, test } from "vitest";
import {
  type BookingStatus,
  isHeld,
  isRetriable,
  isTerminal,
} from "./bookingStatus";

const ALL: BookingStatus[] = ["registered", "already", "full", "error"];

describe("isHeld — a confirmed spot", () => {
  test("registered and already hold a spot", () => {
    expect(isHeld("registered")).toBe(true);
    expect(isHeld("already")).toBe(true);
  });
  test("full and error hold nothing", () => {
    expect(isHeld("full")).toBe(false);
    expect(isHeld("error")).toBe(false);
  });
});

describe("isTerminal — a definitive verdict", () => {
  test("a held spot or a full class is terminal", () => {
    expect(isTerminal("registered")).toBe(true);
    expect(isTerminal("already")).toBe(true);
    expect(isTerminal("full")).toBe(true);
  });
  test("only a transient error is non-terminal", () => {
    expect(isTerminal("error")).toBe(false);
  });
});

describe("isRetriable — retry only a transient error", () => {
  test("error is the only retriable status", () => {
    expect(isRetriable("error")).toBe(true);
    expect(isRetriable("registered")).toBe(false);
    expect(isRetriable("already")).toBe(false);
    expect(isRetriable("full")).toBe(false);
  });
  test("retriable is the exact complement of terminal", () => {
    for (const status of ALL) {
      expect(isRetriable(status)).toBe(!isTerminal(status));
    }
  });
});

describe("held vs terminal diverge on full", () => {
  // The distinction the UI and the cron used to re-derive inline: a full class
  // is terminal (the cron won't book it a second time) but NOT held (the UI
  // still lets the User retry it).
  test("full is terminal but not held", () => {
    expect(isTerminal("full")).toBe(true);
    expect(isHeld("full")).toBe(false);
  });
  // The truthful-feedback invariant (CONTEXT.md: Booking status): an error is
  // never a held spot, so no surface can dress it up as success.
  test("error is never held", () => {
    expect(isHeld("error")).toBe(false);
  });
});
