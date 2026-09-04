---
type: architectural-drift
severity: high
affected_files:
  - src/cli/lib/loading/catalogue-seat.ts
  - src/cli/lib/config-gate/propagate.ts
  - src/cli/lib/operations/project/recompile-project-agents.ts
  - src/cli/commands/compile.ts
  - e2e/lifecycle/project-tracking-propagation.e2e.test.ts
standards_docs:
  - .ai-docs/reference/config/config-writer.md
  - .ai-docs/reference/features/agent-system.md
  - .ai-docs/reference/features/compilation-pipeline.md
date: 2026-09-03
reporting_agent: codex-keeper
category: architecture
domain: cli
root_cause: missing-rule
status: partial
partial_note: >-
  All three instances are fixed in the working tree and one is guarded by an e2e byte comparison. The
  RULE half is open — nothing states that a per-project write derives its inputs from that project,
  and nothing enumerates which values are ambient enough to be got wrong this way.
---

## What Was Wrong

**A value that describes ONE project was read out of whichever command happened to be running.**
Three instances of that shape were live in this package on one day, all involving the skills
catalogue, and each was found separately without anyone noticing the other two.

The catalogue is the shared thing: `matrix` in `src/cli/lib/matrix/matrix-provider.ts` is a
module-level singleton, seated once by whatever load the running command performed. Two things
depend on it that are properly per-project:

| Reader                                                                        | What it takes from the catalogue                                    |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| the RENDER of a compiled agent, via `statedUsageFor` and `liveCategoryOf`     | each skill's stated `usageGuidance`, and its live category          |
| the DERIVATION of `config-types.ts`, via `deriveCategories` / `deriveDomains` | which `Category` and `Domain` literals the project's unions declare |

A registered project's own local skills, and the skills of the marketplace ITS config names, are in
that project's catalogue and in nobody else's. Read against somebody else's seat, both readers answer
wrongly and neither raises anything.

**The three instances:**

1. **`compile`'s own pass.** The pass rendered every agent against whatever the singleton held at
   process start — `BUILT_IN_MATRIX`, which carries no local skill — and seated the merged catalogue
   only afterwards, inside the type refresh. A locally-installed skill's stated `usageGuidance` fell
   back to the per-category placeholder, so the compiled bytes differed from what `install` had
   written and the NEXT `compile` rewrote every agent carrying one.
2. **The fan-out recompile.** `recompileRegisteredProjectAgents` compiled a registered project's
   agents with the triggering command's seat still in place, so the same placeholder substitution
   happened one installation along.
3. **`propagate.ts`'s types half.** `propagateGlobalChangesToProjects` took a `matrix` PARAMETER, and
   every caller passed its own. A skill only the project's catalogue carries resolved to nothing, and
   its category and domain left that project's `Category` and `Domain` unions.

**All three have the same ending, and it is why none of them read as a bug.** The project's own next
`compile` derives the value from its own catalogue and writes it straight back, so the two commands
undo each other for as long as both are run. Nothing throws, nothing warns, no exit code moves, and
each write is internally consistent: the `config.ts` and the `config-types.ts` a fan-out leaves behind
agree with each other and the pair type-checks.

## Fix Applied

`withCatalogueSeatedFor(projectDir, body)` in `src/cli/lib/loading/catalogue-seat.ts` is the shared
answer to instances 2 and 3: it loads the named project's catalogue, seats it, hands it to the body
as a value, and restores the caller's seat in a `finally` — the caller has its own pass to finish,
since `init` and `edit` compile their own agents after the gate returns. The load sits OUTSIDE the
`try` deliberately: it seats nothing when it throws, so there is no seat to restore, and a project
whose catalogue cannot be read is left to the caller's own failure handling rather than silently
processed against somebody else's. `propagateGlobalChangesToProjects` and
`pruneGlobalEntriesFromRegisteredProjects` lost their `matrix` parameter entirely, on the reasoning
that a parameter beside a per-project seat could only ever be the wrong one. Two call sites, one in
`lib/` and one in `operations/`, which is why the helper is a module of its own rather than a private
function in either.

Instance 1 is `Compile.seatMatrixForPass`, seating the pass's own catalogue as the pass's first act.

**The catalogue is PASSED as well as seated, in both shapes, and that is the half worth copying.** A
body that reads the singleton it just asked to be seated cannot say which seat it got, so
`withCatalogueSeatedFor` hands its body the catalogue and `seatMatrixForPass` returns it. Only the
render is left reading the singleton, because it reaches the catalogue through module-level functions
no argument can reach.

**Guarded by an e2e byte comparison**, in the `project tracking -- a fan-out reads each registered
project's own catalogue` block of `e2e/lifecycle/project-tracking-propagation.e2e.test.ts`. The
comparison is the point: it reads the SAME `config-types.ts` after a global compile, the project's own
compile, and a second global compile, and asserts the three are byte-identical. A difference that is
consistent within each installation is invisible to every check made at one end, so no
per-installation assertion could ever have caught this. The permitted case sits in the same block on
the same union — a global-scope addition in a category the project does not yet name MUST widen those
unions — because a refusal pinned alone cannot tell a correctly-scoped rule from one that has stopped
writing the project's types at all.

## Proposed Standard

**Where a command writes on behalf of a project that is not the one it was invoked in, every value
the write derives has to come from that project.** The rule belongs in `.ai-docs/standards/` beside
the scope rules, and the specific form worth writing is the tell rather than the principle:

> A module-level singleton seated by the running command is ambient state. An operation that names
> its subject in a parameter (`projectDir`, `projectPath`) and then reads such a singleton is
> reading about a different subject than the one it was handed, and nothing in the type system can
> see the mismatch — the parameter and the singleton have no relationship to disagree about.

Two mechanical clauses follow, both already demonstrated in the fix:

- **Seat and PASS.** A helper that seats ambient state also returns what it seated, and its body takes
  it as a value. This is what makes "which seat is this?" a question the code answers rather than one
  a reader has to trace.
- **A per-project operation takes no parameter for something it must load per project.** Deleting the
  parameter is the fix; keeping it and documenting which callers may pass what is not.

And the testing corollary, which `CLAUDE.md` already states for the key-order class and which this
finding is a second instance of: **a round trip needs one assertion comparing the two ends' GENERATED
ARTEFACTS**, not each end against its own config. Every config-level check held at both ends here and
could not fail.

Cross-checked against `CLAUDE.md`: this conflicts with nothing. The nearest existing rules are the
Scope Awareness block ("ALWAYS use `resolveInstallPaths(projectDir, scope)` with the explicit scope
parameter") and the report-paths-by-scope rule — both are about the same underlying mistake one axis
over, which is a reason to write this one beside them rather than a reason to treat it as covered.
