---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/lib/operations/source/ensure-marketplace.ts
  - src/cli/lib/operations/source/require-marketplace.ts
  - src/cli/base-command.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-10-31
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  `ensureMarketplace` tells the refresh's errors apart: `PluginsLeftSwitchedOnError` is a refresh
  that worked, `FailedLeavingPluginsSwitchedOnError` one that failed, and each plugin left on is
  warned by name and answered as `leftOn`; `requireMarketplaceOrExit` records them and
  `exitIfWorkIncomplete` ends the run with `update`'s error at `EXIT_CODES.ERROR`. Pinned by
  `init-and-edit-from-warn-when-a-codex-plugin-stays-switched-on.test.ts`, the two
  `*-warns-when-a-codex-plugin-stays-switched-on` e2e specs, `ensure-marketplace.test.ts` and
  `base-command.test.ts`.
---

## What Was Wrong

The Codex host's `refreshMarketplace` gained two errors meaning "done, with a shortfall": a plugin
the user had switched off was switched back on and could not be switched off again. `update`, the
caller written beside them, reads them. `ensureMarketplace`, the other caller (reached by
`init --from` and `edit --from`), wrapped the refresh in a bare `catch {}` that says "Could not
update marketplace — continuing with cached version". So the plugins were updated, the
switched-off one was running, nothing named it, and the run exited 0 with a sentence that was
untrue.

## Fix Applied

The catch classifies: a switch left on alone is a refresh that worked (no cached-version line), a
refresh that also failed keeps that line, and anything else is today's failure. Each plugin left on
is warned with `codexPluginLeftSwitchedOn`; the command finishes, then exits 1 with
`pluginsLeftSwitchedOn`, as `update` does.

Sibling search, `grep -rn "\.refreshMarketplace(\|\.updatePlugin(" src --include='*.ts' --include='*.tsx' | grep -v __tests__`
(the two host calls that throw these errors): `update.ts` and `ensure-marketplace.ts`, nothing else.

## Proposed Standard

CLAUDE.md's "ALWAYS visit every call site … when changing a function from returning a SENTINEL to
THROWING" covers a function that starts to throw, not one that already threw and gains an error
class meaning partial success. Widen it: adding such an error class means visiting every caller
that catches, since a catch-all files it as a failure. No type or lint can see a catch that
swallows a class it never names, so the check is that census, run in the change that adds the
class. No conflict with CLAUDE.md found.
