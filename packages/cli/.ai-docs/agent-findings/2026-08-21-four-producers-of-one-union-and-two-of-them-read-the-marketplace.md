---
type: architectural-drift
severity: medium
affected_files:
  - src/cli/commands/compile.ts
  - src/cli/commands/edit.tsx
  - src/cli/commands/init.tsx
  - src/cli/commands/uninstall.tsx
  - src/cli/lib/agents/agent-recompiler.ts
  - src/cli/lib/config-gate/index.ts
  - src/cli/lib/configuration/config-types-writer.ts
  - src/cli/lib/installation/local-installer.ts
  - src/cli/lib/loading/index.ts
  - src/cli/lib/loading/loader.ts
  - src/cli/lib/loading/source-loader.ts
  - src/cli/lib/operations/index.ts
  - src/cli/lib/operations/project/index.ts
  - src/cli/lib/operations/project/load-agent-defs.ts
  - src/cli/lib/operations/project/recompile-project-agents.ts
  - src/cli/lib/operations/project/write-project-config.ts
standards_docs:
  - .ai-docs/reference/features/agent-system.md
  - .ai-docs/standards/e2e/user-journeys.md
date: 2026-08-21
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  `write-project-config.ts` and `loadConfigTypesDataInBackground` now take their sub-agent roster
  from `loadAgentDefs` rather than from `loadMergedAgents(sourceResult.sourcePath)`, so every
  producer of the emitted sub-agent unions reads one function. Held by
  `src/cli/lib/__tests__/config-types-agent-defs-agree.test.ts` (a roster of every production
  module that reads sub-agent definitions off disk, asserted against a walk of `src/cli`),
  `src/cli/lib/__tests__/integration/config-types-init-then-compile.integration.test.ts` and
  `e2e/lifecycle/config-types-subagent-union-survives-compile.e2e.test.ts`.
---

## What Was Wrong

Six production sites answer "which sub-agents exist" for a generated `config-types.ts`, and two of
them answered differently from the other four. `init` (through `writeProjectConfig`) and
`loadConfigTypesDataInBackground` called `loadMergedAgents(sourceResult.sourcePath)` — the CLI's own
`src/agents/` merged with the marketplace's — while `edit`, `compile`, `uninstall` and
`lazyGateDeps` called `loadAgentDefs`, which reaches the CLI's alone.

The consequence is not a name that goes missing. `AgentName`'s MEMBERS come from the config either
way; what the roster decides is the LABEL. `formatMaybeSectionedUnion` asks, per member, whether the
loaded roster DECLARES it, and splits the union into `// Custom` and `// Marketplace` sections when
any member is undeclared — which also switches the union from one line to one member per line. So
the same installation emitted two different files:

```
# after init                          # after compile, with nothing edited in between
export type AgentName =               export type AgentName = "api-developer" | "web-developer";
  // Custom
  | "web-developer"
  // Marketplace
  | "api-developer";
```

A user's committed `config-types.ts` therefore churned on whichever command last ran, with no edit
behind it. The owner ruled CLI-only (2026-08-21), and the rest of the system already was: agent
partials resolve through `getLocalAgentDefinitions`, which answers `PROJECT_ROOT`, and the generated
`AGENT_NAMES` is built by `scripts/generate-source-types.ts` from that same directory — so a
marketplace-declared name in the union names something no compile pass can honour.

**Why no test saw it, and this is the transferable half.** Every fixture in both suites declares a
sub-agent roster that is a SUBSET of the CLI's own — `createTestSource` and `createE2ESource` both
write `web-developer` and `api-developer`, which the CLI ships. Under such a fixture the two loaders
return the same names and the same custom flags, so the divergence is not merely untested, it is
_unreachable_: no assertion anywhere could have failed. Both new specs pay for the reachability
first — the unit gate ships an agent name outside `AGENT_NAMES`, the e2e appends `custom: true` to
the marketplace's own copy of `web-developer` — and each carries a control asserting the fixture
really does separate the two answers.

**The false JSDoc was the same drift written down.** `AgentDefs.agents` was documented as "Merged
agent definitions (CLI defaults + source overrides). Source takes precedence." The wiring was the
intent and the sentence was the fossil: `loadAgentDefs` has taken no argument for some time, its own
docblock already said so ("agent partials ship with the CLI, so `getAgentDefinitions` is always
asked for its local branch"), and `recompile-project-agents.ts` states the same fact independently.
The merge inside it is real and degenerate — `getLocalAgentDefinitions` answers
`sourcePath: PROJECT_ROOT`, so both sides of `loadMergedAgents` read one directory. The sentence is
what made a marketplace-aware read look like the documented behaviour at the two drifted sites.

## Fix Applied

- `src/cli/lib/operations/project/write-project-config.ts` — the `agents` default is
  `loadAgentDefs()`. The `agents?` option stays because `edit` already loads the same value and
  should not load it twice.
- `src/cli/lib/configuration/config-types-writer.ts` — `loadConfigTypesDataInBackground` loads the
  MATRIX from the marketplace and the roster from `loadAgentDefs`, the two in one `Promise.all`
  (they are independent, and the function exists to be slow off the critical path).
- `src/cli/lib/operations/project/load-agent-defs.ts` — JSDoc corrected to describe CLI-only, and to
  say why the merge underneath is degenerate rather than deleting the sentence.
- `src/cli/lib/__tests__/factories/agent-factories.ts` — `buildAgentDefs`, so a spec mocking
  `loadAgentDefs` cannot stub the roster and invent the sourcePath separately.

`installEject` / `installPluginConfig` in `local-installer.ts` are deliberately NOT aligned. They
hand ONE value to the config-types write and to compilation, and they compile a sub-agent's partials
out of the marketplace, so for them a marketplace roster is the coherent answer rather than the
drifted one. Both are dead code (no command or operation calls either), which is why the divergence
has never reached a user. They are rostered in the gate with that posture stated, so the exception
is named rather than silent — and a command caller would have to split the two uses before it could
be wired.

## Proposed Standard

**A generated type union has one producer of its inputs, and a test that rosters every candidate.**
The recurrence here is not a wrong producer, it is a fifth producer: the fix at two sites leaves the
shape that produced them intact. The pattern that holds it is the one
`config-readers-agree.test.ts` already uses — roster the modules, state each one's posture, and
assert the roster against what the tree actually contains, so the roster cannot go quietly short.
Two mechanics worth copying from this instance:

1. **Roster by the CAPABILITY, not by the directory.** The walk here matches the three names a
   module can get sub-agent definitions through (`loadAllAgents`, `loadMergedAgents`,
   `loadAgentDefs`), so a new producer anywhere under `src/cli` reddens it. A roster of "the config
   modules" would not have contained `commands/uninstall.tsx`.
2. **A posture per site, including the one that is allowed to differ.** `local-installer.ts` is in
   the roster with a stated reason. An exception left out of a roster is indistinguishable from one
   nobody has looked at.

Where it should go: `standards/clean-code-standards.md`, beside the existing rules about a single
definition every surface must agree on (the `skillSlotKey` / `agentSlotKey` export exception is the
same idea one level down). It does not conflict with any NEVER/ALWAYS rule in CLAUDE.md; it is the
generalisation of "NEVER let a shared assertion helper's signature overstate what it checks" applied
to producers rather than to assertions.

**Second, narrower proposal — a fixture whose roster is a subset of the CLI's cannot test a roster
disagreement.** Both suites' sub-agent fixtures are subsets today, and that is the reason this
shipped. Any spec whose subject is "which sub-agents exist" has to arrange the disagreement
explicitly and assert a control proving it arranged one. Where it should go:
`standards/e2e/test-data.md`, as a note on `createE2ESource`'s agent set.

All counts in this finding are censuses: the six producers and the sixteen modules in
`affected_files` are the output of

```
grep -rlE "loadAllAgents|loadMergedAgents|loadAgentDefs" src --include='*.ts' --include='*.tsx' \
  | grep -v '\.test\.' | grep -v '/__tests__/' | sort
```
