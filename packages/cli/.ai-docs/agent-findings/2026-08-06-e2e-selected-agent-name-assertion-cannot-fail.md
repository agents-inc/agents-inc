---
type: anti-pattern
severity: medium
affected_files:
  - e2e/lifecycle/selected-agent-name-excluded.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-08-06
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  D-215 implementation. The spec now asserts on the emitted `export type SelectedAgentName = ...`
  declaration via the tested `readGeneratedUnion` helper
  (src/cli/lib/__tests__/helpers/generated-types.ts) rather than on the whole file, and the
  decision this finding asked for was taken — the union is re-sourced from `config.agents` filtered
  to non-excluded entries, and the spec is retargeted at that derivation. Rewriting it surfaced a
  second defect recorded in 2026-08-06-project-scope-agent-deselect-writes-no-tombstone.md.
---

## What Was Wrong

`e2e/lifecycle/selected-agent-name-excluded.e2e.test.ts` states its purpose in a file-level
comment: "when a globally-installed agent is excluded at project level, the project's
config-types.ts still includes it in `SelectedAgentName`. This prevents the generated union from
being too narrow."

Its assertions do not test that:

```ts
expect(content).toContain("SelectedAgentName");
expect(content).toContain("web-developer");
expect(content).toContain("api-developer");
```

`content` is the whole `config-types.ts` file, and every one of those three substrings appears in
it for reasons unrelated to the claim. `"api-developer"` is present because `AgentName` is derived
from `config.agents[]`, which carries the excluded agent's tombstone — so the assertion passes
whether `SelectedAgentName` narrows to the excluded agent or excludes it. The test cannot
distinguish the behaviour it names from its opposite.

This surfaced while writing the D-215 red pass. D-215 deletes `ProjectConfig.selectedAgents`, which
is the field `SelectedAgentName` is currently derived from — so the union has to be re-sourced. The
settled contract re-sources it from `config.agents` filtered to non-excluded entries, which is the
exact case this E2E claims to guard against. The E2E will keep passing after that change while its
stated invariant is inverted, and nobody reading the run output would learn that.

Note that the E2E's underlying rationale expires with D-215 regardless: the "too narrow" risk it
describes was about `selectedAgents?: SelectedAgentName[]` in the generated `ProjectConfig`
interface, and that field is being removed. After D-215 the only remaining consumer of
`SelectedAgentName` in the emitted artifact is the `ProjectAgentName = SelectedAgentName` fallback,
whose keys must be active agents anyway. So the file needs a decision — re-target the assertion at
the surviving behaviour, or delete it — not a silent pass.

## Fix Applied

None — discovery only. The file is outside the D-215 red pass's scope (test files under
`src/cli/lib/configuration/`), and changing it would settle a contract question that belongs to
whoever implements D-215.

## Proposed Standard

`.ai-docs/standards/e2e/anti-patterns.md` should carry a rule for whole-file `toContain` on
generated artifacts:

> When asserting on a generated file's contents, assert on the **declaration line**, not the bare
> identifier. `expect(content).toContain('export type SelectedAgentName = "web-developer"')` fails
> when the union changes; `expect(content).toContain("web-developer")` passes as long as the name
> appears anywhere in the file, including in an unrelated union. A test whose subject appears in
> the artifact for several independent reasons must name the one it means.

This is the generated-artifact sibling of the existing CLAUDE.md rule "NEVER split/loop/regex-scan
`lastFrame()` output in component tests — the rendered frame is the contract". The same reasoning
applies here in the other direction: the emitted line is the contract, so assert the line.
