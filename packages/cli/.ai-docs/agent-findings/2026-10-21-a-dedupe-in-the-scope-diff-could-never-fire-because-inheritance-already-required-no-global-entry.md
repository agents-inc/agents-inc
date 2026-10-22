---
type: anti-pattern
severity: low
affected_files:
  - src/cli/lib/configuration/scope-diff.ts
standards_docs:
  - docs/architecture.md
date: 2026-10-21
reporting_agent: cli-developer
category: complexity
domain: cli
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  The two-tier rewrite of computeScopeDiff (X2-configuration-r1) derives inherited globals and
  removed globals as the two halves of one partition of the vacated global installs, and drops both
  tombstone dedupes. Equivalence was checked against HEAD on 300,000 random inputs with no mismatch;
  a positive control flipping isInitMode on one side showed 143,926 mismatches.
---

## What Was Wrong

`computeScopeDiff` built `uniqueExcludedGlobalSkills` (and the agent twin) by filtering the current
global tombstones against `inheritedSkillIdSet`, under a comment saying an inherited global "would
otherwise land under Global twice". The filter could never remove anything. An entry counted as
inherited only when `!excludedGlobalSkills.some((e) => e.id === s.id)`, so no tombstone could share
an id with an inherited entry. The live dedupe was the other one: `removedGlobalSkills` dropping the
inherited ids, because every inherited entry is also a vacated global slot.

Nothing reports a filter whose predicate is false by construction. Under Stryker it reads as a
surviving mutant. That looks like a missing test, and the tempting fix is a spec for a state that
cannot be reached.

## Fix Applied

The rewrite computes the vacated installs once: baseline installs whose `(identity, scope)` slot
nothing in current occupies. It partitions the global ones on "the project claims it" into inherited
and removed. The disjointness is now structural, and neither dedupe is written.

## Proposed Standard

None for the documents. Before writing a spec for a mutant that survives on a filter, check whether
the filter can ever exclude anything given how its input was built. If it cannot, delete it: the
mutant is equivalent. Not cross-checked against `clean-code-standards.md`.
