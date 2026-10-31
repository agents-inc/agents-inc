---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/lib/stacks/stacks-loader.ts
  - src/cli/lib/loading/source-loader.ts
  - src/cli/lib/source-validator.ts
standards_docs:
  - CLAUDE.md
date: 2026-10-31
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: convention-undocumented
status: resolved
resolved_by: >-
  loadStackById and validateConfigFiles both read the declared stacksFile; specs in
  local-installer-build.test.ts and source-validator.test.ts.
---

## What Was Wrong

A marketplace may declare where its stacks live (`stacksFile` in its `.agents-inc/config.ts`).
`resolveOfferedStacks` (`lib/loading/source-loader.ts`) read that path, so the wizard offered the
stacks; `loadStackById` (`lib/stacks/stacks-loader.ts`) called `loadStacks(configDir)` with the
default path, so `init --from`, `edit --from` and the install's own backstop refused the same
stacks ("is not a stack the source … offers. … It ships: acme-starter."), and `stackNameOf`
(`base-command.ts`) named no stack in the panel. Each reader resolved the layout for itself.

Census, run 2026-10-31, every product reader of a layout default:

```
grep -rn "SKILLS_DIR_PATH\|STACKS_FILE_PATH" src scripts --include='*.ts' --include='*.tsx' | grep -v "\.test\.\|__tests__" | grep -v consts.ts
```

Readers that honour the declared value: `source-loader.ts` (both), `source-validator.ts`
(`skillsDir`). Still defaulting: `source-validator.ts` `validateConfigFiles` (`STACKS_FILE_PATH`):
`doctor` in a marketplace whose declared stacks file is broken reports a cross-reference warning
and exits 0, where the same file at the default path is an error and exits 1. The scaffold writers
(`marketplace-scaffold.ts`, `commands/new/marketplace.ts`) use the defaults correctly: they create
the layout.

## Fix Applied

`loadStackById` reads `loadSourceRepoConfig(configDir)` and passes its `stacksFile` to
`loadStacks`. Spec: `local-installer-build.test.ts` → `refuseUnofferedStack` → "lets through a
stack from the stacks file the marketplace declares, and refuses one it does not ship". The
validator half is not fixed.

## Proposed Standard

Proposal: a source's declared layout is resolved once, by one function returning the paths every
reader uses, and the census grep above lists the readers still resolving their own. Until then,
`packages/cli/CLAUDE.md` → "Data Integrity" could carry: every reader of a marketplace path goes
through `loadSourceRepoConfig`'s declared value, never the bare constant. Checked against both
CLAUDE.md files: no conflict. Nothing mechanical holds it; the spec above holds the stack lookup
only.
