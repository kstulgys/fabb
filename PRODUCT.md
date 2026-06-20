# Product

## Register

product

## Users

A person who trains at the Fabijoniškės pool (Fabijoniškių baseinas) and wants
to attend its group classes regularly. They have an app account; the pool itself
has none — it books anonymously, keyed only by email.

Their context is mid-week and mostly on a phone, one-handed, in short glances:
set a recurring class once, check that tomorrow's spot is secured, log what they
did, see whether they're staying consistent. They are not power users tending a
console — they want the chore handled and the history kept for them.

The job to be done: never miss a spot in a popular class that fills up, without
having to remember to re-open the pool's bare website every week — and end up
with a true record of what they trained and how much energy it cost, with no
manual bookkeeping.

## Product Purpose

fabb replaces the pool's account-less, one-week-at-a-time website. A User stores
their Pool details once, then: browses the timetable in a clean calendar, books
a class now or sets an **AutoBook rule** that reserves a recurring weekly class
automatically the day before, accumulates a **Training log** of attended classes
with the pool's published **Calories**, and sees progress — total classes,
calories over time, weekly consistency and streak, top class types.

Success: the User sets their weekly classes once and the history fills itself.
The product earns its place by being trustworthy (a booking the app shows is a
booking the pool actually confirmed) and quiet (the recurring chore disappears).

## Brand Personality

Sporty, energetic, motivating — but the energy is **earned and honest, never
gamified**. Athletic momentum without confetti, badges, or manufactured
urgency. Voice: confident, direct, plain-spoken; it tells the truth about a
booking even when the truth is "full" or "error." Motivation comes from real
progress made visible (a real streak, real calories, real consistency), not from
dopamine tricks.

Emotional goals: **motivated** to keep showing up, **confident** the spot is
genuinely secured, **calm** that it's handled.

## Anti-references

- **Loud gamified fitness apps** (Strava, MyFitnessPal): badges, confetti rings,
  aggressive streak guilt, big gradient hero-metric tiles. fabb motivates with
  honest numbers, not slot-machine feedback.
- **Generic admin / Material dashboards**: boxy default-blue cards repeated
  endlessly, no point of view, every control a stock default.
- **Corporate SaaS**: salesy chrome, busy toolbars, dense marketing-style
  framing. This is a personal tool, not a console being sold.
- **Cluttered booking portals** (including the pool's own dated, crammed site):
  the very experience fabb exists to replace — confusing, ugly, untrustworthy.

## Design Principles

1. **Truthful by default.** Never show success the pool didn't confirm. The
   four-value booking-status vocabulary (registered / already / full / error)
   is sacred; the UI speaks it honestly and blocks re-booking on a held spot.
   Trust is the product.
2. **Set once, forget.** The interface should make a recurring AutoBook rule feel
   effortless and the history feel automatic. Minimize what a User must touch in
   a normal week — the calendar and a glance, not constant management.
3. **Energy without gamification.** Motivate through honest progress, not badges
   or celebration animations. When in doubt, restraint wins; the sporty feel
   lives in confident pace, color, and typography, not in noise.
4. **Thumb-first.** Primary use is mobile, mid-week, one-handed. Reachable
   actions (bottom-tab nav), glanceable stats, no precision-pointer affordances
   on the critical path.
5. **Glanceable progress.** Stats answer "am I consistent / am I improving" in a
   look, not a data dump. Depth is available; the surface stays calm.

## Accessibility & Inclusion

Target **WCAG 2.1 AA**: ≥4.5:1 contrast for body text (≥3:1 for large/bold),
always-visible focus rings, fully keyboard-operable flows. Honor
`prefers-reduced-motion` on every transition with a crossfade or instant
fallback. Booking status must never rely on color alone — pair each of
registered / already / full / error with an icon and text label, so the
truthful-status principle holds for color-blind Users too.
