---
type: anti-pattern
severity: low
affected_files:
  - src/cli/lib/__tests__/helpers/generated-types.test.ts
standards_docs:
  - .ai-docs/standards/e2e/assertions.md
date: 2026-08-21
reporting_agent: cli-developer
category: testing
domain: shared
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  A fixture declaring the two aliases in the reversed order, and one assertion against it. Dropping
  `export type ` from the reader's anchor now reddens exactly that assertion and nothing else;
  before it, that mutation was green across the whole suite.
---

## What Was Wrong

`generated-types.test.ts` carries an assertion named **"reads only the requested alias when another
alias shares its suffix"**. It reads `AgentName` out of a fixture declaring `AgentName` and then
`SelectedAgentName`, and it cannot fail for the reason its name gives.

`readGeneratedUnion` anchors on `export type <alias> =`. The hazard the name describes is that
`AgentName` is a suffix of `SelectedAgentName`, so a reader anchored on a bare `<alias> =` would
match inside the longer declaration. `.exec` returns the FIRST match — so with the shorter alias
declared first, both readers answer correctly and the assertion holds either way:

```
export type SelectedAgentName = "web-developer";

export type AgentName = "api-developer" | "web-developer";

  anchored on `export type AgentName =`   ->  ' "api-developer" | "web-developer"'
  anchored on `AgentName =`               ->  ' "web-developer"'      <- SelectedAgentName's body
```

Reversed, the two disagree. In the fixture's order they cannot. The suffix hazard is a fact about
DECLARATION ORDER as much as about the names, and the assertion pinned the names only.

The mutation that survived is one character of intent: replacing the reader's pattern with
`` `${alias} =([\s\S]*?);` `` left all eleven assertions in the file green, including the one whose
title is the property that mutation removes.

## Why Nothing Caught It

The helper was lifted into `src/cli/lib/__tests__/helpers/` under `clean-code-standards.md` § 6.18
precisely so it would carry its own tests, and it does — eleven of them, all passing, several of
them discriminating. A count of assertions cannot tell a suite that pins a claim from one that
states it, and a test title is prose: nothing reads it against what its fixture can distinguish.

The one gate in the tree that asks this question — `spec-gates.test.ts`'s escape-shape gate, "a
verdict that cannot fail is refused before it is trusted" — works because the verdicts it checks are
SHAPES it can enumerate. A fixture whose data happens not to exercise the branch its assertion names
has no shape; only running the mutation finds it.

The reader is the artefact this suite exists to make trustworthy, and every alias it is pointed at
in production (`SkillId`, `AgentName`, `SelectedAgentName`, `ProjectAgentName`, `Domain`,
`Category`) comes out of one writer — `assembleConfigTypesSource` in
`lib/configuration/config-types-writer.ts` — which emits `AgentName` ABOVE the two aliases ending in
it. So the unanchored reader would also be correct today against every real file, which is what made
the gap costless and invisible at the same time: the fixture mirrored the emitted order, and the
emitted order is the one order in which the claim has nothing to say.

## Fix Applied

- `SUFFIX_SHARING_ALIAS_DECLARED_FIRST` — the same two aliases with their declarations reversed,
  with a docblock naming the emitted order and why the fixture states the other one.
- One assertion reading `AgentName` out of it, whose message says the anchor is
  `export type <alias> =` rather than a bare `<alias> =`.
- Red-then-green recorded in both directions: under the bare-anchor mutation the new assertion is
  the ONLY failure of twelve; restored, all twelve pass. The other six mutations run over the same
  suite (greedy body, alias dropped from the pattern, `throw` softened to `[]`, quotes left on the
  literals, the literal regex made non-global) each kill between one and seven assertions.

## Proposed Standard

Where a test's NAME states a discrimination — "only", "without reaching", "rather than", "when X
shares Y" — the fixture has to be one where the two sides actually differ, and the cheapest proof of
that is the mutation, not the review. Belongs beside the existing assertion rules in
`standards/e2e/assertions.md`, which already ban a vacuous verdict shape and an assertion broadened
to pass; this is the third member of that family and the only one no shape-matcher can reach.

The narrow, checkable half: when a helper reads a generated artefact by matching a NAME, at least
one fixture declares the names in an order the artefact's writer does not emit. The writer is in the
tree, so its order is readable rather than guessable, and it is exactly the order under which such a
matcher is accidentally correct.
