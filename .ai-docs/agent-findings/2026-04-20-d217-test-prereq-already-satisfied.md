---
type: convention-drift
severity: low
affected_files:
  - e2e/helpers/create-e2e-source.ts
  - todo/D-217-plugin-skill-reference-format.md
standards_docs:
  - .ai-docs/standards/e2e/test-data.md
date: 2026-04-20
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: rule-not-specific-enough
---

## What Was Wrong

The D-217 task brief instructed the cli-tester to extend
`e2e/helpers/create-e2e-source.ts` to add a SECOND web-domain skill
(e.g. `web-state-zustand`) mapped to `web-developer`, with the rationale:
"the current fixture has only `web-framework-react` on `web-developer`,
which is insufficient for mixed-mode."

The fixture as it stands already maps THREE web-domain skills to
`web-developer` via `webDeveloperAgentConfig`:

```ts
const webDeveloperAgentConfig: StackAgentConfig = {
  "web-framework": [createMockSkillAssignment("web-framework-react", true)],
  "web-testing": [createMockSkillAssignment("web-testing-vitest")],
  "web-client-state": [createMockSkillAssignment("web-state-zustand")],
  ...
};
```

So `web-state-zustand` is already on `web-developer`, and the prereq
was a no-op. Following the instruction blindly would have either
duplicated the assignment or required defining a fourth skill.

This is a small but real form of convention drift: the task brief was
written without verifying the fixture's current state, and the fixture
is the kind of file that drifts under multiple unrelated edits.

## Fix Applied

None applied to the fixture (no change needed). I verified the existing
mapping by reading `create-e2e-source.ts` lines 129-138 and proceeded
without extending the fixture. The new E2E test
`mixed-mode-skill-ref-format.e2e.test.ts` uses `web-framework-react`
and `web-state-zustand` directly — both already present.

## Proposed Standard

When a task brief instructs a sub-agent to "extend fixture X with Y",
the sub-agent's first step should be to grep/read fixture X to verify
Y is not already present. The sub-agent should then either:

1. Skip the extension and note it in the report (current case).
2. Apply the extension if Y truly is absent.

This is already implicit under the CLAUDE.md "Investigation First"
principle, but worth calling out explicitly in
`.ai-docs/standards/e2e/test-data.md` under a "Before extending fixtures"
heading: always grep the fixture file for the entity you're being
asked to add. The cost of a 10-second grep is much less than the cost
of redundant fixture data that obscures the fixture's actual contract.
