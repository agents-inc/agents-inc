---
type: audit
severity: low
affected_files:
  - src/cli/lib/matrix/matrix-health-check.ts
  - src/cli/lib/source-validator.ts
standards_docs:
  - .ai-docs/reference/features/skills-and-matrix.md
date: 2026-08-18
reporting_agent: cli-developer
category: testing
domain: cli
root_cause: enforcement-gap
status: open
---

## What Was Wrong

Routing each `checkMatrixHealth` finding to the file that holds its defect needed a spec per kind.
Writing them turned up the reason nobody had noticed the shared path: **only three of the six kinds
can be produced by a marketplace on disk**, so half the table has no observable behaviour to assert.

| Finding                         | Reachable through `validateSource`? | Why                                                                                                                        |
| ------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `category-missing-domain`       | yes                                 | `domain` is `exactOptional` in `categoryDefinitionSchema`, so a category may ship without one                              |
| `rule-unresolved-slug`          | yes                                 | `collectUnresolvedSlugs` reads the rules directly, so a source's own typo survives resolution                              |
| `audit-verdict-contradiction`   | yes                                 | Only for a source declaring itself the public catalogue — the manifest is keyed by catalogue ids and refuses others        |
| `skill-unknown-category`        | **no**                              | `mergeMatrixWithSkills` synthesises a category for any a skill names, so the matrix never lacks one after a load           |
| `skill-unresolved-relation-ref` | **no**                              | `resolveSlugsOrSkip` drops unresolvable refs and `resolveEveryNeed` voids the whole rule, so no ref survives to dangle     |
| `skill-unaudited`               | **no**                              | `skillAudit` is `Record<SkillId, SkillAuditEntry>`, total over the union at compile time, and `isSkillId` filters the rest |

The three unreachable kinds are not dead code — `checkMatrixHealth` also runs at matrix load, where
a later merge can remove a skill others still point at — but nothing in `src/` or `e2e/` constructs
that state either. A spec asserting the routing of those three would have to call the health check
with a hand-built matrix, which tests the fixture as much as the product.

The nearest of the three to genuinely dead is `checkSkillRelationRefs`: every relation on a
`ResolvedSkill` is built from ids that resolution has already proved present, so the check can only
fire on a matrix assembled some other way.

## Fix Applied

None to those three — discovery only. The routing itself landed as an exhaustive `switch` over
`MatrixHealthIssue["finding"]` with a `never` default in `toSourceIssue`, and the three reachable
kinds are pinned in `doctor-content.test.ts` ("the file a cross-reference finding sends the reader
to"). The compiler, not a spec, is what holds the other three.

## Proposed Standard

Where a union's variants cannot all be produced through the public entry point, say so beside the
`switch` and lean on the `never` default rather than reaching for a matrix built by hand: the
exhaustiveness check is the enforcement, and a spec that fabricates an impossible state is testing
its own fixture. The routing table in `skills-and-matrix.md` § "Which file a cross-reference finding
names" is the doc that should carry the reachability column if anyone acts on this.
