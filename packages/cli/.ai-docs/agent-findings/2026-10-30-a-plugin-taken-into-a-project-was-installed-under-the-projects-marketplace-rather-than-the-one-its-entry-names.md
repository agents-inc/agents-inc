---
type: anti-pattern
severity: medium
affected_files:
  - packages/cli/src/cli/commands/edit.tsx
  - packages/cli/src/cli/lib/installation/mode-migrator.ts
  - packages/cli/src/cli/lib/operations/skills/install-plugin-skills.ts
standards_docs:
  - apps/www/src/content/docs/docs/configuration/config-reference.md
date: 2026-10-30
reporting_agent: cli-tester
category: architecture
domain: cli
root_cause: missing-rule
status: open
---

## What Was Wrong

A skill entry's `origin` names the marketplace its plugin is installed under (config-reference.md).
Three builders of a plugin name ignore it and use the installation's marketplace instead. With real
Claude Code, a project made from one marketplace under a global installation made from another,
`edit --from` taking a global plugin into the project, fails: `Plugin "<id>" not found in marketplace
"<project's marketplace>"`, exit 5, and the project's config still records the plugin.

Census (`grep -rn "buildMarketplacePluginRef(" packages/cli/src/cli --include='*.ts'
--include='*.tsx' | grep -v "\.test\.\|__tests__"`, 10 hits in 7 files): `update.ts` and
`uninstall.tsx` build from `origin`; `uninstall-plugin-skills.ts` tries `origin`, then the
marketplace. The three files above build from the installation's marketplace only. The edit move was
reached through a command. The mode-migrator switch was not: at home, another marketplace's skill
cannot be placed and is kept as it was, and in a project, a copy of a seated skill fails first (see
below). `install-plugin-skills.ts` is reached by a red in `mixed-marketplaces-across-scopes`, where
the installation's marketplace is itself wrong after a later global install.

The marketplace namespace rule means `<id>@<installation marketplace>` is never a real plugin for
another marketplace's skill. The only exception is the public catalogue, whose ids carry no prefix.

Found beside it, not fixed: in a project, switching a seated global skill to a copy reads its files
from the project's marketplace folder (`ENOENT .../<project marketplace>/src/skills/<id>/SKILL.md`,
exit 1). It goes through `copySkillsToLocalFlattened` in `skill-copier.ts`.

## Fix Applied

None. This was discovery only. The red tests are in
`e2e/lifecycle/edit-from-moves-a-plugin-from-another-marketplace-into-a-project.e2e.test.ts` and in
`edit.test.ts`, under "a plugin skill added to the project over its global install".

## Proposed Standard

Add to `packages/cli/CLAUDE.md` → plugin install rules: a plugin name for an existing entry is built
from the entry's `origin`. The installation's marketplace is a fallback only for removal, as in
`pluginRefsOf`. This is a proposal. It conflicts with no CLAUDE.md rule.
