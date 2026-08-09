---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/types/config.ts
  - src/cli/lib/loading/loader.ts
  - src/cli/lib/resolver.ts
  - src/cli/lib/compiler.ts
  - src/cli/lib/agents/write-compiled-agents.ts
  - src/cli/lib/agents/agent-recompiler.ts
  - src/cli/lib/config-gate/deps.ts
  - src/cli/lib/config-gate/pair-writer.ts
  - src/cli/lib/config-gate/propagate.ts
  - src/cli/lib/installation/local-installer.ts
  - src/cli/lib/operations/project/load-agent-defs.ts
  - src/cli/lib/operations/project/write-project-config.ts
  - src/cli/commands/compile.ts
  - src/cli/commands/uninstall.tsx
  - src/cli/lib/installation/local-installer.test.ts
  - .ai-docs/standards/clean-code-standards.md
  - .ai-docs/standards/typescript-types-bible.md
standards_docs:
  - .ai-docs/standards/typescript-types-bible.md
  - .ai-docs/standards/clean-code-standards.md
date: 2026-08-06
reporting_agent: cli-developer
category: typescript
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  CLI-421 (2026-08-07) applied both standards edits, closing the gap the code-side CLI-392 fix left
  open. Proposal 1: `clean-code-standards.md` §6.10 no longer sanctions the agents-record cast — it
  now has ONE exception (intentionally invalid error-path data), states that a sparse-but-valid
  fixture means the callee's parameter is wrong, and shows the `Partial<Record<…>>` + annotation
  form CLI-392 landed, with the 53-cast history as the worked example. Proposal 2:
  `typescript-types-bible.md` §12's "CAN narrow" example is now
  `Partial<Record<AgentName, StackAgentConfig>>`, matching the real `Stack.agents`, with a note that
  §12 decides the key type and §4 independently decides `Record` vs `Partial<Record>`. Proposal 3
  needed no new writing: `reference/features/code-generation.md` already tabulates all seven
  vendored files with their CLI-side sources and the byte-verbatim rule (rows 1–7), and lists
  hand-editing `packages/matrix/src/vendor/` as a named trap.
---

## What Was Wrong

Twenty-four signatures across the loading, resolution, compilation, config-gate and
installation layers declared `Record<AgentName, AgentDefinition | AgentConfig>` for maps
that are built by scanning a directory (`loadAgentsFromDir` keeps only the agents whose
`metadata.yaml` parsed), by `Object.fromEntries` over a filtered subset
(`buildCompileAgents` drops excluded agents and agents absent from the definitions), or
from an empty literal (`config-gate/deps.ts` had
`const NO_AGENTS = Promise.resolve({} as Record<AgentName, AgentDefinition>)` — the
verbatim form CLAUDE.md names as a NEVER).

The type said every agent in the union is present; no call path guarantees that. The code
knew better and guarded anyway — `if (!definition) throw`, `agents[name]?.custom === true`,
`Boolean(allConfigAgents[name] || allAgents[name])` — so the type was contradicted by the
lines immediately below it.

The part worth recording is what the false type cost at the call sites. Because the
production parameters demanded a total map, the tests could not pass the sparse fixtures
they actually had, so `local-installer.test.ts` carried **43 `emptyAgents as Record<AgentName,
AgentDefinition>` casts**, 8 `const agents: Record<…> = { … } as Record<…>` pairs, and 2
`as unknown as Record<AgentName, AgentConfig>` double casts (a CLAUDE.md NEVER). Nine
comment blocks explained the casts with a sentence that was the defect stated out loud:

> Partial<Record<>> per CLAUDE.md — cast at each call site below because the callees
> require Record<AgentName, AgentDefinition>.

Every one of those 53 casts existed only to re-assert the totality the signature invented.
Making the parameters `Partial` deleted all of them, including both double casts, with no
other change.

## Fix Applied

CLI-392. Twenty-four signatures moved to `Partial<Record<…>>` per typescript-types-bible §4,
plus `CompileConfig.agents`, which moved from `Record<string, CompileAgentConfig>` to
`Partial<Record<AgentName, CompileAgentConfig>>` — its writers already produce `AgentName`
keys and its only reader already read them back with `typedKeys<AgentName>`.

Three structural casts were replaced by the typed helpers rather than kept:
`typedFromEntries` in `resolveAgents`, `convertStackToCompileConfig` and
`buildCompileAgents`; `typedValues` in `compileAllSkills`. `resolveAgents` now iterates
`typedEntries(compileConfig.agents)`, so the key and its config arrive together and no
lookup can miss. No guard was removed and no `!` was introduced anywhere.

`tsc` surfaced exactly zero unhandled `undefined` in production code — every site the change
could have broken was already guarded. The only fallout was in tests, which is itself the
finding: the guards were right and the types were wrong.

## Proposed Standard

**1. `clean-code-standards.md` §6.10 currently sanctions the workaround.** It lists

> partial mock data at test fixture boundaries (`{ "web-developer": mockAgent } as
Record<AgentName, AgentDefinition>`)

as one of two legitimate reasons to cast in a test. That example is this defect. When a test
has a sparse fixture and the callee demands a total map, the callee's parameter is wrong —
casting at the call site launders the error into 43 copies. Proposed replacement text: a cast
is legitimate for _intentionally invalid_ data on an error path; a sparse-but-valid fixture is
a signal to make the parameter `Partial<Record<…>>`, per typescript-types-bible §4. Keep the
`as SkillId` error-path example; drop the agents-record one.

**2. `typescript-types-bible.md` §12's "CAN narrow" example contradicts §4.** It shows
`agents: Record<AgentName, StackAgentConfig>; // stacks only reference built-ins` while the
real `Stack.agents` in `src/cli/types/stacks.ts` has been
`Partial<Record<AgentName, StackAgentConfig>>` for some time. §12 is about narrowing the KEY,
but written this way it also demonstrates a total map for a map no stack ever fills. Proposed:
write the example as `Partial<Record<AgentName, StackAgentConfig>>` so the two sections cannot
be read as disagreeing.

**3. Undocumented coupling worth a line in the types bible or DOCUMENTATION_MAP:** seven files
under `src/cli/types/` are vendored **verbatim** into `packages/matrix/src/vendor/` by
`scripts/generate-matrix-package.ts`, and `scripts/generate-matrix-package.test.ts` asserts the
copy byte for byte. Editing any of them without running `bun run generate:matrix` fails three
tests in a file whose name gives no hint that a CLI type edit caused it. This bit during
CLI-392, and the tree was _already_ drifted on arrival — the committed `vendor/config.ts` still
declared `domains?: Domain[]` / `selectedAgents?: AgentName[]` against a CLI source that renamed
them to `selectedDomains` some time ago, so those three tests were red before this task started
and are green now.
