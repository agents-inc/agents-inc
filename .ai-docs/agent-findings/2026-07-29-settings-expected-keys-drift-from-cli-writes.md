---
type: convention-drift
severity: low
affected_files:
  - src/cli/lib/permission-checker.tsx
  - src/cli/utils/exec.ts
standards_docs:
  - .ai-docs/reference/features/plugin-system.md
date: 2026-07-29
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: missing-rule
status: resolved
resolved_by: Added extraKnownMarketplaces to EXPECTED_SETTINGS_KEYS in permission-checker.tsx plus unit tests (permission-checker.test.tsx) pinning the CLI-written-file-is-warning-free contract
---

## What Was Wrong

`EXPECTED_SETTINGS_KEYS` in `src/cli/lib/permission-checker.tsx` is a hand-curated
list of known `.claude/settings.json` fields used by `warnUnknownFields`. The CLI's
own plugin-install path shells out to the Claude CLI
(`claudePluginMarketplaceAdd` / `claudePluginInstall` in `src/cli/utils/exec.ts`),
and `claude plugin marketplace add` writes `extraKnownMarketplaces` into
settings.json. That field was missing from the expected list, so every CLI run
after a plugin install warned `Unknown fields in settings file: extraKnownMarketplaces`
about a file the CLI's own operation produced (QA report
2026-07-29-qa-sweep-working-tree-v0144.md, Minor issues / Diagnostics-UX).

The two sides — the subprocess calls that cause settings.json writes and the
expected-keys list that validates settings.json — live in different files with no
cross-reference, so they drift silently.

## Fix Applied

- Added `"extraKnownMarketplaces"` to `EXPECTED_SETTINGS_KEYS` with a comment
  explaining that `enabledPlugins` and `extraKnownMarketplaces` are written by the
  Claude CLI during our own plugin-install path, and that CLI-produced settings
  files must never trigger the unknown-field warning.
- Added `src/cli/lib/permission-checker.test.tsx`: a settings file shaped like the
  CLI's own plugin-install output parses warning-free; a file containing every
  expected key parses warning-free; a genuinely unknown field still warns; known
  fields are not reported alongside an unknown one.

## Proposed Standard

Whenever a `claude` subprocess wrapper is added or changed in
`src/cli/utils/exec.ts` in a way that makes the Claude CLI write a new top-level
field into `.claude/settings.json`, the field must be added to
`EXPECTED_SETTINGS_KEYS` in `src/cli/lib/permission-checker.tsx` in the same
change, with a unit test in `permission-checker.test.tsx` proving the CLI-written
file stays warning-free. Suggested home: `reference/features/plugin-system.md`
(the section describing the `claude` CLI wrappers), one sentence pointing at
`EXPECTED_SETTINGS_KEYS` as the list that must track subprocess-caused writes.
