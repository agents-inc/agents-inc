---
type: standard-gap
severity: high
affected_files:
  - packages/compile/src/selection.ts
  - packages/compile/src/selection.contract.test.ts
  - packages/matrix/src/contract/selection-scenarios.ts
  - packages/cli/src/cli/lib/matrix/selection-scenarios.contract.test.ts
  - apps/editor/src/features/configure/lib/derive.contract.test.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-08-26
reporting_agent: web-tester
category: testing
domain: shared
root_cause: enforcement-gap
status: partial
partial_note: >-
  The missing runner landed — `packages/compile/src/selection.contract.test.ts`, 21 tests, and its
  three claims were each shown to redden against a deliberately mutated copy of the implementation
  before being kept. The third `validateSelection` AGREES with the scenarios under those claims, so
  nothing in the product changed. The ENFORCEMENT half is not landed: nothing still counts a shared
  contract's implementations against its runners, so a fourth implementation would join in exactly
  the same silence. The census command in the body is the manual substitute.
---

## What Was Wrong

`packages/matrix/src/contract/selection-scenarios.ts` exists **because two implementations of one
rule diverged**. Its header says so:

> These scenarios were pinned while two implementations answered the same questions — the CLI's
> `matrix-resolver.ts` plus `build-step-logic.ts`, and the editor's `derive.ts` — and did not always
> agree. The expectations are the CLI's, which the owner ruled authoritative. … Each side writes
> its own runner that maps its API onto these fields.

Two runners existed: `packages/cli/src/cli/lib/matrix/selection-scenarios.contract.test.ts` and
`apps/editor/src/features/configure/lib/derive.contract.test.ts`. Each opens by naming the other,
and each calls the arrangement bilateral — the CLI's says "so the contract is bilateral rather than
a set of goldens only one implementation is ever run against."

Then the `@workspace/compile` extraction created `packages/compile/src/selection.ts`, a **third**
implementation of the same three relationship rules — conflicts, requirements, exclusive categories
— so that a browser could run them. It is live: `seed-to-config.ts` calls it on every decode, and it
is re-exported from the package barrel. It arrived with **no runner and no test file of any kind**.

**Nothing reported this, and the reason is that a contract's coverage is asserted in prose.** The
bilateral claim lives in two docblocks, both of which stayed literally true — the two runners they
describe still run — while the population they describe went from complete to two-thirds. Every gate
in the repository was green throughout:

- `tsc` sees three modules that all compile.
- `eslint` sees no rule about it.
- Both existing runners pass, because their subjects did not move.
- The compile package's own `vitest run` collected 8 tests across 3 files and passed, with the
  fourth file simply absent — and a file that does not exist cannot be reported as untested.

The class generalises past this one contract. **`SELECTION_SCENARIOS` is not the only shared
scenario set here** — `packages/compile/src/contract/emission-scenarios.ts` is the same pattern one
layer down, and its runner's docblock makes the same bilateral claim about the CLI's
`preview-matches-install.e2e.test.ts` and its own `emission-scenarios.test.ts`. A shared data
contract is precisely a thing whose value is proportional to how many implementations run it, and it
is the one property of such a contract that nothing counts.

## Fix Applied

`packages/compile/src/selection.contract.test.ts`, copying the shape of the two existing runners —
a loop over `SELECTION_SCENARIOS`, one `it` per `scenario.title`, one `assertScenario` mapping the
fields onto this implementation's API.

**The mapping needed deriving rather than copying, and that is the part worth recording.** The other
two runners ask a REACHABILITY question — is this cell still offerable — which forgives whatever a
pick-one swap would resolve. `validateSelection` asks a VALIDITY question: it judges the set it is
handed, as handed, because its callers are about to write that set to a config. So `inReach ⇒ valid`
is **false** and would have been the obvious mapping: a pick-one sibling is in reach precisely
because clicking it swaps rather than adds, and `validateSelection([react, svelte])` correctly
reports both a conflict and a `categoryExclusive`. The three claims that ARE true were established
by probing all 20 scenarios and reading the results, not by assuming:

1. **A closure is writable.** `selection ∪ implied` reports no `conflict` and no `categoryExclusive`
   — 0 violations across 20 scenarios. `missingRequirement` is deliberately excluded, and the
   exclusion is the claim: `closure-takes-only-the-unambiguous-requirement` has an open requirement
   by design, because "a group offering a choice commits the user to none of its options".
2. **Out of reach is out of requirement.** Adding an `outOfReach` skill produces a
   `missingRequirement` **naming that skill** — 18/18 across the 9 scenarios that name one. Mere
   invalidity would not do: an in-reach pick-one sibling is an invalid addition too.
3. **An in-reach conflict is a swappable one.** Where adding an `inReach` skill reports a conflict,
   a `categoryExclusive` error in the same result contains both of the conflict's skills — 8/8
   across 4 scenarios. Read off the two errors' own `skills` payloads, so it stays a comparison of
   what the validator reported rather than a second lookup of the category table.

**The third implementation AGREES with the scenarios on all three.** No divergence, and the scenario
file was not touched.

**The runner was shown to fail before it was kept**, which a contract runner otherwise never is —
it is green on the day it is written, so `CLAUDE.md`'s "a test that has never failed has not been
shown to test anything" applies to it with nothing to satisfy it. Three mutated COPIES of
`selection.ts` were made in the package (never the product file), each with one rule broken, and the
runner pointed at each in turn:

| Mutation                                       | Result        | Which claim caught it                 |
| ---------------------------------------------- | ------------- | ------------------------------------- |
| `validateExclusivity` dropped from the passes  | 4 failed / 21 | claim 3 — the swap-resolves assertion |
| `validateRequirements` dropped from the passes | 9 failed / 21 | claim 2 — out-of-reach                |
| `category?.exclusive !== true` inverted        | 5 failed / 21 | claims 1 and 3                        |

All three copies were deleted; `git status` confirms the package holds only the runner.

A `describe("the corpus these claims are made against")` block guards the population, because every
per-skill claim is a loop and a loop over an empty list passes without asking the validator
anything. It sits outside `assertScenario` rather than inside it — unlike the CLI runner's guard —
because a scenario naming no `outOfReach` is a legitimate shape, so the guard has to be over the
corpus rather than per scenario.

## Proposed Standard

**For `.ai-docs/standards/clean-code-standards.md` § 6 (Testing)**, as a rule about shared
scenario contracts. That section rather than anything under `standards/e2e/` because the subject is
not e2e: all three runners are ordinary vitest suites, in three different workspaces, and a rule
filed under `standards/e2e/` would be read by nobody extracting a pure rule into a shared package.

> **A shared scenario contract names its runners, and adding an implementation adds a runner in the
> same change.** A contract exists because N implementations answered one question differently; its
> value is exactly the N it is run against, and that number is the one property no gate measures.
> The scenario module is the place to write the list, because it is the file every runner already
> imports and the only one all of them have in common.
>
> When extracting a rule into a shared package — which is the move that creates implementation
> N+1 — the runner is part of the extraction, not a follow-up. Deriving the mapping is most of the
> work and it is not a copy: the new surface may answer a different QUESTION about the same data,
> and a mapping assumed from the existing runners will be wrong in the direction that still passes.
>
> Write the runner's red phase by hand. A contract runner is green the day it lands, so mutate a
> COPY of the implementation, confirm each claim reddens, and record which mutation caught which
> claim. A claim no mutation reddens is not a claim.

**A checker is proposed, and it is cheap because the contract already names itself.** A test in
`packages/matrix` could assert that every module importing `SELECTION_SCENARIOS` is a `*.contract.test.ts`
and that their count matches a declared roster in `selection-scenarios.ts` — the same shape as
`renderers-come-from-the-shared-package.test.ts`'s `EMPTIED_MODULES`, a named constant that must be
maintained deliberately and reddens when reality moves. It is **not landed**: the roster belongs in
another lane's file, and this pass is a remediation. Until it exists the substitute is manual and
should be run whenever a rule is extracted:

```
grep -rln 'SELECTION_SCENARIOS' --include='*.ts' --include='*.tsx' packages apps | grep -v node_modules
```

Four hits today: the declaration, and three runners. Any hit that is not a `.contract.test.ts` and
is not the declaration is a fourth consumer; any implementation of conflicts/requirements/
exclusivity that is **absent** from the list is the defect this finding is about, and the grep
cannot see those — which is why the roster has to be declared rather than derived.

**Every count above is a census**, produced by running the runner against the 20 scenarios in
`SELECTION_SCENARIOS` and against the three mutants named; the mutations are quoted so each is
reproducible.
