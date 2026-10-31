---
type: missing-standard
severity: medium
affected_files:
  - docs/briefing.md
standards_docs:
  - docs/briefing.md
date: 2026-10-31
reporting_agent: cli-developer
category: testing
domain: infra
root_cause: missing-rule
status: open
---

## What Was Wrong

A brief's census for the links to the briefing contract was a plain recursive grep from the
repository root. Run in Claude Code's Bash, `grep` is a shell function that calls ugrep with
`--ignore-files`, so it honours `.gitignore`. The root `.gitignore` ignores `CLAUDE.md` everywhere
and re-includes `!packages/cli/CLAUDE.md`, and ugrep does not apply that re-inclusion when it starts
at the root. The census therefore left out `packages/cli/CLAUDE.md`, which holds two of the three
live links, and returned nothing to show anything was missing.

Reproduction (2026-10-31, run in Claude Code's Bash):

```
$ grep -rln "briefing.md" /home/<user>/dev/cli --include=CLAUDE.md
…/CLAUDE.md
$ command grep -rln "briefing.md" /home/<user>/dev/cli --include=CLAUDE.md
…/packages/cli/CLAUDE.md
…/CLAUDE.md
$ git -C <repo> grep -ln "briefing.md" -- '*CLAUDE.md'
CLAUDE.md
packages/cli/CLAUDE.md
```

Started from `packages/cli` instead, the same function does find the file, because ugrep then never
reads the root `.gitignore`. It also skips git-ignored trees such as `reports/`. That part is
usually wanted, but nothing in the output says it happened.

## Fix Applied

None. This is discovery only. The lane re-ran its census with `command grep` and got the full list.

## Proposed Standard

`briefing.md` rule 3 ("never judge an absence from a truncated listing") could add one sentence: a
census over tracked files uses `git grep` (or `command grep`), never the shell's `grep`, because
Claude Code's `grep` reads `.gitignore` and drops files that a `!` line re-includes. This does not
conflict with either `CLAUDE.md`. `git grep` is read-only git, which both allow.
