---
type: missing-standard
severity: medium
affected_files:
  - e2e/lifecycle/edit-outside-an-install-edits-the-global-one.e2e.test.ts
  - src/cli/lib/config-gate/propagate.ts
standards_docs:
  - CLAUDE.md
date: 2026-10-21
reporting_agent: cli-developer
category: testing
domain: e2e
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  The one control this was found writing adds at project scope, so it holds. The proposed sentence
  for CLAUDE.md's pairing rule has not landed.
---

## What Was Wrong

Journey 40's refusal (an `edit --from` started in a directory holding no installation leaves that
directory byte-identical) owed a control in the same file: the same edit, started in a directory
that DOES hold an installation, writes that installation's own config pair. The obvious control
re-uses the refusal's payload, whose added skill is global-scoped, and asserts that the project's
`config.ts` and `config-types.ts` gained it.

That control cannot fail. A project registered in the global config receives every global change
through `propagateGlobalChangesToProjects`, so its pair gains a global addition whichever
installation the run edited. Measured on 2026-10-21 by a temporary variant of the spec: with the
global-scoped addition applied by an `edit --from` started at HOME, the registered project's
`config.ts` recorded `{ id: <spare>, scope: "global", origin: "eject" }` and its `config-types.ts`
named the id — the same answer an edit of the project gives. A guard that had swallowed its domain
(every edit routed to the global install) would leave such a control green.

## Fix Applied

The control adds the skill at PROJECT scope (`e2eStackPayload({ plus: { [id]: [] }, projectSkills:
[id] })`), which only an edit of the project can write: started at HOME, `edit --from` refuses
project-scoped content (`refuseProjectScopedContentAtHome` in `commands/edit.tsx`). It asserts the
entry at `scope: "project"`, the copy under the project and not under HOME, and the global config
without it. Mutation: removing the project's `.agents-inc/` before the run, so the edit finds only
the global install, reddens it on `config.ts must exist and be loadable` at the project.

## Proposed Standard

`CLAUDE.md` › Test Assertions, in the rule that pairs a refusal with its permitted case: the
permitted case's change must be one only the permitted path can produce. Where the guard decides
which installation a run edits, a global-scoped change is not one, because propagation writes it
into every registered project's pair. No conflict with existing rules found.
