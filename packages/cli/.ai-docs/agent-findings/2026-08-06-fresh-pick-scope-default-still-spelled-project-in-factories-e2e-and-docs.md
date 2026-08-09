---
type: convention-drift
severity: medium
affected_files:
  - src/cli/lib/__tests__/factories/config-factories.ts
  - src/cli/lib/__tests__/helpers/wizard-simulation.ts
  - src/cli/lib/agents/write-compiled-agents.ts
  - e2e/commands/init-from-agent-scope.e2e.test.ts
  - e2e/commands/init-from-shared-config.e2e.test.ts
  - .ai-docs/reference/features/seed-contract.md
standards_docs:
  - .ai-docs/reference/features/seed-contract.md
date: 2026-08-06
reporting_agent: general-purpose
category: testing
domain: cli
root_cause: missing-rule
status: resolved
resolved_by: |
  All four surfaces closed. The two e2e specs the finding named, plus four more it did not
  (init-from-scenarios-curation, -install, -tuning and eject-preserves-exclusive-stack — 17 failing
  specs across 6 files once the suite ran against the new build), now either assert the global
  default or pin `scope: "project"` on the wire; init-from-agent-scope's geometry is inverted so the
  explicit case is the project one. seed-contract.md's decode section cites
  DEFAULT_SELECTION_OPTIONS instead of naming a word of its own.
  write-compiled-agents.ts's `?? "project"` is now the named `UNROUTED_AGENT_SCOPE` with a JSDoc
  stating it is a ROUTING answer, not a selection default, and agent-recompiler.test.ts pins that an
  unrouted agent stays in the caller's own directory — `agents-inc update` recompiles with no scope
  map at all, so pointing it at the global default would relocate its agents into ~/.claude.
  The factory half diverged from the proposal below, deliberately: aligning buildAgentConfigs and
  buildSkillConfig(s) to global would have required editing 573 call sites that lean on the implicit
  value (245 + 328, across 25 and 35 files). They keep `"project"`, now spelled once as the exported
  FACTORY_DEFAULT_SCOPE whose JSDoc says it is the factories' own choice about a saved config row
  and is deliberately NOT DEFAULT_SELECTION_OPTIONS.scope, which answers a different question.
---

## What Was Wrong

The fresh-pick scope default is now spelled once — `DEFAULT_SELECTION_OPTIONS`
in `packages/matrix/src/read-model/selection-defaults.ts`, value
`{ install: "plugin", scope: "global" }` — and the editor
(`DEFAULT_SKILL_OPTIONS`, `RESTING_SCOPE` in `persisted-schema.ts`) and the
CLI's seed decode (`agentScopeConfig` in `seed-to-wizard.ts`) both read it.
But several CLI surfaces still spell the OLD default, `"project"`, on their
own authority:

- `buildAgentConfigs` (`config-factories.ts`) and `buildSkillConfig`
  (`wizard-simulation.ts`) default `scope` to `"project"` when no override is
  given. A test that leans on the factory default now asserts the opposite of
  what the product does out of the box, and a future test author reading the
  factory will infer the wrong product default.
- `write-compiled-agents.ts` falls back to `"project"` when
  `agentScopeMap` has no entry for an agent
  (`params.agentScopeMap?.get(name) ?? "project"`). Callers today always
  populate the map, so the branch may be unreachable — but it is a third
  spelling of a default that is supposed to have one.
- Two e2e specs pin the pre-ruling decode default and will fail once the e2e
  suite runs against the new build: `init-from-agent-scope.e2e.test.ts`
  (web-developer names no scope and is asserted `scope: "project"`, plus the
  exhaustive directory listings that place it in the project) and
  `init-from-shared-config.e2e.test.ts` ("applies a sub-agent's model and
  effort" and "installs a sub-agent switched on with no skills" both assert
  `scope: "project"` for agents that name none). These files carry unrelated
  in-flight working-tree changes, so they were deliberately left to their
  owner rather than edited under them.
- `seed-contract.md` documents the old default in prose and code excerpts:
  the `seedAgentSchema.scope` row ("`project` — the CLI's own default"), the
  `agentConfigs` mapping row, and the whole section headed
  "`agentScopeConfig` — the project default".

## Fix Applied

None on these surfaces — discovery only, recorded while implementing the
ruling (fresh pick defaults to global everywhere; the tracker's
EDITOR-12 entry carries it). The three product spellings the ruling names
were pointed at `DEFAULT_SELECTION_OPTIONS`, and the unit tests plus the
editor Playwright specs were updated; the surfaces listed above are what is
left still saying "project".

## Proposed Standard

A scope default is never spelled as a literal outside
`packages/matrix/src/read-model/selection-defaults.ts`. Concretely:

- Test factories must not invent product defaults. Either require `scope`
  explicitly (making every test say what it means) or default it from
  `DEFAULT_SELECTION_OPTIONS.scope` so the factory tracks the product.
  Belongs in `packages/cli/CLAUDE.md` under "Test Data" alongside the
  existing factory rules.
- `seed-contract.md`'s decode section should present the default as "the
  shared selection default (`DEFAULT_SELECTION_OPTIONS.scope`, currently
  `global`)" rather than as a word of its own, so the doc cannot drift when
  the constant moves again.
- The two named e2e specs need their scope expectations inverted to match
  the decode (and `init-from-agent-scope`'s geometry re-drawn: with the
  default now global, the discriminating payload is an agent pinned to
  `project`, mirroring what `seed-to-wizard.test.ts` now does).
