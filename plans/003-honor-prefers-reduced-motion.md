# Plan 003: Honor `prefers-reduced-motion` app-wide

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `src/app/globals.css` is committed at `29a327a`;
> the dashboard files referenced as motion sources were uncommitted on top of it.
> Open `src/app/globals.css` and confirm the "Current state" excerpt matches the
> live file before editing. On a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: accessibility
- **Planned at**: commit `29a327a`, 2026-06-20 (working tree dirty — see drift check)

## Why this matters

`PRODUCT.md` "Accessibility & Inclusion" sets an explicit target: *"Honor
`prefers-reduced-motion` on every transition with a crossfade or instant
fallback."* The app currently honors it **nowhere** — a repo-wide search for
`prefers-reduced` / `reduceMotion` returns zero hits. Meanwhile the UI animates
in several places: class-row hover/active transitions
(`src/app/dashboard/week-calendar.tsx:65` — `transition="background-color 0.15s…"`),
the full-screen dialog/sheet reveal (`motionPreset="slide-in-bottom"` in
`class-detail.tsx:364` and `training-log.tsx:391,462`), and Chakra's own
component transitions. Users who set "reduce motion" at the OS level (vestibular
sensitivity, etc.) still get the full motion. A single global CSS guard fixes the
whole surface at once and meets the stated WCAG 2.1 AA goal.

## Current state

- `src/app/globals.css` — intentionally minimal; Chakra's `defaultSystem`
  provides the reset and theme. This is the right place for one global a11y rule.

`src/app/globals.css` (entire file):

```css
/* Chakra UI's `defaultSystem` provides the reset and theme. Keep this minimal. */
html,
body {
  margin: 0;
  padding: 0;
}
```

- `src/app/layout.tsx:2` already imports this file (`import "./globals.css";`),
  so anything added here is global. No wiring needed.

Constraint (quoted): `PRODUCT.md` — *"Honor `prefers-reduced-motion` … with a
crossfade or instant fallback."* The standard, well-tested approach is to clamp
animation/transition durations to ~0 under the media query (instant fallback),
which satisfies the requirement without per-component changes.

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Lint      | `npm run lint`     | exit 0, no errors   |
| Build     | `npm run build`    | compiles, exit 0    |

## Scope

**In scope**:
- `src/app/globals.css`

**Out of scope**:
- Per-component `transition` / `motionPreset` props — do NOT remove or rewrite
  them; the global guard neutralizes them under the media query while leaving
  normal motion intact for everyone else.
- Any JS-driven animation logic.

## Git workflow

- Branch: `advisor/003-reduced-motion`.
- One commit; conventional-commit style. Suggested:
  `feat(a11y): honor prefers-reduced-motion globally`.
- Do NOT push or open a PR unless asked.

## Steps

### Step 1: Add the reduced-motion guard

Append to `src/app/globals.css` (keep the existing rules; add below them):

```css
/* PRODUCT.md a11y: honor prefers-reduced-motion with an instant fallback.
   Clamps all animation/transition durations to ~0 for users who request
   reduced motion, without removing motion for everyone else. */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

### Step 2: Verify build + that the rule is present and scoped

**Verify**:
```bash
npm run lint && npm run build && grep -c "prefers-reduced-motion" src/app/globals.css
```
Expected: lint and build exit 0; grep prints `1`.

## Test plan

No component test harness exists (no `@testing-library/*`; `npm test` is Vitest
over `convex/**`). CSS media queries aren't exercised by the backend suite.
Verify manually:

1. `npm run dev`.
2. Enable "Reduce motion" at the OS level (macOS: System Settings → Accessibility
   → Display → Reduce motion; or in Chrome DevTools: Rendering panel →
   "Emulate CSS media feature prefers-reduced-motion: reduce").
3. Open a class in the schedule → the detail sheet should appear **without** the
   slide-in animation; hovering a class card should change color instantly.
4. Disable the emulation → motion returns to normal.

## Done criteria

ALL must hold:

- [ ] `grep -c "prefers-reduced-motion" src/app/globals.css` prints `1`
- [ ] The existing `html, body { margin/padding }` rule is still present
- [ ] `npm run lint` exits 0
- [ ] `npm run build` exits 0
- [ ] No file other than `src/app/globals.css` is modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- `globals.css` no longer matches the "Current state" excerpt (e.g. someone
  already added motion rules — review before duplicating).
- The build fails with a CSS parse error after adding the block (means the file
  is processed by a stricter pipeline than plain CSS — report it).

## Maintenance notes

- This is a blunt, global instant-fallback. If a specific transition later needs
  a *crossfade* instead of an instant cut under reduced motion (also allowed by
  `PRODUCT.md`), add a targeted rule for that component; the global guard remains
  the baseline.
- Reviewer: confirm the `!important` clamp doesn't fight any intentional
  always-on motion (there is none in scope today).
