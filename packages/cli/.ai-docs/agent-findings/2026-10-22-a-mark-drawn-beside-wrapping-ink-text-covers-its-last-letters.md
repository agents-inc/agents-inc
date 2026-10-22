---
type: anti-pattern
severity: low
affected_files:
  - src/cli/components/common/skill-agent-summary.tsx
  - src/cli/commands/list.tsx
  - src/cli/components/common/summary-panel.tsx
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-10-22
reporting_agent: cli-developer
category: architecture
domain: web
root_cause: convention-undocumented
status: partial
partial_note: >-
  Fixed in `SkillRow` and in `list`'s header rows (`HeaderRow`), pinned at 80 and 100 columns by
  `e2e/interactive/list-keeps-long-names-whole.e2e.test.ts` and in-process at 80 by
  `list-shows-the-installation.test.ts`. Open in `PanelHeader` (`summary-panel.tsx`), whose
  Marketplace and Stack rows still let the label shrink.
---

## What Was Wrong

`list` at a real terminal lost letters and split its labels on long values, while every spec stayed
green because no spec drew a long name. Two Ink layout shapes did it:

- **A mark drawn as a sibling after wrapping text.** `SkillRow` put the name in one `<Text>` and the
  ⏏ in a second `<Text>` beside it in a row `<Box>`. The name wrapped at the cell's width, and the
  mark was then drawn over the name's last one or two letters: "Hugging Face Inferenc ⏏",
  "acme-release-checklis ⏏". The count of covered letters always equalled how far name plus mark
  overran the cell.
- **A label `<Text>` beside a long value, in a row `<Box>`.** Both texts shrink, so the label goes
  first: the gap after it disappears ("Marketplace/home/…"), then it splits ("Marketplac" / "e").

A third shape rides along: Ink wraps with `wrap-ansi` in hard mode, which moves a word that fits a
whole line onto the next line rather than splitting it, so a prefix and a long name in one text
left the bullet alone on its line at 100 columns.

Search for the label shape, run over every Ink component:
`grep -rn -A2 'flexDirection="row" columnGap={1}' src/cli --include='*.tsx' | grep -B1 -A1 bold`
finds `list.tsx` (fixed) and `PanelHeader` in `summary-panel.tsx` (Marketplace and Stack), and
nothing else.

## Fix Applied

`SkillRow` puts the mark inside the name's own `<Text>`, so it wraps after the last letter, and
gives the prefix its own `flexShrink={0}` box, so a long name wraps under itself. `paddingRight={1}`
keeps a name that fills its half from running into the next. `list`'s Mode and Marketplace rows go
through a `HeaderRow` whose label sits in a `flexShrink={0}` box. `PanelHeader` is not changed: its
file belongs to the lane building the confirm-screen panel.

## Proposed Standard

In an Ink row, anything that must never be covered or split (a label, a prefix, a mark) either sits
in its own `flexShrink={0}` box or travels inside the text it belongs to. Only the one value that may
wrap is left free to shrink. A spec for a frame that shows user-named content pins it with a value
longer than its column, at the narrowest width the CLI draws at, because short fixtures hide every
one of these shapes.

This does not conflict with any CLAUDE.md rule.

## Correction

`paddingRight={1}` did not keep a name that fills its half off the next one. Where a half starts
or ends mid-column, a name draws up to two columns past it, and the second column landed on the
table's border. For `list` that was one width in three from 82 columns, and for the summary panel
every width congruent to 2 mod 3, 80 included. The 100-column pin missed it because neither of its
names filled the right half. `SkillRow` now pads by three columns, and the pin's second name fills
the right half. The mechanism is in
`2026-10-22-ink-draws-a-text-up-to-two-columns-past-a-box-that-starts-or-ends-mid-column.md`.
