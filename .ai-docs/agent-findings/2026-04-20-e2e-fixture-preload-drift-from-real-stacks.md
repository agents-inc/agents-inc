---
type: convention-drift
severity: medium
affected_files:
  - e2e/helpers/create-e2e-source.ts
  - e2e/lifecycle/mixed-mode-skill-ref-format.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-04-20
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: convention-undocumented
---

## What Was Wrong

The E2E source fixture `webDeveloperAgentConfig` preloaded three meta skills (`meta-reviewing-reviewing`, `meta-reviewing-cli-reviewing`, `meta-methodology-research-methodology`) on `web-developer`, and `apiDeveloperAgentConfig` preloaded two meta skills on `api-developer`. No real user-facing stack in `src/cli/lib/configuration/default-stacks.ts` preloads meta skills on those agents. Real `web-developer` preloads only `web-framework-react` (plus meta-framework/database when present); real `api-developer` preloads only `api-framework-hono` (plus database when present). Meta skills in real stacks are always dynamic (non-preloaded) and therefore appear only in the compiled agent's Skill Activation Protocol body, never in frontmatter.

This fixture drift caused `e2e/lifecycle/mixed-mode-skill-ref-format.e2e.test.ts` to assert on a frontmatter shape (4 preloaded skills, mixed plugin/bare forms) that no real CLI invocation would ever produce — the test was verifying a synthetic shape, not the contract users see in production.

## Fix Applied

1. Flipped the meta-skill `SkillAssignment` entries in `webDeveloperAgentConfig` and `apiDeveloperAgentConfig` to `preloaded: false` so the fixture mirrors real stack shape. The meta skills still exist in `E2E_SKILLS` (so `plugin-build.e2e.test.ts` still sees 9 compiled plugins) and still appear as dynamic skills in the compiled agent body (satisfying `dual-scope-edit-integrity.e2e.test.ts`'s body-content assertions).
2. Added a comment above the agent-config declarations documenting the invariant: preload shape mirrors `default-stacks.ts`; meta skills are dynamic, not preloaded.
3. Updated `mixed-mode-skill-ref-format.e2e.test.ts` Phase 4 frontmatter assertion from a 4-skill mixed-form array to `skills: ["web-framework-react"]`, and updated the Phase 4 comment block so the D-217 contract narrative reflects the single-preloaded-skill reality.

All three gated runs pass:

- `e2e/lifecycle/mixed-mode-skill-ref-format.e2e.test.ts` — 1 passed
- `e2e/interactive/init-wizard-stack.e2e.test.ts` — 13 passed
- `src/cli/lib/stacks/stack-plugin-compiler.test.ts` — 32 passed

## Proposed Standard

Add to `.ai-docs/standards/e2e/test-data.md` (or create a new section "Fixture realism"):

> **E2E fixtures must mirror real product shape.** The E2E source fixture (`e2e/helpers/create-e2e-source.ts`) feeds wizard flows that compile real agent artifacts. Any stack-agent-config's `preloaded` flags MUST be cross-verifiable against a real stack in `src/cli/lib/configuration/default-stacks.ts`. If the fixture cannot perfectly mirror a real stack (because it has fewer skills), preserve the _shape_ of preload decisions: framework/database skills preload, meta skills never preload, shared-tooling never preloads. Tests that assert on compiled-agent frontmatter must be validating a shape that a real user would see — not a fixture artifact.

Rationale: The same ambient assumption — "whatever the fixture emits is what the test should assert on" — caused this drift. Making the realism invariant explicit lets reviewers catch fixture-assertion circular logic in code review, and gives agents a concrete cross-reference (`default-stacks.ts`) when deciding what `preloaded: true` should mean.
