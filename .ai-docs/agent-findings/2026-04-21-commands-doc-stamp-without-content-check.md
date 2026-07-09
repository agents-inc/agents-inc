---
type: convention-drift
severity: medium
affected_files:
  - .ai-docs/reference/commands.md
standards_docs:
  - .ai-docs/DOCUMENTATION_MAP.md
date: 2026-04-21
reporting_agent: codex-keeper
category: architecture
domain: cli
root_cause: enforcement-gap
status: resolved
resolved_by: commands.md corrected (phantom --agent-source removed from edit/compile, validate section rewritten to zero args/flags, build plugins flags fixed)
---

## What Was Wrong

`commands.md` had its `last_validated: 2026-04-21` stamp bumped without verifying documented flags against live source. Ralph iter 51 audit found four drifted claims the stamp had rubber-stamped:

1. `edit` — documented nonexistent `--agent-source` flag. Source `static flags` is `{ ...BaseCommand.baseFlags, refresh }`.
2. `compile` — documented nonexistent `--agent-source` flag. Source `static flags` is `{ ...BaseCommand.baseFlags, verbose }`.
3. `validate` — documented `path` arg, `--verbose`, `--all`, `--plugins`, `--source` flags, and three "modes". Source has `static args` unset, `static flags = {}`, `static baseFlags = {}` — a zero-arg zero-flag command.
4. `build plugins` — documented nonexistent `--skills-dir` flag, claimed `--source` existed (overridden to `{}`), claimed `-s` short-flag conflict (fabricated). Source has `agents-dir`, `output-dir`, `skill`, `verbose` only.

The validation pass that stamped the file did not open the source command files; it trusted existing prose.

## Fix Applied

- Removed `--agent-source` from `edit` and `compile` flag tables and flow prose.
- Rewrote `validate` section: zero args, zero flags, single-mode walk across all registered sources/plugins/skills/agents.
- Removed `--skills-dir` and `--source` from `build plugins`; fixed `--skill` description to "path to skill directory"; removed fabricated `-s` conflict note.

## Proposed Standard

Add to codex-keeper agent instructions (and reflect in `.ai-docs/DOCUMENTATION_MAP.md` validation rules):

> **Any `last_validated` bump on `commands.md` must re-verify every `static flags`, `static args`, and `static baseFlags` object against live source.** Validation is not "read the doc and sanity-check"; it is "open every command file listed in the Commands Index and diff its declared surface against the documented table." Stamping without opening source files is a no-op validation and produces false confidence.

Concretely: before bumping the frontmatter date, the keeper must Read each `src/cli/commands/**/*.{ts,tsx}` file referenced in the doc, grep for `static flags`, `static args`, `static baseFlags`, and compare against the flag/arg tables. Missing or extra rows are fixes, not drift tolerances.
