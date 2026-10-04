---
type: missing-standard
severity: medium
affected_files:
  - src/cli/lib/hosts/claude-project-trust.ts
  - src/cli/lib/hosts/__tests__/the-claude-host-asks-for-folder-trust.test.ts
  - src/cli/lib/__tests__/factories/claude-settings-factories.ts
  - e2e/helpers/test-utils.ts
  - e2e/interactive/edit-into-an-untrusted-claude-project.e2e.test.ts
standards_docs:
  - CLAUDE.md
  - .ai-docs/standards/e2e/test-data.md
date: 2026-10-03
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: missing-rule
status: open
---

## What Was Wrong

`claudeTrustsProject` in `src/cli/lib/hosts/claude-project-trust.ts` reads
`projects[<projectDir>].hasTrustDialogAccepted` from `~/.claude.json`, a file Claude Code writes.
Every spec of it writes that file itself, keyed by the project folder: `trustDialogAnswered` in the
unit spec, and `buildClaudeTrustState` and `acceptClaudeTrustPrompt` in the e2e tree. That is the
same key the reader looks up. The fixture and the reader share one premise, so no spec could
disagree with it.

Claude Code 2.1.288 keys the record by the git repository root. Observed under a scratch HOME on
2026-10-03: accepting the prompt in `mono/app` wrote `projects["…/mono"]` and nothing for
`mono/app`. A project below a repository root was told it was untrusted forever, and every spec
stayed green.

A second premise was shared the same way. The line's remedy assumes Claude Code prompts wherever
the record is absent. Below a trusted plain folder it never does: it went straight to the input box
in `par/proj` with `projects["…/par"]` trusted.

## Fix Applied

The product: `claudeTrustOf` in `claude-project-trust.ts` reads the record under Claude Code's key
(the repository root, a worktree's main root, or the folder) and drops the prompt remedy where
Claude Code never asks. Red specs, each layout taken from what the binary did rather than from the
reader:

- the describe block "a Claude install reads the trust record the way Claude Code does" in
  `the-claude-host-asks-for-folder-trust.test.ts`;
- `e2e/commands/claude-trust-is-read-where-claude-code-keeps-it.e2e.test.ts`.

`makeGitRepositoryRoot` in `src/cli/lib/__tests__/helpers/git-repository.ts` builds the repository
without running git.

## Proposed Standard

A fixture that writes a file another program owns says which host version it was taken from and
what was observed. Examples are Claude Code's `~/.claude.json` and plugin registry, and Codex's
`config.toml`. The reader's spec then carries at least one case where the host's write differs from
the obvious key. A fixture derived from the reader under test can only agree with it.

Worklist: `grep -rn "hasTrustDialogAccepted" src e2e`.
