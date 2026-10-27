---
type: anti-pattern
severity: medium
affected_files:
  - packages/cli/scripts/check-findings-frontmatter.ts
  - packages/cli/scripts/check-findings-frontmatter.test.ts
standards_docs:
  - packages/cli/.ai-docs/standards/clean-code-standards.md
date: 2026-10-26
reporting_agent: cli-tester
category: testing
domain: infra
root_cause: enforcement-gap
status: partial
partial_note: >-
  The code fix landed (CLI-964, 2026-10-24): check-findings-frontmatter.ts asks git through a
  throwaway bare git directory whose work tree is the repository and whose excludes file is the null
  device, so only the repository's own .gitignore files decide, and a git failure throws. Four rows
  in check-findings-frontmatter.test.ts run on fixtures outside any git repository, as an export is.
  The Proposed Standard below is not written.
---

## What Was Wrong

Drafted by the CLI-964 tester on 2026-10-24; filed by the CLI-981 tester on 2026-10-26. The fix's
shape below was re-derived against the 2026-10-26 tree. The reproduction is the tester's and was
not re-run.

The findings check skips a frontmatter reference to a git-ignored path. It asked the checkout's own
`.git` whether a path was ignored, and its docblock said "Outside a working tree nothing is
ignored". A `git archive` export has no `.git`, so `git check-ignore` exited 128 and every ignored
path counted as carried and missing.

The tester reproduced it at HEAD 646c5451 in an export: the repository spec failed on two references,
`packages/cli/e2e/helpers/handrun.gen.mjs` and `.claude/skills/commit-plan/SKILL.md`. CI passed,
because `actions/checkout` leaves a real `.git`. A local checkout passed because both files exist on
disk there. Only the export, the clean tree the publish route builds from, had neither.

Two things made the verdict depend on the machine: the gate asked the environment (`.git`, and git's
global excludes) for a fact the repository states in tracked `.gitignore` files, and a git failure
answered "not ignored" silently.

## Fix Applied

None in this lane; the fix is CLI-964's.

- `check()` asks git through a throwaway bare git directory, created in the system temp folder and
  removed in a `finally`. Its work tree is the repository and `core.excludesFile` is the null device,
  so only the tracked `.gitignore` files decide, with git's own semantics.
- A failure of `init`, `ls-files` or `check-ignore` throws (`gitFailure`).
- A path outside the repository is not governed by its `.gitignore`.
- The symbol scan reads the same predicate, so its export/checkout split closed too.

The rows that hold it, in `check-findings-frontmatter.test.ts`, on fixtures outside any git
repository:

- "is not reported when the repository's own .gitignore ignores it"
- "is still reported beside it when it names an absent path the .gitignore does not ignore" (the
  control)
- "is still reported when a later ! line re-includes the path it names" (the control)
- "ignores a name declared only in a file the .gitignore ignores, in a tree no git repository holds"

## Proposed Standard

For `clean-code-standards.md`: a gate reads a fact the repository states in a tracked file from that
file, never from the machine it runs on (the checkout's `.git`, global git config, a home folder),
and a failure to read it is an error, never a default answer. Conflicts with no CLAUDE.md rule.

Left with the owner by the tester, not ruled: whether a finding may cite a git-ignored file at all.
The checker allows it, and this fix kept that.
