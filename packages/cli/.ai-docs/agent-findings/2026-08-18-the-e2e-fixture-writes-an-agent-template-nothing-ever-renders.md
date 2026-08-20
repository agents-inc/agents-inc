---
type: architectural-drift
severity: medium
affected_files:
  - packages/cli/e2e/helpers/create-e2e-source.ts
  - packages/cli/src/cli/lib/compiler.ts
  - packages/cli/src/cli/lib/agents/agent-fetcher.ts
  - packages/cli/e2e/matchers/agent-matchers.ts
standards_docs:
  - .ai-docs/standards/e2e/assertions.md
  - .ai-docs/reference/testing/e2e-infrastructure.md
date: 2026-08-18
reporting_agent: codex-keeper
category: testing
domain: e2e
root_cause: convention-undocumented
status: partial
partial_note: >-
  Docs landed, code pending. `standards/e2e/assertions.md` § Agent Matchers and
  `reference/testing/e2e-infrastructure.md`'s matcher signature list now describe the matchers
  against the template that actually renders, and both say the fixture's own `AGENT_TEMPLATE` is
  not it. Pending, and a cli-developer job: `AGENT_TEMPLATE` and `writeAgents`' write of it are
  dead code carrying a live-sounding maintenance instruction, and `AgentSourcePaths.templatesDir`
  is computed by two functions and consumed only by a `verbose()` line.
---

## What Was Wrong

`createE2ESource()` (`e2e/helpers/create-e2e-source.ts`) writes an `AGENT_TEMPLATE` into the fixture
marketplace at `<sourceDir>/src/agents/_templates/agent.liquid`, under a comment that reads as a
standing obligation:

> Minimal agent template for E2E tests. Diverges from `src/agents/_templates/agent.liquid` (which
> ships partials + methodology sections); the frontmatter `skills:` block MUST mirror production
> exactly … Drift risk: follow-up could import the production template directly.

**Nothing renders it.** `createLiquidEngine(projectDir)` (`src/cli/lib/compiler.ts`) builds its root
list from the PROJECT and the CLI, never from a marketplace source: `projectDir/.claude-src/agents/_templates`
if it exists, then `projectDir/.claude/templates` if it exists, then `PROJECT_ROOT/src/agents/_templates`
unconditionally. Its only two callers (`lib/agents/agent-recompiler.ts`, `lib/installation/local-installer.ts`)
both pass a project directory. `eject` copies its templates from `PROJECT_ROOT` as well, so even the
first root can only ever hold the CLI's own file. `AgentSourcePaths.templatesDir` — computed by both
`getAgentDefinitions` and `fetchAgentDefinitionsFromRemote` in `agent-fetcher.ts`, and the one place
a source's template directory is named at all — reaches exactly one consumer, a `verbose()` line in
`commands/compile.ts`. The fixture template is also structurally incapable of rendering: it opens
`{% include "_partials/intro.liquid" %}` and no `_partials` directory exists anywhere in the tree.

So every E2E-compiled agent, fixture-sourced or not, comes out of production's `agent.liquid`. That
template splits `preloadedSkills` from `dynamicSkills` (partitioned in `buildAgentTemplateContext`)
and prints a preloaded id in frontmatter only, a dynamic id in the body under
`<skill_activation_protocol>` → `## Available Skills (Require Loading)`, and `<skills_note>` when an
agent holds no dynamic skills at all.

### What the wrong file cost

`2026-08-16-the-dynamic-skills-matcher-proves-reach-not-laziness` (deleted this pass) reasoned from
`AGENT_TEMPLATE` and concluded that `toHaveAgentDynamicSkills` "in practice asserts the skill reached
this agent, not that it arrives on demand", because that template renders
`{% for skill in skills %}{{ skill.content }}{% endfor %}` — preloaded and lazy alike — and carries no
activation protocol. Both halves are true of the file it read and false of the file that renders. It
also stated that "no e2e spec passes `hasActivationProtocol`"; four do.

Measured against a real compile — `ProjectBuilder.editable()` with `web-framework: [sa(react, true)]`
and `web-testing: [sa(vitest)]`, then `CLI.run(["compile"])`:

| Probe                                           | Result  |
| ----------------------------------------------- | ------- |
| frontmatter carries `skills: [<react id>]`      | yes     |
| `body.includes(<react id>)` (the PRELOADED one) | `false` |
| `body.includes(<vitest id>)` (the DYNAMIC one)  | `true`  |
| `<skill_activation_protocol>` present in body   | yes     |

Against `ProjectBuilder.minimal()`, whose agents hold no skills, the body carries `<skills_note>` and
no protocol — and `hasActivationProtocol` passes on it, because the matcher accepts either tag. That
expectation is therefore a weaker subject guard than its name suggests: it proves the file has one of
the two skill sections, not that the dynamic list rendered.

## Fix Applied

Documentation only. `standards/e2e/assertions.md` § Agent Matchers now describes both matchers
against production's template, with a per-expectation table of what each one proves and what else
satisfies it, and names `createLiquidEngine`'s root order so the next reader does not repeat the
substitution. `reference/testing/e2e-infrastructure.md` lists the ten real
`AgentFrontmatterExpectations` fields (it listed six, omitting `exactSkills`, the one the type's own
JSDoc directs authors to) and says the dynamic matcher searches the whole body.

No code changed. Removing dead fixture code and an unread `templatesDir` is a cli-developer change
with its own test obligations.

## Proposed Standard

**A claim about rendered output names the template the renderer resolved, not the nearest template
on disk.** Two `agent.liquid` files exist in this tree — the CLI's and the fixture's — and the
fixture's sits at the path the CLI's constant (`DIRS.templates`) describes, so it looks like the one
in play from every direction except the engine's root list. The resolver, not the filename, decides.
The check is one grep for the engine's construction site.

**Delete a fixture artefact the moment nothing reads it, rather than leaving it under a maintenance
comment.** `AGENT_TEMPLATE`'s comment tells a future author its frontmatter block "MUST mirror
production exactly" — an instruction that can only produce work, never a failure, because no
assertion anywhere can observe the file. An unreachable fixture with a live-sounding invariant is
worse than no fixture: it is a standing invitation to reason from it.
