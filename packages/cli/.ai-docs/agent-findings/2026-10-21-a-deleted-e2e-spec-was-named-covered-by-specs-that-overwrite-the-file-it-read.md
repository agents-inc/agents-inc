---
type: anti-pattern
severity: high
affected_files:
  - packages/cli/e2e/integration/eject-integration.e2e.test.ts
standards_docs:
  - packages/cli/CLAUDE.md
  - packages/cli/.ai-docs/standards/e2e/README.md
date: 2026-10-21
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: missing-rule
status: partial
partial_note: >-
  The ejected partials' content is covered again by a spec shown to fail when eject writes either
  partial empty. The Proposed Standard is not written into CLAUDE.md.
---

## What Was Wrong

A test prune deleted `eject-integration > ejected agent-partials structure matches readAgentFiles
expectations`. Its name and comments described internals, but two of its assertions checked what a
user ejects partials for: the ejected `identity.md` matched `/\w+ \w+/` and `playbook.md` contained
`##`. The prune named three specs as covering it: `commands/eject > should eject agent-partials to
project directory`, `eject-compile > should use custom intro in compiled output` and
`eject-customization-recompile > compiles an agent through its edited ejected partial`. The first
checks directory entries only. The other two write their own content over the ejected
`identity.md` before compiling, so the bytes `eject` wrote never reach an assertion. The review
patched `copyUnits` in the built `eject` to write partials empty. With every `identity.md` empty,
all seven spec files that run `eject agent-partials` passed. With every `playbook.md` empty, the
three named specs passed. In both runs the deleted spec failed.

This is the class of
`2026-10-21-a-command-spec-named-as-a-deleted-unit-specs-replacement-stopped-at-an-early-return-before-the-guard`,
with a different mechanism. There the replacement never reached the guard. Here the replacements
reach the file and replace it first, so a spec named for the same file and command is still blind
to what the command put there.

## Fix Applied

New spec in `e2e/integration/eject-integration.e2e.test.ts`: "recompiling through freshly ejected
agent partials leaves every compiled agent unchanged". It compiles `ProjectBuilder.minimal()`, ejects
agent partials, compiles again, and compares the compiled agents with `toStrictEqual`, plus a roster
guard and a byte-identity check on `config.ts`. It has the same shape as the unmodified-template
spec in `eject-compile.e2e.test.ts`. Measured against the built CLI: unmutated, it passes. With
`identity.md` emptied, and separately with `playbook.md` emptied, it fails at the compiled-agents
comparison and nowhere else. The spec only fails because compile reads the ejected partials, which
`eject-compile > should use custom intro in compiled output` pins, so the two specs are a pair, and
a comment says so.

## Proposed Standard

This is the second instance for the sibling finding's proposed rule (`packages/cli/CLAUDE.md` ›
"Test Assertions"): a spec named as a deleted spec's replacement must be shown to fail on a mutation
of the deleted spec's subject before the deletion lands. The e2e case adds one clause. A spec that
writes its own content into the file the deleted spec read cannot replace a check of what the
command wrote there. Checked against `CLAUDE.md` and `.ai-docs/standards/e2e/README.md` › "Mutation-check
every regression guard": no conflict. That rule covers a new guard, and this one covers a guard
being removed.
