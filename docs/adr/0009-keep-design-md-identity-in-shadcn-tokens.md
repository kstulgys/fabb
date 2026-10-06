# Keep the DESIGN.md identity, expressed as shadcn tokens

The refactor changes the component library, not the look. The DESIGN.md
identity — one teal accent over zinc neutrals, Inter only, flat by default, the
fixed bottom tab bar on phones, and the four-hue **Honest Status** set
(green only for `registered`, blue `already`, orange `full`, red `error`, each
paired with an icon and text) — is mapped into shadcn's CSS variables
(`--primary`/`--ring` teal, zinc neutrals) plus added status tokens, in light
and dark. The status colors are a product contract (PRODUCT.md "Truthful by
default"), so they cannot be left to a stock theme. DESIGN.md is rewritten in the
new vocabulary with the same rules.

## Considered Options

- **Stock shadcn neutral theme**: less custom CSS, but a black primary, no
  accent, and no status palette — the brand and the status contract would need a
  redesign the Request did not ask for.
