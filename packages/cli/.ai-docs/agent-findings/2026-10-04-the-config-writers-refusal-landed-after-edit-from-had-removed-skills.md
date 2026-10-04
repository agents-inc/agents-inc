---
type: anti-pattern
severity: high
affected_files:
  - ../compile/src/config-source.ts
  - src/cli/base-command.ts
  - src/cli/lib/seed/seed-apply.ts
  - e2e/interactive/edit-from-kept-skill-shares-a-category.e2e.test.ts
standards_docs:
  - .ai-docs/reference/features/seed-contract.md
date: 2026-10-04
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  config-source.ts exports refuseUnwritableStack, which runs the writer's own compaction over a
  stack and throws what it would throw. refuseSharedConfigBeforeAsking calls it on the decoded
  selection before the lists and the question.
---

## What Was Wrong

`edit --from` writes `config.ts` after it has removed skills and uninstalled plugins. The config
writer refuses a category that holds one skill when it is given two (`compactCategoryAssignments`
in `packages/compile/src/config-source.ts`). A kept hand-written skill joined beside the
configuration's own skill in such a category, so the apply failed after the user said yes, with
the removals made and `config.ts` unchanged.

This is the class `2026-10-03-a-refusal-only-the-install-step-asks-lands-after-the-install.md`
names: a refusal the write step makes, reached after mutations. That finding's census grep reads
`local-installer.ts` only, so it could not see a refusal in the config writer.

## Fix Applied

`refuseUnwritableStack` runs the writer's own `compactCategories` over each sub-agent's rows and
throws what the writer would throw. `refuseSharedConfigBeforeAsking` calls it on the decoded
selection, for both `--from` producers. Separately, a kept row no longer joins a category that
holds one skill the configuration already fills (`withAgentKeptRows` in `seed-apply.ts`).

Census of throws on the config write path, run from `packages/` (a census of the files listed):

```
grep -n "throw new Error" compile/src/config-source.ts compile/src/global-config.ts \
  cli/src/cli/lib/operations/project/write-project-config.ts \
  cli/src/cli/lib/installation/local-installer.ts cli/src/cli/lib/config-gate/*.ts \
  cli/src/cli/lib/configuration/config-merger.ts
```

It returned five. `compactCategoryAssignments` is the one payload or config data can reach. The
stack lookup in `local-installer.ts` is already asked first. The other three are invariant guards
that earlier refusals cover: a project config rendered with no global config, a write into
another provider's installation, and a partial write with no config.

## Proposed Standard

Widen the 2026-10-03 proposal's census from the install path to every module a `--from` write
passes through, including `@workspace/compile`. This would go in `reference/features/seed-contract.md`
beside the pre-flight list. It does not conflict with any CLAUDE.md rule.
