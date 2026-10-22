---
type: convention-drift
severity: low
affected_files:
  - packages/compile/src/config-source.ts
  - packages/compile/src/string.ts
standards_docs:
  - packages/cli/CLAUDE.md
date: 2026-10-21
reporting_agent: cli-developer
category: dry
domain: shared
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  canonicalizeStackOrder now orders sub-agent keys with bytewise from packages/compile/src/string.ts,
  and the private compareNamesInCodeUnitOrder is deleted (expressive-ts round 2, lane X5-compile-r2).
---

## What Was Wrong

`packages/cli/CLAUDE.md` › Code Style names `canonicalizeStackOrder` (`packages/compile/src/config-source.ts`)
as the shape for canonical stack order, and in the same paragraph says to order with `bytewise`
or a bare `.sort()`. That function used neither. It sorted sub-agent keys with a private
`compareNamesInCodeUnitOrder`, which answered the same as `bytewise` for every pair of strings.
Its docblock gave the same reason as `bytewise`'s (code units, not `localeCompare`). So the
package carried one rule in two declarations, and the second one had a live caller.

The CLAUDE.md paragraph already warns about this shape for `byCategoryDeclarationOrder`: a
centralised rule declared a second time is a definition a future caller can reach. That earlier
copy was dead. This one was not, so a change made to only one of the two would have split the
config writer's sub-agent order from every other committed ordering.

Sibling census, a sample over `packages` and `apps`:
`grep -rnE --include='*.ts' --include='*.tsx' '(a|left|x) < (b|right|y) \? -1|=== b\) return 0|< b \? -1 : 1' --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=generated packages apps`
It finds two hits: `bytewise` itself, and `cliMintedPayload` in `packages/api-mocks/src/fixtures.ts`.
The second one sorts unique `Object.entries` keys, so its missing `0` branch can't be reached,
and `api-mocks` does not depend on `@workspace/compile`. It is left alone.

## Fix Applied

`canonicalizeStackOrder` calls `bytewise` and `compareNamesInCodeUnitOrder` is deleted. Behaviour
is unchanged, because the two comparators agree on every string pair. The `stack-ordering`
scenario in `contract/emission-scenarios.ts` pins the order (api-developer before web-developer).

## Proposed Standard

None. No check can catch a second comparator cheaply and honestly. The census grep above is
textual, and a hand-rolled comparator is legitimate in a workspace that does not depend on
`@workspace/compile`. A reviewer reading a new comparator next to a shared one is the only guard.
