---
type: convention-drift
severity: low
affected_files:
  - .ai-docs/reference/testing/e2e-infrastructure.md
standards_docs:
  - .ai-docs/standards/documentation-bible.md
  - .ai-docs/standards/e2e/README.md
date: 2026-08-06
reporting_agent: cli-developer
category: testing
domain: e2e
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  The `commands/` tree in e2e-infrastructure.md now lists all 42 files and says 42. Verified by
  diffing the block against `ls e2e/commands/*.e2e.test.ts` — exact match, no extras either way.
---

## What Was Wrong

`reference/testing/e2e-infrastructure.md` carries a file-by-file tree of `e2e/commands/`, headed
`# Command (non-interactive) E2E tests — 31 files`. The directory held **42**.

Eleven files existed on disk and in no listing:

```
eject-home-config-pair            init-from-scenarios-curation
eject-preserves-exclusive-stack   init-from-scenarios-install
init-from-agent-scope             init-from-scenarios-tuning
init-from-greenfield              init-from-shared-config
plugin-build-versioning           update-refreshes-registered-projects
update-scope-separation
```

Nothing listed had been deleted — the drift is purely append-side. **The entire `init-from` family
was missing**, six files including the one this session added, which is how it was noticed: adding
a 42nd file to a list that claims 31 makes an already-false list falser.

This is the exact failure `standards/e2e/README.md` names about its own `STEP_TEXT` roster:

> An exhaustive list that is short is worse than a glob, because it reads as authoritative.

A reader looking for existing `--from` coverage before writing a new spec would have found none
listed and concluded there was none.

## Fix Applied

Inserted the eleven entries in the tree's own grouping convention — base file first, then its
variants, which is why the block is not in plain `sort` order — and corrected the count to 42.
Verified by diffing the extracted block against the directory listing: exact match both ways.

## Proposed Standard

The count and the tree are two statements of the same fact, and both rot the same way: silently, on
every added file, with no gate that notices. Prose cannot fix that — the rule "update the tree when
you add a spec" already exists implicitly and was followed zero times out of eleven.

Two options, in preference order:

1. **Generate the block.** A `scripts/` check that regenerates the tree from the directory and fails
   when it differs, in the same family as `generate:types:check`. The per-file trailing comments are
   the only hand-written part; they could live in a sidecar map keyed by filename, or be preserved
   by only regenerating the file lines. This is the only option that cannot drift.
2. **Drop the exhaustive tree** and keep the count plus the notable-files table. A glob that says
   "see the directory" is honest; a stale list is not.

Either is better than a third pass of manual reconciliation, which is what this finding is.

**The sibling block has the same drift, measured.** `interactive/` in the same document claims
**54 files**; `ls e2e/interactive/*.e2e.test.ts` returns **56**. It is left alone here deliberately —
this session added nothing to that directory, so correcting its tree would be a second unrelated
reconciliation rather than keeping a list true that I was making falser. It is the strongest
argument for option 1: two of two exhaustive trees in this document are wrong, in the same
direction, by different amounts.
