---
type: anti-pattern
severity: high
affected_files:
  - packages/compile/src/agent-source.ts
  - packages/compile/src/agent-source.test.ts
  - packages/cli/src/cli/lib/compiler.test.ts
  - packages/cli/src/agents/developer/ai-developer/metadata.yaml
  - packages/cli/src/agents/developer/api-developer/metadata.yaml
  - packages/cli/src/agents/developer/cli-developer/metadata.yaml
  - packages/cli/src/agents/developer/web-developer/metadata.yaml
  - packages/cli/src/agents/meta/agent-summoner/metadata.yaml
  - packages/cli/src/agents/meta/codex-keeper/metadata.yaml
  - packages/cli/src/agents/meta/convention-keeper/metadata.yaml
  - packages/cli/src/agents/meta/skill-summoner/metadata.yaml
  - packages/cli/src/agents/planning/pm/metadata.yaml
  - packages/cli/src/agents/researcher/ai-researcher/metadata.yaml
  - packages/cli/src/agents/researcher/api-researcher/metadata.yaml
  - packages/cli/src/agents/researcher/cli-researcher/metadata.yaml
  - packages/cli/src/agents/researcher/web-researcher/metadata.yaml
  - packages/cli/src/agents/reviewer/reviewer/metadata.yaml
  - packages/cli/src/agents/tester/ai-tester/metadata.yaml
  - packages/cli/src/agents/tester/api-tester/metadata.yaml
  - packages/cli/src/agents/tester/cli-tester/metadata.yaml
  - packages/cli/src/agents/tester/web-tester/metadata.yaml
standards_docs:
  - .ai-docs/reference/features/agent-system.md
  - .ai-docs/reference/features/compilation-pipeline.md
date: 2026-09-01
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: missing-rule
status: partial
partial_note: >-
  The compile-side fix landed and is pinned. `withSkillTool` in
  `packages/compile/src/agent-source.ts` appends `Skill` to every rendered agent's tools,
  `packages/compile/src/agent-source.test.ts` holds six unit cases and two real-render cases,
  and a hand-run compile rewrote 13 global agents with `Skill` on every tools line and was a byte
  fixed point on the second run. What is NOT closed is the live confirmation from the other end —
  a compiled agent actually invoking a skill through the granted tool. That was left to the
  orchestrator deliberately, because a sub-agent cannot dispatch one and cannot observe its own
  tool grant changing. Also outstanding: nothing mechanical stops a future agent definition or
  template override from reaching the frontmatter without the grant; the pins are tests in one
  package, not a checker.
---

## What Was Wrong

Every sub-agent this product compiles was instructed, in the strongest terms its template can
manage, to use a tool it had never been granted.

`packages/cli/src/agents/_templates/agent.liquid` emits a `<skill_activation_protocol>` block
whenever `dynamicSkills.size > 0`. That block says _"For EVERY skill you marked YES, you MUST
invoke the Skill tool IMMEDIATELY"_ and _"The Skill tool exists for a reason. USE IT."_, and lists
each skill with an `Invoke: skill: "…"` line. Three lines above it, the same template writes
`tools: {{ agent.tools | join: ", " }}` straight from the agent's `metadata.yaml`.

**A sub-agent's `tools:` frontmatter is an allowlist.** An agent that declares one receives exactly
what it names; an agent that OMITS the key inherits every tool the session has, `Skill` included.
So enumerating tools is what removes `Skill`, and every definition this product ships enumerates
them. Census (18 of 18, all of them, no exceptions):

```
grep -L '^  - Skill$' packages/cli/src/agents/*/*/metadata.yaml | wc -l   # 18
grep -l '^tools:$'    packages/cli/src/agents/*/*/metadata.yaml | wc -l   # 18
```

**The `skills:` frontmatter key does not close the gap, and that is the non-obvious fact that let
this survive.** `skills:` preloads skill CONTENT into the agent's startup context; it grants no
tool. The two are complementary and independent. A compiled agent could therefore declare five
preloaded skills, carry a 40-line protocol about loading more, and have no way to load any of
them — while reading, from its own frontmatter, as fully skill-aware. Nothing about the file looks
wrong.

Observed live rather than reasoned about: on 2026-09-01, four separate sub-agents in one session
reported _"the Skill tool is disabled — I evaluated these skills as YES and could not load any of
them."_ They had followed the protocol correctly and failed at the invoke step. One repository
process step — applying `meta-design-expressive-typescript` after implementation, which
`CLAUDE.md` requires of every change — had gone unperformed across several tasks because of it.

Two further pieces of evidence worth keeping, because they bound what the frontmatter can promise:

- A tools list is not merely restrictive, it is also **lossy without complaint**. The compiled
  `cli-developer.md` on this machine (v0.160.0) enumerates `Grep` and `Glob`, and an agent launched
  from it had neither — its grant was `Read, Write, Edit, Bash`. A name the runtime does not
  recognise costs nothing at compile time and everything at run time.
- `agent.tools` reaches the template untouched. `sanitizeCompiledAgentData` in
  `packages/compile/src/agent-source.ts` passes it through `sanitizeStringArray`, which only strips
  Liquid delimiters. There was no layer between `metadata.yaml` and the frontmatter that could
  have noticed.

## Fix Applied

`withSkillTool` in `packages/compile/src/agent-source.ts`, applied by
`buildAgentTemplateContext`.

**In the renderer rather than in the 18 metadata files.** `packages/compile` is the one place both
front doors compile through — the CLI's write path (`lib/compiler.ts`) and the editor's output
preview (`renderAgentFromCorpus`) — so the grant holds for a user-authored agent as well as for the
shipped ones. A metadata-only fix would have left the next authored agent in the same trap, and
`buildAgentTemplateContext` is the single assembly point every render passes through.

Unconditional, not gated on `dynamicSkills.size > 0`. Skills are this product's atom: an agent has
to reach one a user adds after it was compiled, and one its own playbook names in prose. The four
read-only researchers take it on the same terms — `Skill` loads instructions and grants no write
access, so it does not compromise a read-only grant.

Idempotent and order-stable, which matters more than usual because this touches every compiled
agent rather than a subset: a definition already naming `Skill` is returned by identity, and
everything else keeps its declared order with the grant appended. Verified end to end rather than
argued — a second `compile` run over the same installation reported `0 global agents rewritten, 13
unchanged` and `diff -r` between the two passes was empty.

Pinned by `packages/compile/src/agent-source.test.ts`: six unit cases (a developer list, a
read-only researcher list, an agent with only preloaded skills, an agent with no skills, the
already-granted no-op, and a whole-object comparison) plus two that render through
`renderAgentFromCorpus` and assert the literal frontmatter line. One CLI assertion changed with it
— `compiler.test.ts` asserted `expect(result.agent).toBe(agent)`, an identity claim the function no
longer has, now a `toStrictEqual` naming the grant.

## Proposed Standard

**1. `.ai-docs/reference/features/agent-system.md`, the `tools` row of the metadata.yaml field
table (currently _"Available tools (Read, Write, Edit, Grep, Glob, Bash, WebSearch, WebFetch)"_).**
That row reads as a menu of what an author MAY list. It should say what listing does: the key is an
allowlist, omitting it inherits everything, and an unrecognised name is dropped without error. And
it should say that `Skill` is not written there — the compile adds it to every agent, so a
`metadata.yaml` naming it is redundant rather than wrong.

**2. The same document, wherever it describes the `skills:` key.** One sentence: _declaring
`skills:` does not grant the `Skill` tool._ This is the fact whose absence cost the most. It is not
inferable from either key, it is invisible in a compiled file, and an author of a new agent
definition has no reason to suspect it.

**3. `.ai-docs/reference/features/compilation-pipeline.md`, the frontmatter-emission list.** It
enumerates what the template writes; `agent.tools` now arrives with a member no `metadata.yaml`
declares, and the pipeline description should name the transform rather than leaving the reader to
find the difference between the yaml and the compiled file.

No conflict with `CLAUDE.md`: this proposes reference-doc rows only, adds no NEVER/ALWAYS rule, and
does not touch the exception list for enumerated tools — the per-agent restrictions are deliberate
design and stay.

**What would catch a regression, and what would not.** The two render cases in
`agent-source.test.ts` fail if the grant stops reaching the frontmatter through
`buildAgentTemplateContext`. Nothing catches the case where a render REACHES the template by
another route: `renderAgent` accepts a hand-built `CompiledAgentData`, and a project-local
`agent.liquid` override can rewrite the `tools:` line however it likes. Both are stated rather than
closed. A checker asserting the invariant on `renderAgent`'s input — every rendered context names
`Skill` — is the shape that would cover the first; the second is out of reach by design, since a
template override is the user's.
