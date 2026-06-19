# Calorie range stored as two columns, invariant owned by the calories module

Calories are an all-or-nothing (min, max) range, but they stay stored as two
independent optional columns (`kcalMin`, `kcalMax`) on `classes` and
`trainingLogs` rather than a single `v.optional(v.object({ min, max }))` column.
The all-or-nothing invariant, the parse/read/write/midpoint/format behaviour,
and the null-exclusion rule are owned by the `convex/calories` value module,
which every read and write goes through — so the invariant holds in practice
without the storage shape enforcing it. Collapsing to one object column would
make the invariant structural but requires a schema migration and a backfill of
existing `trainingLogs`; we chose the module over the migration because the
module already concentrates every callsite and the deletion test passes on it
alone. Revisit if calories are ever written outside the module.
