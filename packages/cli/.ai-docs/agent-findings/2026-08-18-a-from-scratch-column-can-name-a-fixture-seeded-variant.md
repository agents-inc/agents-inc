---
type: standard-gap
severity: medium
affected_files:
  - .ai-docs/standards/e2e/user-journeys.md
  - e2e/lifecycle/stack-per-agent-curation.e2e.test.ts
  - e2e/lifecycle/edit-remove-one-of-many-skills-stack-cleanup.e2e.test.ts
  - e2e/lifecycle/edit-remove-last-skill-stack-cleanup.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/user-journeys.md
date: 2026-08-18
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: enforcement-gap
status: partial
partial_note: >-
  The defect is dead and the CHECK this finding proposed is built; what remains is a spec that
  does not exist. Landed — journey 9's coverage column states that none of its three named specs
  is from-scratch, and rule 1's "cheap enforcement" is now real: `src/cli/lib/__tests__/spec-gates.test.ts`
  reads the From-scratch column off `user-journeys.md` and fails any row whose every named spec
  begins from a fixture-written config while carrying a marker other than TO TEST, judging on the
  call shapes in `FIXTURE_SEED_CALLS` and `FROM_SCRATCH_INSTALLS` rather than on a substring.
  Rule 2 is mechanical through the same gate and needs no prose. Pending, and it is a test to be
  written rather than a rule: journey 9 still has no from-scratch spec — no run installs a stack
  through the wizard and then curates it, which is why the row reads TO TEST. Running the gate
  condemned three further rows nobody had read; that is recorded in
  2026-08-18-the-from-scratch-gate-condemned-three-rows-nobody-had-read.md, which does not
  supersede this one — its own note still names the journey 9 spec neither has written.
---

## What Was Wrong

`user-journeys.md` defines a from-scratch spec as one that "starts with nothing on disk at the
relevant scope, drives the real binary … and asserts observable output", and says outright that a
spec beginning from a `ProjectBuilder`-written config is a **variant** — "never sufficient to
prove the journey is reachable".

Journey 9 ("A stack's picks are editable — deselect a stack skill, select a non-stack one") names
three specs in its From-scratch column. All three begin from a fixture-written config:

| Spec                                           | How it starts                                         |
| ---------------------------------------------- | ----------------------------------------------------- |
| `lifecycle/stack-per-agent-curation`           | `ProjectBuilder.editable({ skills, agents, stack })`  |
| `edit-remove-one-of-many-skills-stack-cleanup` | `buildProjectConfig(...)` + `writeProjectConfig(...)` |
| `edit-remove-last-skill-stack-cleanup`         | `buildProjectConfig(...)` + `writeProjectConfig(...)` |

Each drives a real `cc edit` afterwards, which is why they read as strong specs — but the state
they edit was written by a factory, not installed by the CLI. Under the page's own rule the row
has no from-scratch proof, and its `PARTIAL — surface 4 TO TEST` understated the gap: adding
surface 4 to a variant strengthens the variant and closes nothing.

The general shape: the From-scratch column is prose, and nothing checks that a spec named in it is
one. Journey 9 was found by reading the three files; there is no reason to think it is the only
row where the column and the file disagree, and the same reading is the only way to find the next
one.

## Fix Applied

Journey 9's coverage column now records that none of the three is from-scratch, names the fixture
call in each, and states what the row actually needs — a spec that installs a stack through the
wizard and then curates it. No assertion was bolted onto any of the three: doing so would have
moved the row's marker without moving its proof, which is the failure the marker exists to
prevent.

## Proposed Standard

Two rules, in `.ai-docs/standards/e2e/user-journeys.md` beside "What from-scratch means":

1. **A row citing a spec in the From-scratch column asserts that the file contains no
   fixture-written starting state.** The concrete test is mechanical: the spec must not call
   `ProjectBuilder.*`, `writeProjectConfig`, `buildProjectConfig` or `createLocalSkill` before the
   run under test. Name those symbols in the doc — "starts with nothing on disk" is true of a temp
   directory a fixture then fills.

2. **A row whose named specs are all variants is TO TEST, not PARTIAL.** PARTIAL means "a
   from-scratch spec exists but does not assert all four surfaces". A row with no from-scratch
   spec at all is the TO TEST case, and calling it PARTIAL makes the missing proof read as a
   missing assertion — a much smaller job than the one actually owed.

A cheap enforcement exists for rule 1: `src/cli/lib/__tests__/spec-gates.test.ts` already asserts
every spec file on disk is claimed by a project. The same gate could parse the From-scratch column
and fail when a named file imports a fixture builder, which turns the audit from a re-read of
every spec into a test run.
