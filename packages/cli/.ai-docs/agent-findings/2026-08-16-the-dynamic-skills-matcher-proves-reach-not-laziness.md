---
type: convention-drift
severity: medium
affected_files:
  - packages/cli/e2e/matchers/agent-matchers.ts
  - packages/cli/e2e/helpers/create-e2e-source.ts
  - packages/cli/e2e/interactive/init-wizard-scratch.e2e.test.ts
  - packages/cli/e2e/lifecycle/stack-per-agent-curation.e2e.test.ts
  - packages/cli/.ai-docs/reference/features/built-in-catalogue.md
standards_docs:
  - .ai-docs/standards/e2e/assertions.md
date: 2026-08-16
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: convention-undocumented
status: open
---

## What Was Wrong

`toHaveAgentDynamicSkills` is named and documented as the DYNAMIC half of a pair. `assertions.md`
§ "Agent Matchers" opens with _"These distinguish between **preloaded** skills (YAML frontmatter)
and **dynamic** skills (body activation protocol)"_ and describes the matcher as _"Checks the
`<skill_activation_protocol>` body section for dynamic skills"_.

It does not check that section. `toHaveAgentDynamicSkills` strips the leading frontmatter block and
searches the WHOLE remaining file for each id, and the section it is named after is optional:
`hasActivationProtocol` is a separate expectation, no e2e spec passes it, and the E2E fixture's own
agent template (`AGENT_TEMPLATE` in `create-e2e-source.ts`) has no `<skill_activation_protocol>`
block at all. That template renders `{% for skill in skills %}{{ skill.content }}{% endfor %}` —
every skill on the agent, preloaded and lazy alike — while production's `agent.liquid` splits
`preloadedSkills` from `dynamicSkills`. Every e2e that uses the matcher runs against the fixture, so
in practice it asserts **the skill reached this agent**, not **the skill arrives on demand**.

That was harmless while the matcher's only callers wanted reach. It stops being harmless with the
2026-08-16 eagerness ruling, which makes "reachable but lazy" the ordinary outcome for every
marketplace skill rather than an oddity — so specs now have to assert that pair deliberately, and a
matcher whose name already claims the second half is exactly the one a reader will reach for and
over-trust. A single `toHaveAgentDynamicSkills(agent, { skillIds: [x] })` is satisfied by an agent
that PRELOADS `x`.

Only the pair carries the claim, and it needs both matchers:

| Assertion                                       | Proves                    | Alone, also satisfied by  |
| ----------------------------------------------- | ------------------------- | ------------------------- |
| `toHaveAgentFrontmatter(agent, { noSkills })`   | nothing preloads          | a skill that never landed |
| `toHaveAgentDynamicSkills(agent, { skillIds })` | the skill is on the agent | a preloaded skill         |

## Fix Applied

Test-side only, in the two specs the ruling required rewriting. `init-wizard-scratch` now asserts
the pair per agent — `noSkills: true` on the frontmatter plus a body hit for its own domain's skill
and a body negative for the other domain's — with a comment stating that neither matcher carries the
claim alone. `stack-per-agent-curation` adds `toHaveAgentFrontmatter` on the compiled agents beside
the `toHaveCompiledAgentContent` calls it already had, so an eager entry and a lazy one on the same
agent are separated on the surface a user reads.

All three added assertions were mutation-checked: inverted expectations produced
`skills to be exactly [react, zustand] but found: [react]`, `[api-hono] but found: []`, and
`body to NOT contain react but it does`. None is vacuous.

The matcher itself is unchanged — renaming it or making `hasActivationProtocol` implicit would
change every existing caller, and the fixture template would then need production's split before any
of them could pass.

## Proposed Standard

**1. `assertions.md` § "Agent Matchers" should say what each matcher proves under the E2E fixture,
not what its name implies.** Concretely: `toHaveAgentDynamicSkills` searches the whole body, the
fixture's agent template embeds every skill's content and renders no activation protocol, so under
that fixture the matcher is a REACH assertion. Add the pairing rule — a "reachable but lazy" claim
needs `toHaveAgentFrontmatter({ noSkills })` **and** `toHaveAgentDynamicSkills({ skillIds })`, and
neither alone is the claim. The section's existing note (_"Check `create-e2e-source.ts` —
`createMockSkillAssignment(id, true)` means preloaded"_) already sends the reader to that file for
the stack's flags; it should send them there for the TEMPLATE's split too, which is the part that
decides whether the matcher can see a difference.

**2. The `built-in-catalogue.md` invariant-2 gap flagged by
`2026-08-16-marketplace-skills-reach-agents-but-can-never-be-eager.md` is still open** — this pass
did not touch that document, and the code trace confirms the gap it describes. Invariant 2 ends
_"the flag survives only where it is somebody's word — a user's saved config, or a third-party
source's own stacks file"_, which reads as a standing three-tier precedence list. The third tier is
conditional: `buildEjectConfig` (`local-installer.ts`) computes `loadedStack` only when
`wizardResult.selectedStackId` is set, and `buildStackProperty(loadedStack)` is spread into
`existingStack` only when that stack loaded. With no stack selected there is no call, so a
marketplace's authored `preloaded: true` is never consulted and the defaults answer alone.

The e2e suite now demonstrates exactly that boundary across two files, which is why it is worth one
sentence in the invariant: `init-wizard-stack` applies the fixture's stack, its `config/stacks.ts`
is read, and react preloads; `init-wizard-scratch` applies none, so the same skill from the same
source arrives lazy. Invariant 2 should name the trigger (`selectedStackId` → `loadStackById` →
`buildStackProperty`) rather than list the tier unconditionally.
