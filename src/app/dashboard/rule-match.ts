import { isoWeekday } from "../../../convex/week";

type RuleLike = {
  weekday: number;
  startTime: string;
  nameMatch: string;
  enabled: boolean;
};
type ClassLike = { date: string; startTime: string; name: string };

/** True when the User already has an ENABLED auto-book rule that resolves to this class. */
export function hasEnabledRuleForClass(
  rules: RuleLike[],
  cls: ClassLike,
): boolean {
  const weekday = isoWeekday(cls.date);
  return rules.some(
    (r) =>
      r.enabled &&
      r.weekday === weekday &&
      r.startTime === cls.startTime &&
      r.nameMatch === cls.name,
  );
}
