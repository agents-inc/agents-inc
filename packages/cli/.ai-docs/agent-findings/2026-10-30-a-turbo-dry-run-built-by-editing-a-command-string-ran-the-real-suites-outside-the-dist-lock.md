---
type: anti-pattern
severity: high
affected_files:
  - .github/workflows/ci.yml
standards_docs:
  - docs/briefing.md
  - packages/cli/.ai-docs/standards/e2e/README.md
date: 2026-10-30
reporting_agent: cli-developer
category: testing
domain: infra
root_cause: missing-rule
status: open
---

## What Was Wrong

To list which suites each CI `test:e2e` command reaches, a shell loop rewrote each command with
`sed` to add `--dry=json`, then ran it with `eval`, outside the dist lock because a dry run builds
and runs nothing. The first `s///` always matched, so the following bare `t` branched past the
expression that appended `--dry=json`. Every command without a `--` therefore ran for real:
the web e2e suites (18:54–18:57, killed), then the whole CLI e2e suite at default workers and the
server e2e suite (about 18:57–19:11). The first one rebuilt `packages/cli/dist/` at 18:54:32 while
another lane's locked full CLI e2e run was in flight. The e2e README's "One build at a time" says
such a run is evidence of nothing.

A second trap sits next to it: `turbo run … --dry=json -- <args>` lists `<args>` in
`cliArguments` for dependency tasks too, and their hashes move, but the dependency scripts do not
receive them. A throwaway two-package probe with turbo 2.10.8 printed `B-BUILD ARGS []` for the
dependency's build and `--shard=1/2` only for the named task. So the dry JSON cannot tell you
where a passthrough flag lands.

## Fix Applied

None in the tree. The process tree was killed. The routing check was rewritten as
`ci-routing.mjs` in the lane's evidence folder: it builds the argv as an array and refuses to spawn
unless `--dry=json` is in it.

## Proposed Standard

In `briefing.md`'s lock instruction (or the e2e README's "One build at a time"): a command that
names a suite task (`test`, `test:e2e`) is run inside the dist lock even when it is meant to be dry
or collect-only, because one dropped flag turns it into a real run. Build such commands as an argv
array and assert the dry or collect flag is present before spawning; never `eval` an edited command
string. Neither file says this today, and it does not conflict with any CLAUDE.md rule.
