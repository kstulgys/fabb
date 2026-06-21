import { describe, expect, test } from "vitest";
import { hasEnabledRuleForClass } from "./rule-match";

const rule = (
  over: Partial<{
    weekday: number;
    startTime: string;
    nameMatch: string;
    enabled: boolean;
  }> = {},
) => ({
  weekday: 5,
  startTime: "07:00",
  nameMatch: "TRX",
  enabled: true,
  ...over,
});
const cls = { date: "2026-06-19", startTime: "07:00", name: "TRX" }; // Friday = ISO weekday 5

describe("hasEnabledRuleForClass", () => {
  test("matches an enabled rule on weekday+time+name", () => {
    expect(hasEnabledRuleForClass([rule()], cls)).toBe(true);
  });
  test("ignores disabled rules", () => {
    expect(hasEnabledRuleForClass([rule({ enabled: false })], cls)).toBe(false);
  });
  test("no match on a different time", () => {
    expect(hasEnabledRuleForClass([rule({ startTime: "09:00" })], cls)).toBe(
      false,
    );
  });
});
