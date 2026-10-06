# Chakra and shadcn coexist during an incremental migration

The move from Chakra to shadcn is done surface by surface, not in one change.
A foundation step adds Tailwind, shadcn/Base UI and the theme tokens **next to**
the Chakra provider, with CSS cascade layers ordered so neither reset breaks the
other; each surface (app shell and sign-in, pool details, schedule and class
detail, auto-book, training log, stats) is then migrated on its own, leaving a
working, deployable app after every step; a final step deletes the Chakra
provider, packages and Chakra-only code. Every step stays reviewable and the
preview stays usable.

## Considered Options

- **Big-bang rewrite**: one diff over every UI file. No period where two style
  systems ship together (a larger bundle while migrating), but no intermediate
  working state, and too large to review or bisect.

## Consequences

- Until the final step the bundle carries both Chakra and Tailwind/Base UI; a
  half-migrated main branch is expected, not a mistake.
- The final step is the only one allowed to remove the Chakra provider; it must
  prove no `@chakra-ui/*` or `@emotion/*` import or dependency remains.
