# 11 · Stats dashboard

**Type:** AFK · **Label:** `ready-for-agent`

## Parent

`docs/prd/0001-pool-class-autobook-and-tracking.md`

## What to build

A User sees their progress. Convex aggregation queries run over their **Training
logs** (attended only) and feed Chakra UI charts:

- total classes attended and total **Calories** for a chosen period (week / month / all-time)
- Calories over time
- classes-per-week and current streak (the consistency signal)
- top class types

Calories totals use the **midpoint** of each log's range; a log with no Calories
is excluded from calorie totals but still counts as an attended class.

## Acceptance criteria

- [ ] A period toggle (week / month / all-time) updates the totals
- [ ] The Calories total sums range midpoints; null-calorie logs are excluded but the class is still counted as attendance
- [ ] A Calories-over-time chart renders
- [ ] Classes-per-week and current streak are shown
- [ ] Top class types are shown
- [ ] `convex-test` covers the aggregation math, including null-calorie exclusion and streak calculation

## Blocked by

- 09 · Manual Training log + history
