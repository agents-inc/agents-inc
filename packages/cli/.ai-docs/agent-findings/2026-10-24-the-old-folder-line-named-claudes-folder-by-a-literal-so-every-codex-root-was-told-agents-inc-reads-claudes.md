---
type: anti-pattern
severity: low
affected_files:
  - src/cli/utils/messages.ts
  - src/cli/hooks/init.ts
standards_docs:
  - CLAUDE.md
date: 2026-10-24
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  CLI-965. `retiredSourceFolderIgnored(root, provider)` names `sourceDirName(provider)`, and the init
  hook passes `providerInUse(root)` for each root. Held by the Codex rows in
  `old-claude-src-folder.test.ts` and `old-claude-src-folder-is-named-as-ignored.e2e.test.ts`.
---

## What Was Wrong

The line printed for an old `.claude-src/` says where agents-inc reads in that root. It built the
folder with `sourceDirName("claude")`, so a root holding a Codex installation was told agents-inc
reads `.agents-inc/claude/`. The docblock gave the reason: "Claude's folder, as the old one was
Claude's". That is a fact about who wrote the old folder, used for a sentence about who reads now.

`install-layout.ts` keeps `PROVIDER_OF_A_NEW_INSTALLATION` private so that "no call site defaults a
provider silently". A provider literal passed to a folder builder is the same default, and the
privacy of the constant does not stop it.

Census of the shape, `src/cli` outside tests (before the fix, one hit, this line; after, none):

```
grep -rn 'sourceDirName("claude")\|sourceFolderInUse([^,]*, "claude")\|SOURCE_CLAUDE\b' src/cli --include='*.ts' --include='*.tsx' | grep -v '__tests__\|\.test\.'
```

## Fix Applied

The message takes the root's provider, and the hook reads it per root with `providerInUse(root)`.
The hook runs before flags are parsed, so the provider is the one on that root's disk.

Not changed: a Codex project under a home holding both installations still has HOME's line name
Claude's folder, by roster order. That is the shape of
`2026-10-22-a-home-holding-both-installations-answers-claude-to-every-read-that-asks-it-for-the-global-a-codex-project-inherits`,
and which folder that line should name is an open owner question.

## Proposed Standard

Proposal: a sentence beside the `PROVIDER_OF_A_NEW_INSTALLATION` docblock, or in CLAUDE.md's Scope
Awareness rules. Outside tests and `consts`, a folder or path builder takes its provider from
`providerInUse` or from a caller that has one, and never from a literal. The census above is the
check. It has no members today, so a lint rule would hold nothing yet. No conflict found with
CLAUDE.md's NEVER/ALWAYS rules.
