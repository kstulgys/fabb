import { describe, expect, test } from "vitest";
import { autoBookable, manualBookable } from "./bookingDecision";

// A Thursday class, 07:00–07:50. Vilnius is UTC+3 in June, so its wall-clock
// window 07:00–07:50 is 04:00Z–04:50Z (the same fixture week.test.ts uses).
const CLASS = { date: "2026-06-18", startTime: "07:00", endTime: "07:50" };

// One instant per ClassStatus the class passes through on its own day.
const UPCOMING = new Date("2026-06-18T03:59:00Z"); // 06:59 Vilnius — before start
const IN_PROGRESS = new Date("2026-06-18T04:20:00Z"); // 07:20 Vilnius — mid-class
const FINISHED = new Date("2026-06-18T05:30:00Z"); // 08:30 Vilnius — after the end

describe("manualBookable — 'Book now' grabs any class that has not finished (ADR-0003)", () => {
  test("allows an upcoming class", () => {
    expect(manualBookable(CLASS, UPCOMING)).toBe(true);
  });

  test("allows a class already in progress", () => {
    expect(manualBookable(CLASS, IN_PROGRESS)).toBe(true);
  });

  test("rejects a finished class", () => {
    expect(manualBookable(CLASS, FINISHED)).toBe(false);
  });
});

describe("autoBookable — AutoBook only books a class still upcoming (ADR-0003)", () => {
  test("allows an upcoming class", () => {
    expect(autoBookable(CLASS, UPCOMING)).toBe(true);
  });

  test("rejects a class already in progress", () => {
    expect(autoBookable(CLASS, IN_PROGRESS)).toBe(false);
  });

  test("rejects a finished class", () => {
    expect(autoBookable(CLASS, FINISHED)).toBe(false);
  });
});

// The load-bearing assertion: the two thresholds agree on upcoming and
// finished and differ ONLY for an in-progress class (manual allows it, auto
// refuses it). A future edit that "unifies the thresholds" — collapsing the two
// predicates into one shared rule — flips exactly this row and fails,
// locking ADR-0003's deliberate divergence in place.
describe("the divergence (ADR-0003) is exactly one status wide: in-progress", () => {
  test("manual and auto agree on upcoming and finished, differ in-progress", () => {
    expect(manualBookable(CLASS, UPCOMING)).toBe(autoBookable(CLASS, UPCOMING));
    expect(manualBookable(CLASS, FINISHED)).toBe(autoBookable(CLASS, FINISHED));
    expect(manualBookable(CLASS, IN_PROGRESS)).not.toBe(
      autoBookable(CLASS, IN_PROGRESS),
    );
  });
});
