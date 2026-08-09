---
type: convention-drift
severity: medium
affected_files:
  - .ai-docs/reference/boundary-map.md
  - .ai-docs/reference/dependency-graph.md
  - .ai-docs/reference/features/plugin-system.md
  - .ai-docs/reference/features/skills-and-matrix.md
  - .ai-docs/reference/features/configuration.md
  - .ai-docs/reference/config/config-writer.md
  - .ai-docs/reference/concepts/scope-system.md
  - .ai-docs/standards/skill-atomicity-bible.md
  - .ai-docs/reference/testing/e2e-infrastructure.md
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-07
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: enforcement-gap
status: open
---

## What Was Wrong

D-210 deleted `src/cli/commands/validate.ts` and folded its four passes into `doctor`.
Nine `.ai-docs` files outside the commands reference still name that command or that file,
in three kinds:

| Kind                                     | Examples                                                                                                                                                                                            |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A path that no longer exists             | `boundary-map.md` (rows for `commands/validate.ts`, `Validate.validateRegistryPlugins()`), `dependency-graph.md` (two rows), `plugin-system.md` § "`validate` Plugins Pass", `skills-and-matrix.md` |
| A count my change invalidated            | `boundary-map.md`: "**Seven** commands override `static baseFlags = {}`" — now six                                                                                                                  |
| A user-facing instruction that now fails | `skill-atomicity-bible.md` checklist: `npx agents-inc validate` (twice) — exits 127                                                                                                                 |

The prose mentions in `configuration.md`, `config-writer.md` and `scope-system.md` ("neither
`doctor` nor `validate` checks config semantics") are a fourth kind: still _true_ about the
behaviour, but they now describe one command as two, and the sentence loses its point when
the reader cannot find the second.

This is the third recurrence of the same class. `2026-08-01-reference-docs-name-identifiers-that-no-longer-exist.md`
and `2026-07-30-negative-exhaustiveness-claims-in-reference-docs-go-stale-silently.md` both
recorded it. Nothing catches it because nothing can: a doc naming a deleted symbol is a
plain string in Markdown, invisible to `tsc`, ESLint and the test suite alike.

## Fix Applied

None — out of scope for D-210, which named three docs to update (`README.md`, the www
commands page, `.ai-docs/reference/commands/index.md`; all three done). This finding is the
sweep list, with the locations already resolved so the sweep is mechanical rather than a
re-investigation.

## Proposed Standard

Two things, in this order:

1. A **runnable check**, in `.ai-docs/standards/documentation-bible.md` and wired into the
   same place the other doc gates live: every `src/cli/**` path appearing in a fenced path,
   a table cell or an inline code span inside `.ai-docs/**` must exist on disk. That is a
   `glob` plus a `fs.existsSync` and it would have caught six of the nine files here. It
   cannot catch the prose mentions or the count, but those are the minority.

2. A line in the **delete checklist** — wherever `commit-protocol.md` covers removing a
   command: _deleting a command means grepping `.ai-docs/` for its name and its file path
   before the commit, not after._ The count in `boundary-map.md` is the tell that a
   command's removal has doc consequences beyond its own section.
