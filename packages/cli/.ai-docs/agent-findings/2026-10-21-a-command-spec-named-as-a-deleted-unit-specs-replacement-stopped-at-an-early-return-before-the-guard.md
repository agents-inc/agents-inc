---
type: anti-pattern
severity: high
affected_files:
  - packages/cli/src/cli/lib/__tests__/commands/edit.test.ts
  - packages/cli/src/cli/commands/edit.tsx
standards_docs:
  - packages/cli/CLAUDE.md
date: 2026-10-21
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: missing-rule
status: partial
partial_note: >-
  The guard is covered again by a command spec shown to fail on its removal. The Proposed Standard
  is not written into CLAUDE.md.
---

## What Was Wrong

A prune deleted `migratePluginSkillScopes > should skip eject-source skills during scope migration`
from `edit.test.ts` and named a command spec as its replacement, "carries its files to the global
install without a marketplace, beside a plugin listed first" under "a saved copy moved between
scopes". In that spec the plugin stays at project scope, so `applyScopeChanges` in `edit.tsx`
returns at `if (!movesAPluginSkill(...)) return;` and `migratePluginSkillScopes` never runs. The eject guard
inside it (`if (!skillConfig || skillConfig.origin === EJECT_SOURCE) continue;`) was left with no
spec. Removing the `EJECT_SOURCE` half passed the whole unit suite (the review's run). An edit that
moves a plugin and a saved copy together would then uninstall and reinstall the saved copy's
marketplace namesake through the Claude CLI.

The named replacement exercised the same rule one layer up (`movesAPluginSkill` also skips saved
copies), so it read as covering. A command spec reaches a guard only if its input gets past every
filter in front of it. Here that meant a plugin had to move too.

## Fix Applied

New spec in `edit.test.ts`, "a plugin skill moved between scopes > carries a saved copy moving beside
it as files, sending only the plugin through Claude". The saved copy is listed first and a plugin
moves with it, project to global. The spec asserts the host calls name only the plugin, the saved
copy's file reaches the global install and leaves the project, and `config.ts` records both at global
scope. Checked in a scratch mirror with the guard's `EJECT_SOURCE` half removed: the spec failed on
an uninstall call for `web-framework-react@agents-inc`. Unmutated, it passed.

## Proposed Standard

`packages/cli/CLAUDE.md` › "Test Assertions": a spec named as the replacement for a deleted spec must
be shown to fail on a mutation of the deleted spec's subject before the deletion lands. Without a
mutation, the replacement only shows that a spec on the same topic exists, not that it reaches the
same code. Checked against CLAUDE.md: no conflict. It complements "NEVER delete an unused binding in
a test file without triaging it first", which covers a lost assertion within a spec. This covers a
lost spec.
