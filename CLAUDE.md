@AGENTS.md

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

## Design Context

This is a **product** surface (app UI serves the task). Strategy, users,
brand personality, and anti-references live in `PRODUCT.md`; the visual
system (palette, typography, components) lives in `DESIGN.md`. Read both
before building or changing any UI.

Design principles (from `PRODUCT.md`): **Truthful by default** ·
**Set once, forget** · **Energy without gamification** · **Thumb-first** ·
**Glanceable progress**.

## Agent skills

### Issue tracker

Issues and specs live in the repository's GitHub Issues (`gh`). See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the root. See `docs/agents/domain.md`.
