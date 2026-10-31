---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/lib/hosts/codex-host.ts
  - src/cli/lib/hosts/codex-plugin-switch.ts
  - src/cli/commands/update.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-10-31
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: missing-rule
status: resolved
resolved_by: >-
  `reinstallEachPluginOf` now switches back off the plugins added before a refused add, then
  rethrows the refusal (`switchBackOffThenRethrow`); a switch-back that also fails travels with it
  as `FailedLeavingPluginsSwitchedOnError`, which `update` warns by name and puts in its final
  error. Pinned by the refused-add cases in
  `update-keeps-a-switched-off-codex-plugin-switched-off.test.ts`.
---

## What Was Wrong

Refreshing a local Codex marketplace adds each of its plugins again, and Codex switches on whatever
it adds, so a switch-back step runs after the loop. It ran after the loop and outside any `try`:
the first refused add (a plugin the new version dropped, a broken `plugin.json`) threw past it.
Every switched-off plugin added before the refusal was left at the new version and switched on,
and `update` named only the refused plugin and exited 1. Reproduced with real Codex 0.155.1 by the
reviewer's hand-run (`plugin-folder-gone`, `plugin-manifest-broken`).

## Fix Applied

The loop catches the refusal, runs the switch-back over the plugins added before it, and rethrows.
When that switch-back fails too, both travel in one error, so the refusal cannot hide the plugin
left switched on: `update` warns each by name with the `enabled = false` line and lists both in its
final error.

Sibling search, `grep -rn "switchBackOff\|switchCodexPluginsOff(" src --include='*.ts' | grep -v __tests__`:
the only other switch-back is `codexUpdatePlugin`, which adds one plugin, so a refused add there
leaves nothing switched on.

## Proposed Standard

`clean-code-standards.md` § 3, a new rule: a step that undoes a side effect of a loop of fallible
actions runs over the actions that landed even when a later one throws; the failure is rethrown
after it, and the undo's own failure is carried with it rather than replacing it. A spec pins the
partial case (the second action refused), not only all-succeed and all-fail. No conflict with
CLAUDE.md found.
