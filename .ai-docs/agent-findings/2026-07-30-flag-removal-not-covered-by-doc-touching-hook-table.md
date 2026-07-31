---
type: standard-gap
severity: medium
affected_files:
  - src/cli/commands/uninstall.tsx
  - .ai-docs/reference/commands/index.md
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-07-30
reporting_agent: codex-keeper
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: 'Fix Applied and both halves of the proposed standard landed, the standards half on the same day the finding was filed. Verified 2026-07-30 in `standards/documentation-bible.md`: the "Doc-Touching Changes" hook row is widened to command-signature level verbatim — "Command **or its public signature** added / deleted / renamed (`src/cli/commands/**`) — includes any change to `static flags`, `static baseFlags`, `static args`, `static aliases`" — which also closes the adjacent cases the finding named (a `char` change, a flag moving between `flags` and `baseFlags`, an arg becoming required). And the Command Reference Docs checklist gained item 4, "Diff every documented flag/arg row against the command''s `static flags` / `static baseFlags` / `static args`", carrying the finding''s severity argument that a documented flag which no longer parses is a hard error rather than staleness. The `reference/commands/index.md` correction, including the explicit `--all` removal callout, is the shape the checklist item now prescribes.'
---

## What Was Wrong

`documentation-bible.md` -> "Doc-Touching Changes (Feature / Rename / Deletion Hooks)" tells you to grep and update `commands.md` when a **command** is added, deleted or renamed:

| Change                                                    | Doc(s) to grep + update                                 |
| --------------------------------------------------------- | ------------------------------------------------------- |
| Command added / deleted / renamed (`src/cli/commands/**`) | `commands.md`, `dependency-graph.md`, `boundary-map.md` |

It says nothing about a **flag** being added or removed on a command that still exists. So when 0.145.0 removed `uninstall --all` as a documented breaking change, no hook fired, and `reference/commands/index.md` kept advertising the flag for a full release cycle across two versions (0.145.0 and 0.146.0).

This is the worst class of documentation drift, because it is not merely incomplete — it is actively wrong in a way an agent cannot detect by reading the doc. An agent following the doc would emit `agentsinc uninstall --all`, which oclif rejects as an unknown flag. Compare a stale prose paragraph, which at worst leaves an agent under-informed.

The same gap covers the adjacent, equally invalidating cases the current row misses:

- a flag's `char` (short form) changing
- a flag moving between `static flags` and `static baseFlags`, or a command starting/stopping overriding `baseFlags = {}` (bible rule 1 in "Command Reference Docs" already cares about this, but nothing schedules the re-check)
- an arg becoming required/optional
- a command's exit code for a given failure changing

## Fix Applied

Documentation only. Corrected `reference/commands/index.md`: removed the `--all` row, added an explicit breaking-change callout naming the removal, and rewrote the `uninstall` section against the current source. Also re-verified `static flags` / `static baseFlags` for every command in `src/cli/commands/**` in the same pass; no other flag-table drift was found.

The standards gap itself is NOT fixed — `documentation-bible.md` is owned by convention-keeper, so this finding records the rule that should be added rather than editing that file.

## Proposed Standard

Widen the hook-table row in `documentation-bible.md` -> "Doc-Touching Changes" from command-level to **command-signature-level**:

| Change                                                                                                                                                                             | Doc(s) to grep + update                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Command **or its public signature** added / deleted / renamed (`src/cli/commands/**`) — includes any change to `static flags`, `static baseFlags`, `static args`, `static aliases` | `commands.md`, `dependency-graph.md`, `boundary-map.md` |

And add a fourth item to the "Command Reference Docs (`commands.md`)" checklist in the same file:

> 4. **Diff every documented flag/arg row against the command's `static flags` / `static baseFlags` / `static args`.** A documented flag that no longer parses is a hard error, not staleness — treat it with the same severity as a documented file path that does not exist. A removed flag MUST leave behind an explicit callout naming the removal (and the replacement behaviour, if any), not just a deleted table row: agents and users carry the old invocation in muscle memory and need to be told it is gone.

Rationale for the callout requirement: silently deleting the row makes the doc self-consistent but leaves anyone who already knows the old flag with no signal. The `> **`--all` removed (D-274, breaking).**` block now in `commands/index.md` is the intended shape.
