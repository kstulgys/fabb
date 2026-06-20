# Plan 001: Replace the water brand glyph with a strength glyph

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: the files below were part of an uncommitted
> redesign on top of commit `29a327a` when this plan was written, so a plain
> `git diff 29a327a..HEAD` will NOT show their current state. Instead, open each
> in-scope file and confirm the "Current state" excerpt matches the live file
> before editing. On a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt (design-system / brand)
- **Planned at**: commit `29a327a`, 2026-06-20 (working tree dirty — see drift check)

## Why this matters

The app's brand mark is `LuWaves` — a water/waves glyph that reads "swimming".
The product is **not** a swimming app: it tracks the group functional-training
classes in the **CrossFit area** of the Fabijoniškės facility. `DESIGN.md`
calls this out explicitly as a Don't (§6): *"Don't keep the `LuWaves` (water)
brand glyph as-is — it reads 'swimming'; prefer an activity / strength glyph
… that matches the CrossFit-area context."* The glyph is the most visible piece
of brand identity (top-left of every screen) and currently contradicts what the
product is. This is a one-icon change that makes the mark honest.

## Current state

- `src/app/app-shell.tsx` — the shared app frame; renders the brand mark in the
  sticky header. The glyph is imported and used here and nowhere else.

Import (`src/app/app-shell.tsx:5`):

```tsx
import { LuWaves } from "react-icons/lu";
```

Usage (`src/app/app-shell.tsx:37-44`):

```tsx
<HStack gap="2">
  <Icon color="teal.fg" boxSize="6">
    <LuWaves />
  </Icon>
  <Heading size="md" letterSpacing="tight">
    fabb
  </Heading>
</HStack>
```

Design constraints to honor (quoted — the executor has not read these docs):

- `DESIGN.md` §5 Brand Mark: the mark is the teal glyph + "fabb" wordmark; it
  suggests `LuDumbbell` as a candidate **but that glyph is already taken** —
  `LuDumbbell` is the Training-log tab icon (`src/app/dashboard/page.tsx:22,79`).
  Do not reuse it for the brand, or the brand and a tab will share an icon.
- `DESIGN.md` §2/§6 "The One Voice Rule": teal is the single accent; the glyph
  stays `color="teal.fg"`. Do not introduce another color.

**Chosen replacement**: `LuBicepsFlexed` (a flexed-arm strength glyph). Verified
present in this project's `react-icons/lu` build. It signals strength/training,
matches the CrossFit context, and does not collide with `LuDumbbell`.

## Commands you will need

| Purpose   | Command            | Expected on success      |
|-----------|--------------------|--------------------------|
| Lint      | `npm run lint`     | exit 0, no errors        |
| Typecheck | `npx tsc --noEmit` | exit 0, no errors        |
| Build     | `npm run build`    | compiles, exit 0         |

Verify the icon exists before editing:

```bash
grep -c "LuBicepsFlexed" node_modules/react-icons/lu/index.d.ts
```
Expected: a number ≥ 1. **If it prints 0**, STOP (see STOP conditions) and fall
back to `LuActivity` (a pulse/activity glyph, also strength-neutral and present
in Lucide) — re-run the grep for `LuActivity` to confirm before using it.

## Scope

**In scope** (the only file you should modify):
- `src/app/app-shell.tsx`

**Out of scope** (do NOT touch):
- `layout.tsx` / `auth-form.tsx` taglines ("Fabijoniškės pool class tracker"):
  the repo deliberately calls the venue "the pool" (see `CONTEXT.md`,
  `PRODUCT.md`) — that is house style, not the swim-imagery problem. Leave the
  copy alone.
- The Training-log tab icon (`LuDumbbell` in `dashboard/page.tsx`).
- Any color, size, or layout of the header.

## Git workflow

- Branch: `advisor/001-brand-glyph` (or the repo's convention if one is evident).
- One commit; message style is conventional commits (see `git log --oneline`,
  e.g. `feat(ui): …`). Suggested: `fix(ui): replace water brand glyph with strength glyph`.
- Do NOT push or open a PR unless the operator asks.

## Steps

### Step 1: Swap the import

In `src/app/app-shell.tsx:5`, change `LuWaves` to `LuBicepsFlexed`:

```tsx
import { LuBicepsFlexed } from "react-icons/lu";
```

### Step 2: Swap the usage

In `src/app/app-shell.tsx` (the `<Icon>` in the header), replace `<LuWaves />`
with `<LuBicepsFlexed />`. Leave the surrounding `<Icon color="teal.fg" boxSize="6">`
exactly as-is.

**Verify (no stale references remain)**:
```bash
grep -rn "LuWaves" src/
```
Expected: **no matches** (exit 1).

### Step 3: Verify the build

**Verify**:
```bash
npm run lint && npx tsc --noEmit && npm run build
```
Expected: all three exit 0; the build compiles with no new type or lint errors.

## Test plan

No React component test harness exists in this repo (no `@testing-library/*` in
`package.json`; `npm test` runs Vitest over `convex/**` only). This change is a
static icon swap with no logic, so verification is lint + typecheck + build
(Step 3) plus a manual visual check: run `npm run dev`, open any page, and
confirm the header shows the new strength glyph in teal beside "fabb".

## Done criteria

ALL must hold:

- [ ] `grep -rn "LuWaves" src/` returns no matches
- [ ] `src/app/app-shell.tsx` imports and renders `LuBicepsFlexed` (or the
      `LuActivity` fallback if the primary was unavailable)
- [ ] `npm run lint` exits 0
- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run build` exits 0
- [ ] No file other than `src/app/app-shell.tsx` is modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report (do not improvise) if:

- The "Current state" excerpt in `app-shell.tsx` no longer matches the live file.
- Neither `LuBicepsFlexed` nor `LuActivity` is present in
  `node_modules/react-icons/lu/index.d.ts` (icon set differs from expectation) —
  report the available `Lu`-strength glyphs instead of guessing.
- `LuWaves` turns out to be imported in more than one file (the grep in Step 2
  finds matches outside `app-shell.tsx`) — that means the mark is used elsewhere
  and the scope is wrong.

## Maintenance notes

- If a dedicated SVG logo is ever introduced, it supersedes this glyph; this
  plan only fixes the interim icon mark.
- A reviewer should confirm the new glyph still reads at `boxSize="6"` and keeps
  the teal accent (no second color introduced).
- The taglines that say "pool" are intentional venue-naming, not part of this
  fix — do not let a follow-up "consistency" pass rename them.
