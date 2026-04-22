---
type: standard-gap
severity: medium
affected_files:
  - e2e/lifecycle/project-tracking-propagation.e2e.test.ts
  - src/cli/lib/configuration/config-merger.ts
standards_docs:
  - .ai-docs/standards/e2e/README.md
date: 2026-04-21
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: rule-not-specific-enough
status: open
blocked_by: 2026-04-18-mergeConfigs-drops-projects-field.md
---

## What Was Wrong

The new E2E test covering the `propagateGlobalChangesToProjects` path was
asked to drive propagation via `cc edit` at HOME after two prior inits
(global + project). On current `main` this trigger cannot reach the
propagation call site because `mergeConfigs` in
`src/cli/lib/configuration/config-merger.ts` does not carry `projects`
from the existing global config into the merged config when editing at
HOME. The HOME-context branch of `writeScopedConfigs`
(`src/cli/lib/installation/local-installer.ts`) then reads
`finalConfig.projects?.length` as falsy and short-circuits before
`propagateGlobalChangesToProjects` would fire. The project's
`config-types.ts` is therefore never rewritten during Phase C — every
assertion passes vacuously against the file `initProjectAllGlobal`
already wrote during Phase B.

This is the same pre-existing gap documented in
`2026-04-18-mergeConfigs-drops-projects-field.md`. The related D-222 E2E
test (`global-agent-propagation-type-consistency.e2e.test.ts`) worked
around it by driving the global-change trigger from a project-context
edit where `writeScopedConfigs` uses the `...existing` spread in
`effectiveGlobalConfig` — that path DOES preserve `projects`.

The contract the new test asserts (import-and-extend form after a global
edit) is still useful: if propagation ever DOES run and writes the
wrong (standalone/inlined) form, the `not.toContain('"…-vue-…"')`
assertion would fail. But the test cannot distinguish
"propagation ran correctly" from "propagation skipped entirely" today.

## Fix Applied

None for the merger gap — this is a discovery, and the underlying fix is
tracked in the 2026-04-18 finding. In this test I left a
`// KNOWN GAP:` comment with a commented-out
`expect(projectTypesAfter).not.toStrictEqual(projectTypesBefore)`
assertion that can be uncommented once `mergeConfigs` preserves
`projects`. The test itself passes cleanly today and catches any
propagation regression that DOES fire (e.g. a future change that
reintroduces `writeStandaloneConfigTypes` on the project path would be
caught only if propagation runs at all).

## Proposed Standard

1. When writing an E2E test that depends on a specific code path firing,
   add a proof-of-execution assertion (file-content diff, mtime change,
   or effect-specific invariant) alongside the contract assertions, and
   comment it as `// KNOWN GAP:` with a finding reference if the
   pre-condition cannot be met on current main. This prevents silent
   vacuous passes.

2. Add to `.ai-docs/standards/e2e/README.md` an E2E trigger reference
   section: "Code paths that only fire under specific conditions (e.g.
   `propagateGlobalChangesToProjects` needs `projects` in the merged
   config) require the test to verify the pre-condition is met, not
   just the post-condition contract." Cross-link to the
   `writeScopedConfigs` branches so authors can see which trigger
   actually exercises each code path.

3. Resolve the `mergeConfigs` drops-projects bug per the 2026-04-18
   finding. Once resolved, uncomment the `.not.toStrictEqual(...)` line
   in the new test so it actively verifies propagation ran.

## Docs Landed — 2026-04-21

Item 1 + item 2 (generalized form) merged into
`.ai-docs/standards/e2e/README.md` § "Critical Rules" as a new
**"Prove the code path fired — don't just assert the contract."**
rule. The rule requires proof-of-execution alongside contract
assertions, permits `// KNOWN GAP:` commented-out assertions when
blocked, and prescribes cross-linking to ambiguous branch selectors
(`writeScopedConfigs` HOME vs project context is called out).

Item 3 remains code-only — the `mergeConfigs` one-liner is tracked in
the 2026-04-18 finding. Finding status stays `open` until the
`.not.toStrictEqual(...)` line in
`e2e/lifecycle/project-tracking-propagation.e2e.test.ts` is
uncommented post-merger-fix.
