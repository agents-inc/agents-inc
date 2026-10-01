---
type: anti-pattern
severity: high
affected_files:
  - src/cli/utils/exec.ts
  - src/cli/lib/hosts/claude-host.ts
  - src/cli/lib/hosts/codex-host.ts
standards_docs:
  - .ai-docs/reference/boundary-map.md
  - .ai-docs/reference/concepts/plugin-hosts.md
date: 2026-09-23
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  The code half landed: `validateMarketplaceSource` in `src/cli/utils/exec.ts` applies
  `SAFE_PLUGIN_PATH_PATTERN` to a reference only, held by
  `src/cli/lib/hosts/__tests__/a-marketplace-directory-with-a-space-reaches-the-host.test.ts`. The
  Proposed Standard is written into neither place it names: `packages/cli/CLAUDE.md` has no such
  Data Integrity bullet, and `reference/boundary-map.md` § 4.1 records this validator's case only.
---

## What Was Wrong

`validateMarketplaceSource` in `src/cli/utils/exec.ts` held every marketplace source to
`SAFE_PLUGIN_PATH_PATTERN` — `/^[a-zA-Z0-9._@\/:~-]+$/`, which admits no space. That pattern
describes a REFERENCE a user types (`owner/repo`, `github:org/repo`). But a marketplace source is
one of two different things, and the other is a DIRECTORY ON THIS MACHINE, whose name the
filesystem decides. Under `/Users/My Name` or `C:\Users\My Name` — what a person's home directory
is called on two of the three platforms this CLI ships to — a marketplace directory was refused
before it reached the host.

**Codex never objected.** Measured on the pinned `@openai/codex` 0.155.1, 2026-09-23, `HOME` and
`CODEX_HOME` pinned to a scratch tree whose path contains a space and the global `config.toml`
deleted first: `codex plugin marketplace add '<scratch>/My Home/…' --json` exits 0.

And the pattern was protecting against nothing reachable from here: `execCommand` in the same file
calls `spawn(command, args)` and never passes `shell`, so the source is one element of an argument
vector and the binary is handed it as data.

## Fix Applied

`validateMarketplaceSource` now splits on whether the source names a directory
(`path.isAbsolute`, or an opening `./` / `../`). A directory keeps the non-empty check, the length
bound and the control-character refusal; a reference keeps all of those AND the pattern. Every
existing refusal for a typed value still holds — `my org/their-repo` and `$(whoami)/repo` are
refused on both hosts, and those refusals are asserted in the same file as the admissions —
`src/cli/lib/hosts/__tests__/a-marketplace-directory-with-a-space-reaches-the-host.test.ts` —
because an admitted directory on its own reads exactly like a check that was deleted.

## Proposed Standard

For `CLAUDE.md` -> "NEVER do this" -> a new bullet under Data Integrity, or
`.ai-docs/reference/boundary-map.md` § 4.1 where the validators are tabulated:

> **NEVER hold a directory path to a validator written for a reference.** The two have different
> alphabets: a reference is `[a-zA-Z0-9._@/:~-]`, a path is whatever the filesystem allows, and a
> home directory with a space in it is an ordinary machine on two of three platforms.
> Where one function must take both, split on the shape and say which branch each refusal belongs
> to. And state what the pattern is defending: `execCommand`, which both hosts' plugin commands
> spawn through, never passes `shell`, so an argv element is data and a character class there is
> refusing valid input rather than preventing injection.
