---
type: anti-pattern
severity: medium
affected_files:
  - packages/cli/src/cli/commands/edit.tsx
standards_docs:
  - packages/cli/.ai-docs/standards/e2e/user-journeys.md
date: 2026-10-22
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  edit.tsx's activeEntriesOf lists a global install the project masks without its own copy of the
  skill on the old side, read from the installed global config as the selection holds it
  (globalInstallsHiddenHere). Pinned by "says nothing changed and exits 0 for the configuration
  already installed, where its own skill hides a global one in their one-skill category" in
  edit-from-says-what-it-did.test.ts and its e2e twin in e2e/commands/edit-from.e2e.test.ts, each
  beside a control with no mask; both were red before the fix.
---

## What Was Wrong

Re-applying the configuration a project was installed from is not a no-op when one of the project's
own skills masks a global skill in an exclusive category. `edit --from <same id>` asks again, and
without a terminal it refuses where it should print `No changes made.` and exit 0.

Reproduction, through `dist/`, with a fake home:

1. At home, install a global configuration naming React, Vitest and Hono.
2. In a project, `init --from` a configuration naming E2E Zustand (project, `web-tester`) and E2E
   Pinia (global, `api-developer`). Both are in "Client State Management", which allows one. The
   project's `config.ts` records `{ id: '…-web-state-pinia', scope: 'global', origin: 'eject',
excluded: true }`, a mask, beside the project's Zustand.
3. Run `edit --from` with the same id, without a terminal. It exits 1 with the no-terminal refusal.
   At a terminal it asks "Apply this configuration?" over a panel that marks nothing as changing.
   After a yes, "Changes:" prints `+ E2E Pinia [G]`.

A temporary trace of `planChanges` (removed afterwards) showed
`addedSkills: ["…-web-state-pinia"]` and every other field empty. `activeEntriesOf` drops the
masked global from the old side (`!s.excluded`), while the held selection carries it active, so
`detectConfigChanges` reads it as arriving every time.

Controls from the same run:

- The same project configuration in a project with no global install exits 0 with
  `No changes made.`
- A configuration naming only the project's Zustand, in a second project under the same home,
  hits the same mask (Pinia is global there too) and refuses the same way. It is the same case,
  not a control.

## Fix Applied

None. Discovery only: the no-op path itself is correct, and changing what counts as a change is
outside the confirm-screen lane.

## Proposed Standard

A spec that re-applies an installed configuration over a project whose `config.ts` holds a mask,
asserting `No changes made.` and exit 0, beside the control without a mask. Either
`activeEntriesOf` keeps a masked global on the old side where the selection holds it active, or
`detectConfigChanges` compares the masks too. Which one is cli-developer's call once the spec is
red.
