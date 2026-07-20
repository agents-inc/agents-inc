---
type: convention-drift
severity: low
affected_files:
  - e2e/interactive/uninstall.e2e.test.ts
  - e2e/fixtures/project-builder.ts
standards_docs:
  - .ai-docs/standards/e2e/README.md
date: 2026-07-20
reporting_agent: cli-tester
category: dry
domain: e2e
root_cause: rule-not-specific-enough
---

## What Was Wrong

`e2e/interactive/uninstall.e2e.test.ts` had a local `createUninstallableProject()` helper
wrapping `ProjectBuilder.editable(...)` plus an `addForkedFromMetadata(projectDir)` call,
used by 10 tests. Once `ProjectBuilder.editable` gained a `forkedFrom` option, the local
helper became a pure alias for a single builder call, so the shared-infra adoption
instruction was to delete it and inline the builder call at all 10 call sites.

The tension: the codebase has two rules that pull in opposite directions here.
"Never write a helper in an E2E test file without checking for an existing shared one"
argues for deleting the local wrapper. "Never construct test data inline" and general
DRY discipline argue for keeping a single call site. Inlining turned one line per test
into eight, so the same 8-line arrange block is now repeated 10 times in one file. Both
readings are defensible and neither rule says which wins when the local helper's only
remaining job is assigning the module-level `tempDir` used by `afterEach`.

## Fix Applied

Followed the shared-infra contract: deleted `createUninstallableProject`, inlined
`ProjectBuilder.editable({ skills, agents, domains, forkedFrom: true })` +
`tempDir = path.dirname(project.dir)` + `const projectDir = project.dir` at all 10 sites,
and dropped the now-unused `addForkedFromMetadata` import. Emitted bytes are identical:
`addForkedFromMetadata` wrote `FORKED_FROM_METADATA` to web-framework-react's
`metadata.yaml`, and `forkedFrom: true` writes the same constant for every skill in
`skills`, which here is exactly `["web-framework-react"]`.

## Proposed Standard

Add to `.ai-docs/standards/e2e/README.md` (test-data section): a local arrange helper in
a spec file is worth keeping when it (a) is called 3+ times in that file AND (b) carries
side effects beyond the builder call — most commonly assigning the module-level `tempDir`
that `afterEach` cleans up. In that case, adopt the new shared option _inside_ the local
helper rather than deleting it. Delete the local helper only when it is a genuine
zero-value alias with no side effects. This gives the "prefer shared fixtures" rule a
concrete stopping point instead of implying that every local wrapper must be inlined.
