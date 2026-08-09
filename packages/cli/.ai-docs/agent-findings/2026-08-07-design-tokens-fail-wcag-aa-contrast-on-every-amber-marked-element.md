---
type: audit
severity: medium
affected_files:
  - packages/ui/src/styles/globals.css
  - packages/ui/src/components/chip.tsx
  - packages/ui/src/components/badge.tsx
  - packages/ui/src/components/matrix-grid.tsx
  - packages/ui/src/components/lattice.tsx
  - packages/ui/.storybook/preview.ts
date: 2026-08-07
reporting_agent: web-tester
category: testing
domain: web
root_cause: missing-rule
status: open
---

## What Was Wrong

The first axe run the design system has ever had — `@storybook/addon-a11y` in
`error` mode across all 47 stories — failed 13 of them. Every single failure is
`color-contrast`, and every one comes from a design token rather than from
anything a component does wrong. Measured in real Chromium against the real
stylesheet:

| foreground                           | background                | ratio      | needs | where                                          |
| ------------------------------------ | ------------------------- | ---------- | ----- | ---------------------------------------------- |
| `--color-brand-ink` `#a06a1c`        | `--color-wash` `#f7eeda`  | **3.97:1** | 4.5:1 | every amber-marked chip, badge and matrix cell |
| `--color-muted-foreground` `#7a7669` | `--color-badge` `#f8f7f3` | **4.23:1** | 4.5:1 | the state badge at its default value           |
| `--color-band-dim` `#8f8b7d`         | the stuck band `#2d2c2a`  | **4.09:1** | 4.5:1 | a filter chip at rest on the stuck filter bar  |
| ink at `opacity-40`                  | `--color-cell` `#ffffff`  | **2.4:1**  | 4.5:1 | the dimmed incompatible lattice cell           |

The first row is the important one. Amber-on-wash is not an incidental
combination — it is _the_ accent rule of the whole design language: "a badge
goes amber precisely when it holds a non-default value", "amber is reserved for
what the user actually chose". So the single pair that fails hardest is the one
the design uses to mark everything the user deliberately did. It appears in 8 of
the 13 failures.

The last row is a deliberate decision meeting an accessibility floor. Dimming is
the design's whole signal for an incompatible skill — "shown but disabled, never
hidden" — and `opacity-40` composites the label down to 2.4:1, well under half
the required ratio. The text stays on screen and stops being readable, which is
the outcome hiding it was meant to avoid.

None of the 13 failures is structural. There are no missing labels, no
unnamed controls, no bad roles anywhere in the 11 components. The palette is the
entire finding.

## Fix Applied

None to the components or tokens — out of scope for EDITOR-01, which was
explicitly not to modify the components, and a palette is a design decision
rather than a test decision.

What was applied is a scoped gate in `packages/ui/.storybook/preview.ts`: axe
runs in `error` mode so that structural violations fail the suite, with
`color-contrast` held out and the reason written beside it. Verified both ways —
an unlabelled `<input>` added temporarily to a story fails the run, and the
contrast gap does not.

The alternative was the addon's default `test: "todo"`, which reports in the
Storybook UI and fails nothing. That would have left _all_ of axe non-gating in
order to tolerate one rule, so the whole a11y addon would have been decoration
in CI.

## Proposed Standard

This belongs with the design work that owns the palette — EDITOR-07 (dark mode
and the undesigned surfaces), EDITOR-09 (rebuild from the newer design files)
and WWW-01, which already share the token set. The rule to record:

> **A colour pair that carries meaning has to survive a contrast check before it
> becomes a token.** Accent colours are the ones that get chosen for how they
> read against the surface at large sizes and then applied to 7–9px mono
> uppercase labels, where the ratio requirement is unchanged and the type is
> thinner.

Two specifics worth carrying into that work:

1. **Amber-on-wash needs about 13% more darkening.** `#a06a1c` on `#f7eeda`
   reaches 4.5:1 at roughly `#96631a`. That is a small enough move to test
   against the design rather than a repalette.
2. **`opacity-40` is not a contrast-safe way to disable text.** The dimmed cell
   should reach its dimmed appearance through a token whose ratio is known,
   rather than through an alpha multiplier that composites to whatever it
   composites to. Dimming the _border and background_ while keeping the label
   at a legible ink is the usual answer and preserves the design's signal.

The re-enabling condition is written into the held-out rule: when the tokens
land, delete the `rules` entry in `preview.ts` and the 47 stories become a
standing contrast gate for free.
