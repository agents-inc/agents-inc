---
type: convention-drift
severity: medium
affected_files:
  - .ai-docs/reference/types/operations-types.md
  - .ai-docs/reference/features/operations-layer.md
  - .ai-docs/reference/features/compilation-pipeline.md
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-19
reporting_agent: codex-keeper
category: architecture
domain: cli
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  Both drifted pages corrected in this pass. `types/operations-types.md` now declares
  `propagation: GateReport` in its `ConfigWriteResult` block, points
  `recompilePropagatedProjectAgents` at `GateReport.propagated.updated`, and names the config
  gate as its only caller. `features/operations-layer.md` corrects its type row and states the
  absence of both removed fields in one sentence. The general rule — "Result fields must have a
  producer" — is now in that document's Design Conventions, which is where the
  `globalConfigPath` finding had been asking for it since 2026-07-30.
---

## What Was Wrong

`ConfigWriteResult` in `src/cli/lib/operations/project/write-project-config.ts` carries
`propagation: GateReport`. It has no field named `propagatedProjects`, and `propagatedProjects`
does not appear anywhere in `src/`, `e2e/` or `scripts/`.

Three reference documents named it. Census over the tree, before this pass:

```
git grep -nF "propagatedProjects" HEAD -- packages/cli/.ai-docs/ packages/cli/src/ \
  packages/cli/e2e/ packages/cli/scripts/
```

Nine hits in six files. Two files are `agent-findings/` entries, which are dated evidence and
correctly frozen. Of the three reference pages, **one carried the correction and two carried the
defect**:

| Page                               | What it said                                                                                  |
| ---------------------------------- | --------------------------------------------------------------------------------------------- |
| `features/compilation-pipeline.md` | "There is no `ConfigWriteResult.propagatedProjects` field — the result carries `propagation`" |
| `features/operations-layer.md`     | A type row listing `… filesWritten, propagatedProjects`                                       |
| `types/operations-types.md`        | Three hits, one of them a full code block DECLARING `propagatedProjects: string[]`            |

The code block is the worst of the three, because it is the shape a reader copies. Its own doc
comment described the field as "registered project directories whose config was rewritten … the
caller recompiles them" — and the prose immediately beneath it already described
`propagation: GateReport` correctly. One page contradicted itself across a blank line.

**A fourth claim on the same page was false for the same reason.** "`init.tsx` and `edit.tsx` each
early-return on an empty list before calling `recompilePropagatedProjectAgents`" — no command calls
that function. Its only caller is the lazy import in `src/cli/lib/config-gate/recompile.ts`; the
gate does the recompile itself and the commands hand `configResult.propagation` to
`reportPropagatedRecompile` on `BaseCommand`, which returns without printing when
`propagated.updated` is empty.

```
grep -rn "recompilePropagatedProjectAgents" packages/cli/src --include='*.ts' --include='*.tsx'
```

## Fix Applied

Four corrections across the two drifted pages, and the general rule the earlier finding proposed
is now written into `features/operations-layer.md`'s Design Conventions.

## Proposed Standard

For `.ai-docs/standards/documentation-bible.md` — a sharpening of
[A Name in a Document Is a Claim About Source](../standards/documentation-bible.md), not a new
rule beside it:

> **A symbol-drift table in a finding is a report of where the sweep LOOKED, not of where the
> symbol is.** `2026-08-18-config-docs-named-nine-symbols-the-source-does-not-have.md` names
> `ConfigWriteResult.propagatedProjects` in exactly one page — `features/compilation-pipeline.md`
> — and that is the page that had already been corrected. The pass was scoped to the
> configuration and code-generation documents, so the two pages that still asserted the phantom
> field were outside it, and the row reads as the whole population of the defect. Before writing
> a row like that, run the grep over the whole doc tree rather than over the pass's own scope,
> and say in the row how many pages the name appears on and how many of those are corrections.

> **A page that states an absence and a page that asserts the thing are indistinguishable to a
> grep.** `grep -rn "propagatedProjects" .ai-docs/` returns a correction and a defect on adjacent
> lines, so the hit list cannot be read as a worklist — every hit has to be opened. The corollary
> for a sweep that leaves negative statements behind ("carries **no** `X`") is that it has made
> the next sweep's grep noisier, and should say which hits are deliberate.

This does not conflict with any NEVER rule in either `CLAUDE.md`. The counts above are a census
over the four trees named in the command, not a sample.
