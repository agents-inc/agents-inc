---
type: standard-gap
severity: low
affected_files:
  - bun.lock
  - packages/cli/.ai-docs/standards/commit-protocol.md
standards_docs:
  - packages/cli/.ai-docs/standards/commit-protocol.md
date: 2026-10-30
reporting_agent: web-tester
category: architecture
domain: infra
root_cause: rule-not-specific-enough
status: open
---

# The release checklist commits `bun.lock` "if `bun install` moved it" and never says to run it

## What was found

`bun.lock` records each workspace's own version. On 2026-10-30 its `packages/cli` entry still read
`0.170.2` while `packages/cli/package.json` read `0.175.0`: five releases bumped the version and
none regenerated the lock. The WWW-01 tester lane ran `bun install` to declare three dev
dependencies, and the stale line came along in that lane's diff — an unrelated release fact
landing in whichever lane next installs anything.

Re-derive: `grep -n -A2 '"packages/cli": {' bun.lock` against
`grep -n '"version"' packages/cli/package.json`.

## Why it happened

The checklist line under "Release Checklist" in `commit-protocol.md` says the release commit
carries `bun.lock` "if `bun install` moved it". Nothing in the checklist runs `bun install`, so the
condition is never tested and the lock never moves.

## Proposed change (not made — the checklist is not this lane's file)

In that checklist line, run `bun install` after the version bump and before
`bun run generate:compile`, so the condition is checked every release:
"Run `bun install`, then `bun run generate:compile` — the release commit carries
`packages/compile/src/generated/corpus.ts`, which embeds the version, and `bun.lock`, whose
`packages/cli` entry carries it too."

## What would catch it

A check comparing each workspace's `version` in its `package.json` with its entry in `bun.lock`.
Cheap; not built here.
