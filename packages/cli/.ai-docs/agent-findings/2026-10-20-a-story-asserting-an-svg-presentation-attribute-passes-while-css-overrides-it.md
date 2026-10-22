---
type: anti-pattern
severity: low
affected_files:
  - packages/ui/src/components/glyph.stories.tsx
  - packages/ui/CLAUDE.md
standards_docs:
  - packages/ui/CLAUDE.md
date: 2026-10-20
reporting_agent: web-tester
category: testing
domain: web
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  The one site is rewritten: `OneGeometryForEveryGlyph` in packages/ui/src/components/glyph.stories.tsx
  reads getComputedStyle on every shape the glyph draws. The rule is not written: packages/ui/CLAUDE.md
  still lists "an attribute" among the claims a story may make without saying that a styling attribute
  is not one, and no lint rule or check catches a new presentation-attribute assertion.
---

## What Was Wrong

`OneGeometryForEveryGlyph` in `packages/ui/src/components/glyph.stories.tsx` asserted the glyph's
stroke with `toHaveAttribute("stroke-width" | "stroke-linecap" | "stroke-linejoin", …)`. SVG
presentation attributes lose to any author CSS on the element, so the attribute is not what draws.
Measured 2026-10-20 in the `storybook` vitest project (Chromium), `glyph.tsx` restored from a backup
after each probe:

- `glyph.tsx` given `className="… [stroke-linecap:round]"` with the attributes kept: the old story
  passed, 5 of 5, over glyphs drawn with round caps.
- `glyph.tsx` with `strokeWidth` moved to `[stroke-width:1.75]` and the cap and join attributes
  dropped (`butt` and `miter` are the CSS initial values, so the drawing is unchanged): the old
  story failed with "Expected the element to have attribute".

So it passed on a regression and failed on a refactor that changed nothing on screen.
`packages/ui/CLAUDE.md` says "A class in the DOM is not proof it takes effect" but says nothing about
attributes, and its Gates section lists "an attribute" among the claims a story may make. Those are
meant to be accessibility attributes, and the text does not say so.

Census of presentation-attribute assertions across every tracked `.ts`/`.tsx` file, before and after:

```
git ls-files '*.ts' '*.tsx' | xargs perl -0777 -ne 'while (/toHaveAttribute\(\s*"((?:stroke|fill|width|height|style|opacity|color|transform|font|viewBox|stop-color|clip|mask|visibility|display)[a-z-]*)"/g) { print "$ARGV: $1\n" }'
```

At HEAD it found this one story (three assertions). In the working tree it finds nothing.

## Fix Applied

The story now reads `getComputedStyle` on every element inside the glyph's `<svg>` and expects
`1.75px`, `butt` and `miter`. Against the two probes above it fails on the round caps (Expected
"butt", Received "round") and passes on the CSS-declared stroke.

## Proposed Standard

In `packages/ui/CLAUDE.md`, under "Gates", "an attribute" should become "an ARIA or state attribute".
The `flex-1` rule should then say that a styling attribute is no more proof than a class: an SVG
presentation attribute loses to CSS, so measure with `getComputedStyle`. This does not conflict with
the repository `CLAUDE.md`. Nothing enforces it, and the census command above is the only check.
