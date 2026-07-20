---
type: missing-standard
severity: medium
affected_files:
  - e2e/fixtures/expected-values.ts
  - e2e/lifecycle/dual-scope-mixed-source-compiled-ref.e2e.test.ts
  - e2e/lifecycle/edit-global-propagation-stale-stack-ref.e2e.test.ts
  - e2e/lifecycle/edit-global-remove-dual-scope-partial.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/README.md
date: 2026-07-20
reporting_agent: cli-tester
category: dry
domain: e2e
root_cause: rule-not-specific-enough
---

## What Was Wrong

Two CLAUDE.md rules collide when a spec file names a skill id in a file-local constant.

CLAUDE.md says shared test data must come from shared fixtures rather than being
re-declared per file. `E2E_SKILL` in `e2e/fixtures/expected-values.ts` is that shared
fixture for skill ids, slugs and display titles. CLAUDE.md also says "NEVER reassign
constants to other constants — use the original directly."

Several spec files declare their protagonist skill once, e.g.
`const VITEST = "web-testing-vitest";`, and then use that name 15–20 times (config
factories, metadata template literals, `selectSkill()`, path segments, `toStrictEqual`
payloads). Adopting the shared fixture leaves only two legal shapes:

1. `const VITEST = E2E_SKILL.vitest.id;` — banned outright by the reassignment rule.
2. Delete the local constant and inline `E2E_SKILL.vitest.id` at every one of the
   15–20 usages — legal, but it replaces a short domain name with a three-hop
   property access at sites that are not about identifier form at all.

There is no written rule that says which of those two is correct, so each agent
touching such a file has to invent the answer. That is exactly the kind of judgment
call that produces convention drift across a 60-file suite.

A separate, smaller instance of the same gap: agent _ids_ have no shared export.
`E2E_AGENT_DISPLAY` holds rendered titles ("Web Developer"), keyed by agent name, so a
spec that needs the id `"web-developer"` (compiled filename, config text assertion)
cannot express it through the fixture without reading a key rather than a value.

## Fix Applied

None to the affected spec files — deliberately left as-is for this behaviour-preserving
pass, and reported instead of guessed.

The boundary actually applied in Pass 8 Cluster G chunk C2 was: adopt `E2E_SKILL` /
`E2E_AGENT_DISPLAY` at (a) bare inline literals, and (b) page-object call sites that
match on rendered text (`selectSkill`, `toggleAgent`, `navigateCursorToAgent`); leave
file-local skill-id constants alone. That mirrors the phase-1 owner's own adoption
instruction for `E2E_SKILL`, which named `selectSkill()` sites and one display-title
constant, and nothing broader.

## Proposed Standard

Add to `.ai-docs/standards/e2e/README.md`, in the test-data section, a rule of the form:

> A spec file may keep a file-local `const` for a skill or agent identifier only when
> it is used more than N times in that file. Where it is kept, it must be initialised
> from a literal, never from `E2E_SKILL` (the reassignment rule). Where it is used
> fewer than N times, drop the local constant and reference `E2E_SKILL.<slug>.id` /
> `.slug` / `.display` directly at each site.

Pick and record a concrete N so the decision stops being per-agent judgment. Also
record explicitly that the id-vs-slug-vs-display choice is load-bearing (the wizard
matches on rendered text) and must never be normalised to a single form.

Separately, decide whether an `E2E_AGENT_ID` companion to `E2E_AGENT_DISPLAY` is
wanted. If it is not, state in the same section that bare agent-name literals
(`"web-developer"`) are the sanctioned form so future sweeps stop re-proposing it.
