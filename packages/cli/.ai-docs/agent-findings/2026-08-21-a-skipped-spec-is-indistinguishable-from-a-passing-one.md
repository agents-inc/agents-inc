---
type: standard-gap
severity: high
affected_files:
  - e2e/lifecycle/edit-project-source-migration-propagates.e2e.test.ts
  - src/cli/lib/__tests__/spec-gates.test.ts
standards_docs:
  - .ai-docs/standards/e2e/user-journeys.md
date: 2026-08-21
reporting_agent: cli-developer
category: testing
domain: e2e
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  The spec is retargeted at the surviving route and un-skipped, and it is named on journey 7 in
  `user-journeys.md`. `spec-gates.test.ts` now refuses any unconditional `.skip` anywhere under
  `e2e/`, which is the class rather than the instance.
---

## What Was Wrong

A spec covering a real propagation defect was reached through one trigger — the Sources step's bulk
`l` key. That key was withdrawn, and `setInstallMode` grew a refusal for project-context calls
against a global slot. The route the fixture drove was closed **by construction**, so the spec could
no longer reach the defect it was written for, and it was marked `describe.skip` rather than
retargeted.

That is a reasonable decision on its own — repointing a fixture until it goes green reports a repair
that never happened. What was missing is anything that noticed afterwards. Concretely:

- **Nothing in a run distinguishes an unconditional skip from a conditional one.** This suite is
  full of `describe.skipIf(!claudeAvailable)`, so the skipped tally is noise on any machine without
  the Claude CLI. One unconditional `describe.skip` sat inside it and read exactly like coverage.
- **No journey row named the file.** `user-journeys.md` opens by claiming every spec the `e2e`
  project collects belongs to a journey on it, and this one belonged to none — the same class
  already filed as `2026-08-21-five-specs-covered-a-behaviour-the-coverage-matrix-had-no-row-for`.
  A row would have carried the file's state where somebody reads it.
- **The suite's three existing gates all passed over it.** `spec-gates.test.ts` proved the file was
  claimed by a vitest project and that the project was handed to vitest by a package script. Both
  held. Neither says the file RUNS.

It was the only unconditional skip in the whole tree, which is what makes the gap cheap to close and
is also why nobody found it: one file in 234 does not show up in any number anybody reads.

## Fix Applied

**The spec is retargeted and un-skipped**, and it passes. It now drives the narrower route the
authority rules leave legitimate: commit an install-mode change on the PROJECT half of a `[P][G]`
pair — the project's own to configure — then collapse the pair P→G with `s` in the same session, so
the entry is the project's when configured and global when written. The fixture keeps project-b as
the bystander that carries the red.

**The defect it was written for has closed.** `recordGlobalSourceMigrations` no longer writes the
global config raw: it goes through `config-gate::mutateGlobal({ kind: "migrate-skill-sources" })`,
which classifies the change as T1 (`skills.sourceChanged` is non-empty), writes the global half, fans
out to every registered project and recompiles them. Two mutations establish the spec is not
vacuously green — disabling `recordGlobalSourceMigrations` reddens 8 of its 10 assertions, and
returning early from `mutateGlobal` before `applyConsequences` reddens exactly the 5 bystander and
propagation ones while the proof-of-execution pair stays green.

**A fourth gate now refuses the class.** `spec-gates.test.ts` reports any file under `e2e/`
containing `describe.skip(`, `it.skip(` or `test.skip(`. The trailing `(` is what discriminates —
`describe.skipIf(` contains `describe.skip` and must not be reported. `it.todo` is deliberately
outside the gate: it has no body, so nothing about it can be mistaken for coverage, and vitest counts
todos separately.

## Proposed Standard

**A spec may be turned off by a machine it cannot run on, never by its own file.** `skipIf(cond)`
states the condition and a run says so; an unconditional `.skip` runs nowhere, and the tally it
lands in is already full of the legitimate kind.

**When a spec's trigger is removed, it has three honest endings and skipping is not one of them.**
Retarget it at a surviving route; delete it and say so on the journey row; or mark it `it.fails` if
the defect is live and unreachable by any route. All three leave a reader something that moves. A
`describe.skip` leaves a green file and a header nobody opens.

Suggested home: `.ai-docs/standards/e2e/anti-patterns.md`, which already owns "a verdict that cannot
fail". This is the same family one level up — a whole FILE that cannot fail.

**The half this does not close.** The gate catches a spec that has been switched off. It cannot catch
a spec whose fixture no longer reaches the code it names, which is the deeper form of the same
problem and is what actually happened here first. The only thing that catches THAT is what this pass
did by hand: mutate the product at the site the spec claims to cover, and require the red.
