---
type: convention-drift
severity: medium
affected_files:
  - todo/cli.md
  - todo/ROADMAP.md
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-16
reporting_agent: cli-developer
category: dry
domain: cli
root_cause: enforcement-gap
status: open
---

## What Was Wrong

One defect was recorded in the tracker under two IDs. Only one of them was deleted when the fix
landed, and the survivor was later re-promoted to a go-live blocker and dispatched for
implementation against already-shipped code.

The defect: a skill's `metadata.yaml` category never reached `marketplace.json`. It was recorded as
**CLI-386** (`todo/cli.md`, row and detail section) and again as **CLI-481**. Commit `4885e5ae`
(2026-08-10) fixed it — `PluginManifest` gained the field, then `generateSkillPluginManifest`, then
`convertManifestToMarketplacePlugin`, with `src/schemas/plugin.schema.json` regenerated in the same
commit because it carries `additionalProperties: false`. That commit also converted the recorded
`it.fails("carries a category on every plugin entry")` back to a plain `it`.

CLI-481 was then deleted from the tracker and archived (`todo/archive.md`), exactly as the
repository's "an item is deleted when it lands" law requires. CLI-386 was not, because nothing
connects two rows that describe one defect. Six days later `todo/ROADMAP.md` sequenced the orphan as
`Ready for Dev` and leg-1 blocking, on the reasoning that EDITOR-30's grid groups by category.

The consequence is that the row's own evidence had gone stale in a way that reads as authoritative.
It states that "an `it.fails` spec pins it" — that marker had not existed for six days. A developer
following the row looks for a red test, finds a green one, and has no way to tell from the tracker
whether the fix landed or the test was weakened. The two findings that recorded this defect carried
`status: open` against already-shipped code for the same reason; CLI-493 tracked re-statusing them,
and both have since been removed from `agent-findings/`, so nothing on disk still claims the
category never reaches `marketplace.json`.

## Fix Applied

None — discovery only, and deliberately so. The code is correct and needs no change; verification is
recorded below. The stale rows live in `todo/cli.md` and `todo/ROADMAP.md`, which the owner curates
and which were already staged-modified during this session, so editing them from a sub-agent would
have collided with in-flight curation.

Verified the emission rather than trusting the green test, in three independent ways:

1. **Mutation.** Neutralising the category spread in `convertManifestToMarketplacePlugin` turned
   exactly one spec red — `carries a category on every plugin entry` — with
   `expected [ undefined, undefined, …(8) ] to not include undefined`. The assertion is live, not
   vacuous. The mutation was reverted to a byte-identical file (`git diff` empty).
2. **Hand-run.** `build plugins` then `build marketplace` over a copy of the real skills source
   emitted 238 plugins, **0** without a category, across 102 distinct categories. The command's
   own breakdown prints real category names instead of the `uncategorized: <all>` the row predicts.
3. **Schemas.** `marketplace.schema.json` and `plugin.schema.json` both already declare `category`,
   so no regeneration was owed.

## Proposed Standard

Two rules, both for `documentation-bible.md` (the tracker-hygiene section that already owns
"a count lives in exactly one document"):

1. **A defect gets exactly one tracker row.** When an ID is renumbered or a duplicate is discovered,
   the superseded row is deleted immediately and the survivor records the retired ID inline — the
   convention `todo/cli.md` already uses for CLI-386 and CLI-385 ("was CLI-367, renumbered"). The
   failure here was not the renumber note; it was that two rows for one defect were allowed to
   coexist, so archiving one left the other looking live.

2. **A row that cites a test as its evidence names the file and the marker, and landing the fix
   deletes every row citing it.** CLI-386's evidence was "an `it.fails` spec pins it" with no path.
   Had it named `e2e/commands/plugin-build-versioning.e2e.test.ts`, a one-line grep at
   roadmap-promotion time would have shown the marker gone and stopped the dispatch. This is
   cheaper than a checker and needs no new tooling.

Worth considering, though it is a larger change: `ROADMAP.md` is regenerated from the trackers at
each pass and re-promoted this row without re-reading its evidence. A promotion step that greps each
cited artifact before sequencing a row as blocking would have caught it. Recording the option here
rather than proposing it, since the roadmap's generation process is owned elsewhere.
