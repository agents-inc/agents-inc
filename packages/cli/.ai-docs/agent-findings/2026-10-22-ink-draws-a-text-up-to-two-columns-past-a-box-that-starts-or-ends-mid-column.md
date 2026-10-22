---
type: anti-pattern
severity: low
affected_files:
  - src/cli/components/common/skill-agent-summary.tsx
  - src/cli/components/common/skill-agent-summary.test.tsx
  - e2e/interactive/list-keeps-long-names-whole.e2e.test.ts
  - src/cli/lib/__tests__/commands/list-shows-the-installation.test.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-10-22
reporting_agent: cli-developer
category: architecture
domain: web
root_cause: missing-rule
status: resolved
resolved_by: >-
  `SkillRow` pads each half by `NAME_GUTTER_COLUMNS` (3). Pinned red-then-green by the 100-column
  case of `e2e/interactive/list-keeps-long-names-whole.e2e.test.ts`, whose second name now fills
  the right half, and by the 80-column bare-table case in `skill-agent-summary.test.tsx`.
---

## What Was Wrong

`SkillRow` gave each half of the Skills table `paddingRight={1}`, to keep a name that fills its half
off the next name. At some widths a long name in the right half still drew over the table's `│`.
`list` dropped the border at one width in three from 82 columns (82, 85, 88, …, every width
congruent to 1 mod 3), and the bare table and the summary panel at every width congruent to 2 mod
3, 80 included. Census: a sweep of every width from 60 to 260 over three layouts (`list`'s
`paddingX={1}`, the bare table, the panel's border and `paddingX={2}`) and four skill lists.

The mechanism is Yoga's pixel-grid rounding of a node that has a measure function, which is every
Ink `<Text>`. Ink sizes the Skills column by `flexGrow` 2:1 and each half at 50%, so a half's edges
land mid-column. Yoga rounds a box's edges to the nearest column, but rounds a text node's left
edge down and its right edge up, so the text is up to two columns wider than the space it was laid
out in. Ink then wraps the text at that wider width and draws it from the sum of its ancestors'
rounded positions, not from the floored edge. A name's last line can therefore end two columns past
its half. One column of padding absorbed one of them; the second landed on the border.

The 100-column pin could not see it, because neither of its long names filled the right half. A
whole-frame pin catches this only where a long name sits in a half whose edges are fractional at
the pinned width, so which width you pin matters, not only how long the name is.

A second effect of the same rounding remains: Yoga measures a text's height at the fractional
width and Ink draws it at the wider one, so a name that needs one more line at the narrower width
leaves a blank line under it. Example: `acme-release-checklist-for-every-service` in the right half
of the bare table at 80 columns. No letter is lost and nothing is drawn over.

## Fix Applied

`SkillRow` pads by `NAME_GUTTER_COLUMNS = 3`: up to two columns absorb the rounding and the third
always stays blank. A name never reaches the next name or the border. Sweep after the fix: 0 of
2,412 renders lose the border, a letter, or the blank column before the next name. The built
`list` was run at every width from 80 to 160 on two installations (162 runs) with the same result.

The suggested alternative, wrapping the name's `<Text>` in `<Box flexGrow={1} flexShrink={1}
flexBasis={0}>` and keeping one column of padding, was swept too. It kept the border at 88, 100
and 112, but it still lost it in 15 of the 2,172 renders from 80 to 260, e.g. `list` at 82 and 85
and the panel at 86. Yoga sometimes stretches the text to the wrapper's fractional width, and the
rounding then applies again.

Siblings, from these two searches:

```
grep -rn -E 'width="[0-9]+%"|flexBasis="[0-9]+%"' src/cli/components src/cli/commands
grep -rln -E 'flexGrow=\{[2-9]\}' src/cli/components src/cli/commands
```

The only fractional cell is `SkillRow`; the `100%` widths sit in boxes that start and end on whole
columns. The Agents column also starts mid-column, so a long agent name draws one column past the
table's right edge. Both callers have right padding there that absorbs it (`list`'s
`paddingX={1}`, the panel's `paddingX={2}`). Only the bare table, which nothing in production
draws, shows it.

## Proposed Standard

An Ink `<Text>` that can fill a box whose edges may land mid-column (a percentage width, or a
`flexGrow` split) needs two columns of room past its last letter before anything else is drawn:
padding, not a sibling. A spec that pins such a frame pins it at a width where those edges are
fractional, with a value long enough to fill the box beside the neighbour it must not cover. For
this table, one pin is not enough. The fractional width depends on what surrounds the table:
`list` and the panel have different ones at the same terminal width.

This does not conflict with any CLAUDE.md rule.
