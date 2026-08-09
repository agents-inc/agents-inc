---
type: architectural-drift
severity: medium
affected_files:
  - packages/matrix/src/contract/selection-scenarios.ts
  - packages/matrix/src/contract/selection-scenarios.test.ts
  - packages/cli/src/cli/lib/matrix/selection-scenarios.contract.test.ts
  - apps/editor/src/features/configure/lib/derive.contract.test.ts
standards_docs:
  - .ai-docs/standards/e2e/test-data.md
date: 2026-08-07
reporting_agent: cli-developer
category: testing
domain: shared
root_cause: convention-undocumented
status: open
---

## What Was Wrong

`SELECTION_SCENARIOS` is the shared contract two implementations are held to, and its own header
says the `outOfReach` / `inReach` lists are _samples_: "each id listed here is one somebody chose,
and the `why` says what it is standing for." What the header does not say is that a sample can be
standing for a fact that one specific rule in `default-rules.ts` is the sole carrier of.

`an-unmet-requirement-inside-a-pick-one-category` used VitePress as its out-of-reach exemplar, and
the only thing putting VitePress out of reach beside `[Next.js, React]` was its
`requires needs ["vue-composition-api"]` rule. Deleting that rule — a settled, independently
motivated loosening, since a docs site is its own deployable — did not weaken the _semantics_ the
scenario exists to pin at all. It just removed the one skill the scenario had picked to demonstrate
them with, and the scenario went red in both runners.

The self-consistency suite beside the scenarios (`selection-scenarios.test.ts`) checks that every id
is a real catalogued skill, that expectations do not contradict each other, and that every `implied`
id is reachable through some `requires`. None of that could have caught this, because the scenario
stayed internally coherent throughout — it was only its relationship to the catalogue that broke.
The two runners did catch it, loudly and correctly, which is the system working. The gap is that
nothing warned at authoring time, and nothing in the file records which rule each exemplar leans on,
so the next rule deletion re-discovers this the same way.

## Fix Applied

Re-derived the scenario per the wave's ordering constraint: the exemplar is now Nuxt, which still
carries exactly the fence the scenario is about ("needs the Vue that same React rules out") and is
already pinned for that same fact by `build-step-logic.test.ts`. The `why` now records that VitePress
was the original exemplar and why it stopped qualifying, so the lineage survives in the file rather
than only in a plan document. The unused `VITEPRESS` constant was removed. All three suites — the
scenario self-consistency tests, the CLI runner and the editor runner, including its `agreed`
grouping — are green, so the scenario's `divergence: null` classification still holds.

## Proposed Standard

When a scenario's `outOfReach` entry is carried by a single `requires` rule rather than by a
conflict group or a category radio, say so in its `why`. One clause is enough — "Nuxt is out of
reach because of its own `requires`, not because of the meta-framework radio" — and it turns a
silent coupling into something a rules edit can grep for before it lands. Worth stating once in the
header comment of `selection-scenarios.ts` as a rule for new scenarios, since that header is already
where the sampling convention is explained and is what an author reads before adding one.
