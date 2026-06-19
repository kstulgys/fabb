import { describe, expect, test } from "vitest";
import {
  type CalorieRange,
  format,
  fromColumns,
  midpoint,
  requirePair,
  toColumns,
} from "./calories";

describe("requirePair — untrusted parse of user input", () => {
  test("both bounds → a range", () => {
    expect(requirePair(300, 450)).toEqual({ min: 300, max: 450 });
  });

  test("neither bound → null (Calories left blank)", () => {
    expect(requirePair(undefined, undefined)).toBeNull();
  });

  test("a lone minimum throws the all-or-nothing message", () => {
    expect(() => requirePair(300, undefined)).toThrow(
      "Enter both a minimum and maximum calorie figure, or leave both blank.",
    );
  });

  test("a lone maximum throws the same message", () => {
    expect(() => requirePair(undefined, 450)).toThrow(
      "Enter both a minimum and maximum calorie figure, or leave both blank.",
    );
  });
});

describe("fromColumns — tolerant read of trusted/stored columns", () => {
  test("both columns → a range", () => {
    expect(fromColumns({ kcalMin: 300, kcalMax: 450 })).toEqual({
      min: 300,
      max: 450,
    });
  });

  test("a lone column coerces to null (never throws on trusted data)", () => {
    expect(fromColumns({ kcalMin: 300 })).toBeNull();
    expect(fromColumns({ kcalMax: 450 })).toBeNull();
  });

  test("no columns → null", () => {
    expect(fromColumns({})).toBeNull();
  });
});

describe("toColumns — write a range back to the two columns", () => {
  test("a range → both columns", () => {
    expect(toColumns({ min: 300, max: 450 })).toEqual({
      kcalMin: 300,
      kcalMax: 450,
    });
  });

  test("null → an empty object (omits both columns)", () => {
    expect(toColumns(null)).toEqual({});
  });

  test("round-trips with fromColumns", () => {
    const range: CalorieRange = { min: 200, max: 400 };
    expect(fromColumns(toColumns(range))).toEqual(range);
    expect(toColumns(fromColumns({ kcalMin: 200, kcalMax: 400 }))).toEqual({
      kcalMin: 200,
      kcalMax: 400,
    });
    // The tolerant tier the conversion cron relies on: a lone trusted bound
    // collapses to {} rather than throwing.
    expect(toColumns(fromColumns({ kcalMin: 200 }))).toEqual({});
  });
});

describe("midpoint — null-safe average for stats", () => {
  test("averages a range", () => {
    expect(midpoint({ min: 300, max: 450 })).toBe(375);
  });

  test("is null when absent — never zero", () => {
    expect(midpoint(null)).toBeNull();
  });
});

describe("format — display string", () => {
  test("a present range uses an EN DASH (U+2013)", () => {
    expect(format({ min: 300, max: 450 })).toBe("300\u2013450 kcal");
  });

  test("absent defaults to the compact EM DASH (U+2014)", () => {
    expect(format(null)).toBe("\u2014");
  });

  test("absent honours a custom placeholder", () => {
    expect(format(null, "No published calories")).toBe("No published calories");
  });
});
