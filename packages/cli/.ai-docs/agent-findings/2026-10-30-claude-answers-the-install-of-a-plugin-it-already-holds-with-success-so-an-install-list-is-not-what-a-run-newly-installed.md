---
type: missing-standard
severity: medium
affected_files:
  - src/cli/commands/init.tsx
  - src/cli/lib/operations/skills/install-plugin-skills.ts
  - src/cli/lib/__tests__/helpers/claude-stub.ts
standards_docs:
  - .ai-docs/standards/e2e/README.md
date: 2026-10-30
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: convention-undocumented
status: open
---

## What Was Wrong

Taking back what a run installed needs to know which plugins the run newly installed. The
obvious source, `PluginInstallResult.installed` from `installPluginSkills`, lists every plugin
whose `claude plugin install` exited 0, and Claude exits 0 for a plugin it already holds at that
scope. Measured with Claude Code 2.1.314 under an isolated `HOME` and `CLAUDE_CONFIG_DIR`, with a
one-plugin marketplace on disk:

- `plugin install p@m --scope user` twice: both exit 0, the second says `is already installed
(scope: user)`, and `installed_plugins.json` holds one user record.
- `--scope project` while held at user scope: exit 0, and the registry gains a second record
  (`project`, this project's path) beside the user one; `plugin uninstall p@m --scope project`
  then removes only that record and leaves the user one.
- Another project's project-scope record survives this project's install and uninstall at
  project scope.

So a rollback that uninstalls every `installed` entry takes away a plugin the user had before the
run. The test seam hides this too: `useClaudeStub` accepts every install and writes no registry,
so a spec that wants "held before the run" must write Claude's registry itself
(`holdPluginsForTheUser` in `e2e/fixtures/plugin-install-state.ts`).

## Fix Applied

None in product code (tester lane). The specs
`e2e/commands/init-from-refused-save-takes-back-its-plugins.e2e.test.ts` pin the pair: a plugin
not in Claude's registry is uninstalled after a refused save; the same plugin held for the user
beforehand is not.

## Proposed Standard

`packages/cli/CLAUDE.md` § Data Integrity, beside the plugin-install rule: "NEVER treat a
successful `installPlugin` as proof the run installed the plugin: Claude exits 0 for one it
already holds. Read the registry before installing (`listPluginInstallsForProject` or the host's
`listPlugins`) when a later step must undo only this run's installs." Checked against
CLAUDE.md's NEVER/ALWAYS rules: no conflict.
