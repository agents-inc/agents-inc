---
type: audit
severity: medium
affected_files:
  - .ai-docs/standards/e2e/user-journeys.md
  - src/cli/lib/__tests__/spec-gates.test.ts
  - e2e/lifecycle/edit-global-agent-removal-propagation.e2e.test.ts
  - e2e/lifecycle/edit-global-source-toggle-propagation-compiled-ref.e2e.test.ts
  - e2e/commands/source-revalidation.e2e.test.ts
  - e2e/commands/edit-from.e2e.test.ts
  - e2e/interactive/edit-from.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/user-journeys.md
date: 2026-08-18
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: enforcement-gap
status: partial
partial_note: >-
  The gate has landed and the record is corrected — four rows now carry the TO TEST marker their
  named specs earn. What is pending is code, and it is four separate specs: a from-scratch proof
  for journeys 7, 9, 22 and 31. Each row states what the missing run is.
---

## What Was Wrong

`2026-08-18-a-from-scratch-column-can-name-a-fixture-seeded-variant.md` read journey 9's three
named specs by hand, found all three began from a fixture-written config, and closed with: "there
is no reason to think it is the only row where the column and the file disagree, and the same
reading is the only way to find the next one." This finding records what happened when the check
it proposed was built and run; it does not replace it, and that finding's `partial_note` still
names the journey 9 spec neither has written.

It was not the only row. Building the mechanical check it proposed and running it against the page
condemned four rows, three of which nobody had read:

| Row | Marker it carried    | Every named spec, and how it starts                                                                                                                                   |
| --- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7   | `COVERED`            | `edit-global-agent-removal-propagation`, `edit-global-source-toggle-propagation-compiled-ref` — `buildProjectConfig` + `writeProjectConfig`, then `EditWizard.launch` |
| 9   | `PARTIAL`            | the three the predecessor named                                                                                                                                       |
| 22  | `PARTIAL by subject` | `commands/source-revalidation` — `writeProjectConfig`, then `search`                                                                                                  |
| 31  | `PARTIAL`            | `commands/edit-from`, `interactive/edit-from` — `ProjectBuilder.editable`, then `runEditFrom`                                                                         |

Journey 7 is the one that matters most: it read **COVERED**, on all four surfaces, for an arc no
run has ever performed end to end. Every surface is asserted and each is asserted against a state
a factory wrote — so the row's four ticks describe the strength of a variant while the page's
vocabulary reserves COVERED for a from-scratch spec.

## Fix Applied

`src/cli/lib/__tests__/spec-gates.test.ts` — the file that already proves every spec is claimed by
a project and every project by a script — now reads the From-scratch column off the page and fails
when a row whose every named spec begins from a fixture carries a marker other than TO TEST. Two
details are load-bearing:

- **The judgement reads BOTH lists, not just the fixture calls.** A file that seeds a config in one
  leg and installs from nothing in another still carries the proof the column claims for it:
  `commands/share` writes one of its five specs from `ProjectBuilder.editable` and installs the
  other four through `init --from`. A check that condemned any file mentioning a fixture builder
  would have wrongly condemned journeys 29 and 34.
- **A mention is not a call.** `lifecycle/uninstall-from-scratch-scopes` and
  `integration/eject-customization-recompile` each name `ProjectBuilder` in a JSDoc explaining that
  they deliberately do NOT use it. A substring scan condemns both; matching the call shape does not.

The four rows now carry `TO TEST`, each stating which fixture call disqualifies its named specs and
what run would close it. No assertion was added to any named spec: strengthening a variant moves a
marker without moving a proof, which is the failure the marker exists to prevent.

## Proposed Standard

The predecessor finding's rule 2 is now mechanical and needs no restating. Its rule 1 — naming the fixture
symbols in the page — is superseded by the gate: the symbol list lives in `spec-gates.test.ts` as
`FIXTURE_SEED_CALLS` and `FROM_SCRATCH_INSTALLS`, where it is executed rather than read, and a
second copy in prose could only drift from it.

What remains unwritten is the rule for **adding an entry point**. Both lists are closed sets of call
shapes, and a new way to install from nothing — a fourth runner beside `InitWizard.launch*`,
`CLI.run(["init"…])` and `runInitFrom` — makes every spec that uses it look like a variant, which
fails the gate loudly rather than silently. That is the right direction to fail, but the fix must be
to extend `FROM_SCRATCH_INSTALLS`, not to reword a row. Say so beside the constant, and in
`user-journeys.md` under "What from-scratch means" as a one-line pointer at the gate.
