---
type: missing-standard
severity: low
affected_files:
  - apps/editor/src/stores/config-store.ts
  - apps/editor/src/stores/config-store.test.ts
  - apps/editor/e2e/specs/agent-switch-toasts.spec.ts
standards_docs:
  - packages/cli/CLAUDE.md
date: 2026-10-22
reporting_agent: cli-developer
category: testing
domain: web
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  The instance is pinned (a unit spec and an e2e spec, each red with the filter deleted). The
  proposed wording for the CLAUDE.md rule is unwritten.
---

## What Was Wrong

`emptiedPins` in `config-store.ts` picks the sub-agents a change leaves without a live skill and
unpins them. Its filter `entry.on === true` spares a sub-agent the user clicked off, whose pin is
`{ on: false }`. Without the filter, a deselect erases that pin silently, and picking the skill
again switches the sub-agent back on against the click.

The lane that wrote the sweep pinned every case where it fires and three it must skip: a stack's
sub-agent, one a project's link holds, and one clicked on that never held a skill. It did not pin
the clicked-off case. With `entry.on === true &&` deleted, every spec in `config-store.test.ts`
stayed green (a review found this by mutation).

`CLAUDE.md`'s rule pairs a refused case with an allowed one, so a guard that swallows its whole
domain shows up. The mirror case is a sweep: its specs are all about what it clears, so nothing
in them notices a filter that should spare an entry being dropped.

## Fix Applied

A spec in each layer, beside "goes off with the toast when it was clicked on": "stays off, saying
nothing, when it was clicked off and its last skill goes and comes back" (unit; it asserts the pin
is still `{ on: false }`), and "stays off when it was clicked off and its last skill goes and comes
back" (Playwright). Each one is red with the filter deleted and green on the tree.

## Proposed Standard

`packages/cli/CLAUDE.md` › Test Assertions, as the converse of "NEVER pin an operation as REFUSED
without pinning … ALLOWED": a sweep that clears or rewrites entries gets one spec per term in its
filter, each one an entry the sweep must leave alone, in the same file as the specs where it
fires. To check a sweep, delete one term of its filter at a time and run the file. If the file
stays green, that term has no spec.
