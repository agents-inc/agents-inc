---
type: missing-standard
severity: medium
affected_files:
  - packages/cli/src/cli/commands/init.tsx
  - packages/cli/src/cli/commands/edit.tsx
  - packages/cli/src/cli/lib/config-gate/index.ts
  - packages/cli/src/cli/lib/config-gate/pair-snapshot.ts
  - packages/cli/src/cli/lib/config-gate/propagate.ts
  - packages/cli/src/cli/lib/operations/project/write-project-config.ts
  - packages/cli/src/cli/lib/operations/skills/copy-local-skills.ts
standards_docs:
  - packages/cli/CLAUDE.md
date: 2026-10-30
reporting_agent: cli-tester
category: architecture
domain: cli
root_cause: missing-rule
status: partial
partial_note: >-
  The init half landed: a refused save leaves no skill folder the run made and the home as it was.
  Still open: `edit` (copies and removals before its save), plugins installed before a refused
  save, copies left when a plugin install hard-errors, and the proposed standard.
---

## What Was Wrong

Observed 2026-10-30 against the working tree. When `init --from` cannot write the project's
`config.ts` (EACCES on `.agents-inc/claude/`), it fails with the reason and exit 1, but leaves the
skill it copied into `.claude/skills/` and the project registered in the home's global
`config.ts`, with no project config naming either. A global-scoped skill in the same run also
leaves its copy under the home and its entry in the global config.

The order that produces it:

- `Init.handleInstallation` (`commands/init.tsx`) copies ejected skills, then installs plugin
  skills, then calls `writeConfigAndCompile`.
- `writeFromProjectContext` (`lib/config-gate/index.ts`) registers the project through
  `resolveEffectiveGlobalConfig` -> `registerProjectPath` (`lib/config-gate/propagate.ts`), writes
  the global pair and runs the propagation, and only then writes the project's pair.

`edit` has the same shape: `applyPluginChanges`, `copyNewLocalSkills` and `removeDeletedLocalSkills`
run before `writeConfigAndCompile` (`commands/edit.tsx`), so a refused save there leaves new copies,
and has already deleted the removed ones. Not reproduced for `edit`; read from source only.

Census of the callers, production code only:

```
grep -rn 'copyLocalSkills(\|writeProjectConfig(\|writeConfigByScope(' packages/cli/src/cli --include='*.ts' --include='*.tsx' | grep -v '__tests__\|\.test\.'
```

Eight hits, a census: the three definitions, `writeProjectConfig` calling `writeConfigByScope`, and
two each in `init.tsx` and `edit.tsx`, the two commands that copy and then save. `registerProjectPath`
is private to `propagate.ts` and called once, from `resolveEffectiveGlobalConfig`.

## Fix Applied

The init half, by the cli-developer, under the owner's answer to q-cli-init-half-install ("Leave
nothing half-done"); specs in `src/cli/lib/__tests__/commands/init-from-says-what-it-did.test.ts`,
under "a write the file system refuses" -> "beside a global install".

- Saving before copying was not taken: the narration spec in that file pins "Copying skills..."
  before "Generating configuration...", and a config written before its copies would name copies a
  failed copy never made (the plugin rule's orphan, for ejected skills). So init undoes instead.
- `writeFromProjectContext` writes the project's pair before the global pair and the fan-out, so a
  refused project write never registers the project or adds to the global install. A global write
  that then fails puts the project's pair and the home's back as they read before
  (`restoringThePairsOnFailure` in `config-gate/index.ts`, over `restoreProjectPairs` in
  `pair-snapshot.ts`), so the two pairs land together or not at all. The home's pair needs it too:
  `writeGlobalPair` saves `config.ts` before `config-types.ts`, so a refused types half otherwise
  left a saved `config.ts` naming copies init then removed. `writeFromHome` wraps its write the
  same way.
- `Init` notes the skill folders at both scopes before its first write (carried skills included)
  and, when `writeProjectConfig` throws, removes each folder that was not there
  (`removeSkillFoldersCreatedSince` in `copy-local-skills.ts`), then fails with the save's own
  cause. A folder that was already there stays.

Not done: `edit`; plugins installed before a refused save (owner question: a plugin may serve other
projects); the copies a plugin hard-error leaves; the blank global pair `ensureBlankPair` writes to
a home with no global install before the project's save is refused (it declares nothing).

## Proposed Standard

`packages/cli/CLAUDE.md`, "Data Integrity": a command that copies, installs or registers as well as
saving a config either saves first or undoes what it did when the save fails, and a spec that makes
the save fail pins both roots afterwards. This sits beside the existing rule that a failed plugin
install hard-errors before `writeConfigAndCompile`. That rule makes plugin installs come before the
save, so the two need reconciling, not just stacking: a run that installed plugins and then cannot
save has nothing in the plugin rule to say whether the plugins are undone.
