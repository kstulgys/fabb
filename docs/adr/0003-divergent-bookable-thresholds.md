# Divergent bookable thresholds for manual vs auto booking

"Book now" lets a User book a class until it has finished (any non-finished
class, including one in progress), while an AutoBook rule only books a class
that is still upcoming and gives up once it has started. This divergence is
deliberate: a manual click is a User explicitly choosing to grab a spot in a
class that may already be underway, whereas a day-before AutoBook retry firing
after the class has started is almost never wanted and risks booking the wrong
thing — so the two triggers carry two named thresholds (`manualBookable` vs
`autoBookable` in `convex/bookingDecision.ts`), not one. Unifying them was the
considered alternative; rejected because it would either forbid a legitimate
late manual booking or let the cron book a class already in progress.
