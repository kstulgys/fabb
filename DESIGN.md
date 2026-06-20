---
name: fabb
description: Honest auto-booking and training tracker for the box's group classes
colors:
  teal-solid: "#0d9488"
  teal-fg: "#0c5d56"
  teal-mid: "#14b8a6"
  teal-subtle: "#ccfbf1"
  teal-contrast: "#ffffff"
  ink: "#000000"
  fg-muted: "#52525b"
  fg-subtle: "#a1a1aa"
  surface: "#ffffff"
  surface-subtle: "#fafafa"
  surface-muted: "#f4f4f5"
  border: "#e4e4e7"
  border-emphasized: "#d4d4d8"
  success: "#16a34a"
  info: "#2563eb"
  warning: "#ea580c"
  error-fg: "#ef4444"
  error-solid: "#dc2626"
  error-bg: "#fef2f2"
typography:
  headline:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.0125em"
  title:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
  numeric:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
rounded:
  sm: "0.25rem"
  md: "0.375rem"
  lg: "0.5rem"
  full: "9999px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1.25rem"
  xl: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.teal-solid}"
    textColor: "{colors.teal-contrast}"
    rounded: "{rounded.md}"
    size: "sm"
  button-outline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    size: "sm"
  button-ghost:
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    size: "sm"
  button-danger:
    textColor: "{colors.error-fg}"
    rounded: "{rounded.md}"
    size: "sm"
  card-elevated:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "1.25rem"
  card-outline:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "1.25rem"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
  tab-selected:
    textColor: "{colors.teal-fg}"
    typography: "{typography.label}"
---

# Design System: fabb

## 1. Overview

**Creative North Star: "The Whiteboard"**

Every box runs on a whiteboard: the day's classes and times, who showed up, and
what they actually did. fabb is that whiteboard, digitized and made honest. The
classes it tracks are the **group functional-training classes in the CrossFit
area** of the Fabijoniškės facility (the venue name is just a name — this is not
a swimming app). The job is the same as the board on the wall: tell the truth at
a glance, motivate by real numbers, and never dress up a result.

The system is a cool, near-monochrome canvas — zinc neutrals, generous quiet —
cut by a single disciplined teal accent that marks what's live, what's selected,
and what's confirmed. Energy is carried by **pace, weight, and honest color**,
not by ornament: no confetti, no badge shelves, no streak-guilt. It is sporty
the way a well-kept training log is sporty — through clarity and consistency,
not noise. Built thumb-first, because it's read mid-week on a phone between sets.

This system **explicitly rejects**: pool/water imagery (it's a box, not a pool);
loud gamified fitness apps (Strava / MyFitnessPal badges, confetti, gradient
hero-metric tiles); generic Material / Bootstrap admin dashboards; corporate
SaaS chrome; and the cluttered, dated booking portal fabb exists to replace.

**Key Characteristics:**
- Cool-zinc neutral canvas (`#fafafa` → `#18181b`), one teal accent.
- Inter throughout, one family, fixed rem type scale (no fluid display sizing).
- Flat by default; elevation is restrained and earned, borders do the dividing.
- Mobile-first: a fixed bottom tab bar on phones, a top row on desktop.
- An honest, load-bearing status color contract for every booking outcome.

## 2. Colors

A restrained palette: one teal accent over a cool zinc neutral ramp, plus a
four-hue semantic set that is **functional, not decorative** — it encodes the
booking-status truth.

### Primary
- **Box Teal** (solid `#0d9488`, fg `#0c5d56` light / `#5eead4` dark, mid
  `#14b8a6`): the single accent. Lives on primary actions ("Book now", "Save"),
  the selected tab, the brand mark, focus rings, and held-status accents.
  `teal-subtle` (`#ccfbf1`) tints the rare accent surface. Set once at the app
  root via `colorPalette="teal"`; everything inherits it.

### Neutral
- **Ink** (`#000000` light / `#fafafa` dark): primary text (`fg`).
- **Muted Ink** (`#52525b` light / `#a1a1aa` dark): secondary text, captions,
  helper copy (`fg.muted`). The workhorse — most non-heading text.
- **Subtle Ink** (`#a1a1aa` light / `#71717a` dark): de-emphasized labels (`fg.subtle`).
- **Surface** (`#ffffff` light / `#000000` dark): page background (`bg`). **Panel**
  (`#ffffff` light / `#111111` dark, `bg.panel`) is the header, tab bar, and card.
- **Surface Subtle / Muted** (`#fafafa` / `#f4f4f5` light): zebra rows, hover fills.
- **Border** (`#e4e4e7` light / `#27272a` dark): the primary divider; **emphasized**
  `#d4d4d8` for stronger separation.

### Tertiary — The Status Set
The four booking outcomes map to four hues, and this mapping is a **contract**,
not a style choice (see ADR-0001 / `CONTEXT.md`):
- **Success Green** (`#16a34a`): `registered` — a spot truly confirmed.
- **Info Blue** (`#2563eb`): `already` — already holding a spot.
- **Warning Orange** (`#ea580c`): `full` — terminal, no spot, not an error.
- **Error Red** (fg `#ef4444`, solid `#dc2626`, bg `#fef2f2`): `error` — failed,
  retryable; also the destructive "Sign out" action.

### Named Rules
**The One Voice Rule.** Teal is disciplined: it carries primary action, current
selection, and held status — and stays under ~15% of any screen. Its restraint
is what makes it read as *live*. The **one sanctioned exception**: the Stats tab,
where motivation is the explicit job, may go teal-forward on its headline numbers.
Nowhere else earns a teal-drenched surface.

**The Honest Status Rule.** Status color is load-bearing. Green appears **only**
on a pool-confirmed `registered`; an `error` is **never** shown in green or
dressed as success. Color never travels alone — every status pairs an icon and a
text label, so the truth survives color-blindness and grayscale.

## 3. Typography

**Display / Body / Label Font:** Inter (with `-apple-system, BlinkMacSystemFont,
"Segoe UI", Helvetica, Arial, sans-serif` fallback)
**Mono Font:** SFMono / Menlo / Consolas stack (rare; not currently surfaced)

**Character:** One humanist-geometric sans doing everything — headings, labels,
body, and the big numerals on the Stats tab. A single family keeps a utility app
calm and coherent; contrast comes from weight and size, never from a second face.

### Hierarchy
- **Headline** (semibold 600, 1.5rem / `Heading size="xl"–"2xl"`, lh ~1.2): page
  titles ("Welcome to fabb"). Set `letterSpacing` slightly tight (`-0.0125em`).
- **Title** (semibold 600, ~1.125rem / `Heading size="md"`, lh ~1.3): card and
  section headings.
- **Body** (normal 400, 0.875rem / `Text size="sm"`, lh 1.5): default copy. Cap
  prose at 65–75ch; the dashboard is constrained to `maxW="3xl"`.
- **Label** (medium 500, 0.875rem): form field labels, tab labels, buttons.
- **Numeric** (bold 700, 1.875rem, tight `-0.02em`): Stat values — the
  glanceable progress figures. The one place type is allowed to get loud.

### Named Rules
**The One Family Rule.** Inter only. No display face, no second sans, no
decorative pairing. Hierarchy is weight (400/500/600/700) and size on a fixed
rem scale — never a fluid `clamp()` heading (this is product UI, viewed at
consistent DPI).

## 4. Elevation

Flat by default. Depth is conveyed primarily by **1px borders and tonal
layering** (panel vs. subtle background), not shadow. The sticky header and the
mobile tab bar separate from content with a single `border` line, never a drop
shadow. Shadows appear only on genuinely floating or lifted surfaces.

### Shadow Vocabulary
- **Resting card** (`box-shadow: 0px 2px 4px rgb(24 24 27 / 0.10), 0px 0px 1px rgb(24 24 27 / 0.30)` — Chakra `shadow="sm"`): the `elevated` Card variant only.
- **Overlay** (`shadow="md"` → `0px 4px 8px …`): menus, dialogs, popovers that float above the page.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest. A shadow is a response to
*lift* (a menu, a dialog) or to the `elevated` card — never decoration. If a panel
isn't floating, it gets a border, not a shadow. If it looks like a 2014 admin
console, the shadow is doing work a border should do.

## 5. Components

Built on Chakra UI v3's `defaultSystem` — standard, familiar affordances, tuned
with semantic tokens. The tool should disappear into the task; no invented
controls, no flavor scrollbars.

### Buttons
- **Shape:** gently rounded (`rounded="md"`, 0.375rem). Default `size="sm"`.
- **Primary:** solid Box Teal (`bg teal.solid #0d9488`, white text) for the one
  main action per surface ("Book now", "Save and continue").
- **Outline / Subtle / Ghost:** the secondary ladder — `outline` (border + ink
  text) for ordinary actions, `subtle` for tinted secondary, `ghost` for
  low-emphasis icon and menu triggers.
- **Danger:** `colorPalette="red"` text/ghost for destructive actions ("Sign out").
- **Hover / Focus:** primary darkens toward `teal.700`; all controls take a
  visible teal focus ring (`:focus-visible`). Never remove the focus outline.

### Cards / Containers
- **Corner Style:** `rounded="lg"` (0.5rem).
- **Background:** `bg.panel` (white / `#111`); **outline** variant adds a `border`,
  **elevated** adds `shadow="sm"`.
- **Internal Padding:** ~1.25rem (`p="5"`).
- **Never nest cards.** A card inside a card is always wrong here.

### Inputs / Fields
- **Style:** `Field.Root` + `Input` — 1px `border`, `surface` fill, `rounded="md"`.
- **Label:** medium-weight, above the field. Helper / error text below in
  `fg.muted` / `fg.error`.
- **Focus:** teal border + ring. **Error:** red border, `Field.ErrorText` in red,
  driven by `validatePoolDetails` — never a silently-failing field.

### Navigation — Tab Bar (signature)
- **Mobile:** a **fixed bottom bar** (`position: fixed; bottom: 0`), four icon +
  label tabs (Schedule, Auto-book, Training log, Stats), thumb-reachable. `bg.panel`
  with a top `border`.
- **Desktop:** the same tabs as a static top row.
- **States:** rest `fg.muted`; selected `colorPalette.fg` (teal); hover `bg.muted`.
  Icons are Lucide (`react-icons/lu`), one consistent line style.

### Alert (the truthful feedback surface)
- `Alert.Root status="success | info | warning | error"` carries every booking
  outcome. The status drives the hue per **The Honest Status Rule**; the body
  text states plainly what happened ("Booked!" / "This class is full — no spot
  was booked"). This is where trust is rendered.

### Stat & Badge
- **Stat:** big `numeric` value + muted label — total classes, calories, streak.
  Calm by default; the one place the brand may raise its voice.
- **Badge:** compact, for intensity (hearts) and class-type tags. `subtle`
  variant, low saturation; never a loud full-solid chip on a resting row.

### Brand Mark
- Currently `LuWaves` (teal) + "fabb" wordmark (Inter, `letterSpacing` tight).
  **Note:** `LuWaves` is a water/swim glyph and mismatches the CrossFit-area
  reality — flagged in Don'ts below for a revisit.

## 6. Do's and Don'ts

### Do:
- **Do** keep teal under ~15% of any screen (The One Voice Rule); let the Stats
  tab be the single sanctioned teal-forward moment.
- **Do** pair every booking status with an icon **and** text, never color alone
  (The Honest Status Rule).
- **Do** use one main `button-primary` (solid teal) per surface; everything else
  is outline / subtle / ghost.
- **Do** divide with 1px `border` and tonal layering; reserve shadows for
  floating surfaces and the `elevated` card.
- **Do** keep Inter as the only family; build hierarchy from weight and a fixed
  rem scale.
- **Do** design thumb-first: primary actions reachable, the tab bar fixed at the
  bottom on mobile.

### Don't:
- **Don't** show success the pool didn't confirm — green is for `registered`
  only; an `error` is never dressed as success.
- **Don't** add gamified-fitness flourishes — no badges, confetti rings,
  streak-guilt, or gradient hero-metric tiles (anti-reference: Strava / MyFitnessPal).
- **Don't** drift toward a generic Material / Bootstrap admin look — no default-blue
  boxy card grids with no point of view.
- **Don't** adopt corporate-SaaS chrome or busy toolbars; this is a personal tool.
- **Don't** echo the cluttered, dated booking-portal feel fabb replaces.
- **Don't** use a `clamp()` fluid display heading, a second font family, or
  `background-clip: text` gradient type.
- **Don't** nest a card inside a card, or use a `border-left` color stripe as an
  accent.
- **Don't** keep the `LuWaves` (water) brand glyph as-is — it reads "swimming";
  prefer an activity / strength glyph (e.g. `LuDumbbell`, already used for the
  Training-log tab) that matches the CrossFit-area context.
