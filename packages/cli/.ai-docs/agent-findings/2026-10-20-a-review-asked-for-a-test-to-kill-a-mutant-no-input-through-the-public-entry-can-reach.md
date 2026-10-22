---
type: standard-gap
severity: low
affected_files:
  - apps/editor/src/features/configure/lib/output-preview.ts
standards_docs:
  - .ai-docs/standards/briefing.md
date: 2026-10-20
reporting_agent: web-developer
category: testing
domain: web
root_cause: missing-rule
status: open
---

## What Was Wrong

A review of `output-preview.ts` found two hand-served mutants in `projectTypesExtras` that survived
every unit test: `stackCategories` returning no categories, and the global config's
`selectedDomains` dropped. It asked the test file's owner for a test that pins both inputs. No such
test can exist. `projectTypesExtras` is reached only through `buildOutputPreview`, and on the clean
machine that function models, neither input can add anything:

- Every stack category is the catalogue category of a placed skill (`assignedStackOf` in
  `packages/compile/src/seed-to-config.ts`), so it is already in `deriveCategories(extraSkillIds)`.
- `globalConfigOnCleanMachine` merges onto `blankGlobalConfig()`. That leaves the global
  `selectedDomains` a filtered subset of the payload's (`withTheDomainsItAdds` in
  `global-config.ts`), and the project split carries the payload's whole, so the global ones are
  always duplicates that `new Set` removes.

Measured with a seeded probe of 400 random payloads, each built for both providers, served in place
of `output-preview.test.ts` alongside a transform that applies the mutant. 758 of the 800 previews
carry a stack and 730 carry global domains. Both mutants leave every project `config-types.ts`
byte-identical to the unmutated run. The control mutant, which drops `deriveCategories`, changes
2568 lines. Both inputs mirror the CLI's `buildProjectTypesExtras`, where a global config already on
disk can hold entries the session did not add.

Nothing in `briefing.md` or the e2e standards says a surviving mutant must be shown to be killable
through a public entry before a test is asked for. A mutant that is equivalent there needs one of
two remedies: delete the unreachable input, or record that it is kept for parity. It does not need
a test, and an agent briefed to write one either fails or tests a private function.

## Fix Applied

None in code. The two inputs stay as CLI-parity mirrors, and the review finding is answered with
the probe's output rather than a test.

## Proposed Standard

Add one clause to `briefing.md` -> rule 9, or beside the mutation-check text in
`standards/e2e/assertions.md`: a mutation finding that asks for a test must show an input, through
the module's public entry, under which the mutant's output differs. Where none exists, the finding
says "equivalent" and offers deletion or a recorded mirror instead.
