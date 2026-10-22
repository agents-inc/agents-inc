---
type: architectural-drift
severity: medium
affected_files:
  - packages/compile/src/seed-to-config.ts
  - packages/compile/src/config-source.ts
  - packages/cli/src/cli/lib/seed/seed-apply.ts
  - packages/cli/src/cli/lib/configuration/config-merger.ts
  - packages/cli/src/cli/base-command.ts
  - packages/cli/src/cli/commands/edit.tsx
standards_docs:
  - packages/cli/CLAUDE.md
date: 2026-10-22
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: rule-not-visible
status: resolved
resolved_by: >-
  The rules moved to the function that broke them. `seedToInstallSelection` installs every
  sub-agent a skipped skill names, so both downstream repairs were deleted;
  `GLOBAL_IDENTITY_FIELDS` lives in `config-source.ts`, and both the merger and
  `mergeInlinedScalarFields` omit it.
---

## What Was Wrong

Two rules this round fixed were each broken in one function and repaired in another, and each
repair covered only the paths that called it.

- **Sub-agents and a skipped skill.** `seedToInstallSelection` selected a sub-agent only through
  a skill that installs, so one whose skills all failed to load disappeared. `edit --from` put it
  back afterwards (`withUnplaceableAssignees`, only when the installation already held the
  skill), and the skip warning filtered its list by what each command finally selected
  (`skippedWithTheirSkills`). `init --from` passed through neither repair and dropped the
  sub-agent. The decode's docblock said the result was "the same with or without" the skipped
  skill, and its unit spec pinned exactly that.
- **A project's description.** `existingConfigForMerge` left the global installation's
  `description` out of a project's merge (`GLOBAL_IDENTITY_FIELDS`, declared in
  `config-merger.ts`). The writer, `mergeInlinedScalarFields` in `config-source.ts`, spread the
  global config under the project's fields with its own shorter list (`HAND_WRITTEN_FIELDS`), so
  it wrote the description back. The merger's spec ("lends the project none of the global
  config's description") stayed green while every written project carried the global's.

Both shapes are the same: a later function repairs an earlier one's output, the repair has its
own spec, and that spec cannot see a caller that skips the repair.

## Fix Applied

The decode now installs each sub-agent a skipped skill names (unless the configuration switches it
off), and both repairs were deleted. Their unit specs were re-pointed at decode plus
`reconcileSharedConfig`. `GLOBAL_IDENTITY_FIELDS` moved to `config-source.ts` and is exported;
the merger imports it, and the writer omits it.

## Proposed Standard

For `packages/cli/CLAUDE.md` › Data Integrity, a proposal and not a ruling: **when a function's
docblock says it undoes what an earlier function did ("the decode carries sub-agents only
through …, so …"), fix the earlier function.** Where the rule is a field list, declare it once,
beside the writer, and import it everywhere else. This sits next to the existing rule that
canonicalises key order "once in the writer, not once per producer", and does not conflict with
it.

A census for the first half, which is a sample and not complete: compensation docblocks say
what they undo, so
`grep -rn -E "so (an?|the) .* (return|come back|are restored)|is restored|put back" packages/cli/src packages/compile/src --include='*.ts' --include='*.tsx'`
finds candidates for reading. Nothing runs it.
