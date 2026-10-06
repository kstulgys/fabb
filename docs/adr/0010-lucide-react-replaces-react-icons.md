# lucide-react replaces react-icons

The app switches its icons from `react-icons/lu` to `lucide-react` and drops
`react-icons`. Both render the same Lucide glyphs (DESIGN.md already mandates
Lucide), and every vendored shadcn component imports `lucide-react`, so one icon
package serves app code and components alike and `shadcn add` output needs no
local patch.

## Considered Options

- **Keep `react-icons/lu`**: no icon renames in app code (`LuHeart` → `Heart`),
  but either two icon packages for one glyph set, or a hand edit on every
  vendored shadcn component, repeated on each `shadcn add`.
