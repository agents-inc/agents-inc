---
type: anti-pattern
severity: medium
affected_files:
  - e2e/lifecycle/selected-agent-name-excluded.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/assertions.md
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-08-06
reporting_agent: cli-developer
category: testing
domain: e2e
root_cause: rule-not-specific-enough
status: open
---

## What Was Wrong

`e2e/lifecycle/selected-agent-name-excluded.e2e.test.ts` claimed to exercise "a globally-installed
agent excluded at project level". Rewriting it for D-215 turned its assertions into ones that can
fail, and the rewritten spec failed — which revealed that the scenario it names has never been the
one it runs.

The spec's setup does two things: scope-toggles the `web-framework-react` SKILL to project scope,
then toggles the `api-developer` AGENT off. It then asserted:

```ts
const configContent = await readTestFile(configTsPath(projectDir));
expect(configContent).toContain("excluded");
```

Dumping the emitted `config.ts` from a real run shows what that assertion was actually matching:

```
const skills: SkillConfig[] = [
  ...
  {"id":"web-framework-react","scope":"global","excluded":true,"source":"..."},   // <- the match
  {"id":"web-framework-react","scope":"project","source":"..."},
];

const agents: AgentScopeConfig[] = [
  {"name":"api-developer","scope":"global"},    // <- NOT excluded
  {"name":"api-pm","scope":"global"},
  ... all ten agents, every one active ...
];
```

The only `excluded` row is the SKILL tombstone the scope toggle mints. The agent deselect wrote
nothing: `api-developer` remains an active `scope: "global"` row. So the spec's `"excluded"` check
was satisfied by a side effect of an unrelated setup step, and the agent-exclusion behaviour it
existed to guard was never observed.

This is the same file the predecessor finding flagged for a `toContain` that could not fail. That
finding diagnosed the assertion; this one records what was hiding behind it. The two defects
compound: an assertion that cannot fail on a scenario that does not occur leaves a spec whose name,
docstring and file name all describe behaviour no run has ever produced.

Whether a project-scope deselect of a globally-installed agent SHOULD write a tombstone is a
separate product question — D-277 establishes the refusal for skills, and agents appear to follow
it. The defect recorded here is that a spec asserted the opposite for its whole life without
failing.

**Owner ruling (2026-08-06): deselecting a global skill — or agent — from project scope is not
possible, by design.** The no-tombstone behaviour above is the intended behaviour, not a gap. What
remains open is parity of communication: the skill path refuses loudly (the locked toast); whether
the agent path communicates the same refusal or silently no-ops is tracked as CLI-391.

## Fix Applied

The spec is retargeted at the claim its run does support — `SelectedAgentName` is narrowed to the
project config's active `agents[]` rows rather than left at its `AgentName` fallback — with the
roster read structurally from `config.ts` instead of hardcoded. The exclusion half is preserved as
a commented-out `// KNOWN GAP:` block per CLAUDE.md, naming the evidence above and the unit test
(`config-types-writer.test.ts` -> "narrows SelectedAgentName to the config's non-excluded agents")
that covers the filtering directly.

The regex reader both this spec and `edit-global-agent-removal-propagation.e2e.test.ts` need is now
`readGeneratedUnion` in `src/cli/lib/__tests__/helpers/generated-types.ts`, with its own tests. It
replaces an untested inline copy in `local-installer.test.ts` and a line-based finder that would
have silently returned an empty string for the multi-line unions — which is how a `not.toContain`
against a large union passes without testing anything.

Not fixed: whether the deselect should tombstone. That needs a product decision, not a test change.

## Proposed Standard

`.ai-docs/standards/e2e/assertions.md` should carry a precondition rule:

> A spec whose claim depends on the run reaching a particular state must assert that state
> **specifically enough to identify it**. `expect(config).toContain("excluded")` is satisfied by any
> excluded row in the file — a skill tombstone from an unrelated setup step included. Assert the row
> you mean: `expect(agentRow).toStrictEqual({ name: "api-developer", scope: "global", excluded: true })`.
> When the precondition fails, the spec must fail there rather than proceed to assertions that are
> now describing a scenario that did not happen.

This is the precondition sibling of the predecessor finding's rule about asserting the declaration
line rather than the bare identifier. Both come from the same root: a `toContain` against a large
artifact names a substring, not a fact.
