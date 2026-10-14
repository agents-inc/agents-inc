---
type: missing-standard
severity: low
affected_files:
  - scripts/check-findings-frontmatter.ts
  - .ai-docs/agent-findings/2026-08-07-domain-order-and-descriptions-byte-duplicates-folded-into-matrix-package.md
  - .ai-docs/agent-findings/2026-10-04-the-config-writers-refusal-landed-after-edit-from-had-removed-skills.md
standards_docs:
  - .ai-docs/agent-findings/TEMPLATE.md
date: 2026-10-14
reporting_agent: cli-developer
category: testing
domain: infra
root_cause: convention-undocumented
status: partial
partial_note: >-
  Landed 2026-10-14: the two sibling-workspace entries now read packages/compile/src/config-source.ts
  and packages/matrix/src/read-model/domains.ts, so the census command finds only ../skills/.
  Pending: the rule sentence in TEMPLATE.md rule 6, and the guard that reports a climbing reference
  landing on an existing in-repository file. Until one exists, a new ../compile/ entry whose target
  goes is skipped rather than reported.
---

## What Was Wrong

A frontmatter path that climbs (`../`) does not say which root it climbs from. The dangling-reference
scan in `scripts/check-findings-frontmatter.ts` tries the findings directory, the package and the
repository, so two different references read the same:

- `../skills/src/skills/...` climbs from the repository root to the `skills` checkout beside it.
- `../compile/src/config-source.ts` and `../matrix/src/read-model/domains.ts` climb from the
  package root to `packages/compile/` and `packages/matrix/`, which are inside the repository.

Census as of 2026-10-14, from `packages/cli`: 44, 1 and 1. Re-run it rather than trusting the figures:

```
grep -hE '^\s+- \.\./' .ai-docs/agent-findings/*.md | sed -E 's|^\s+- (\.\./[^/]+/).*|\1|' | sort | uniq -c
```

The owner ruled on 2026-10-14 that a reference resolving outside the repository is skipped.
`isCarriedByRepository` decides "outside" from the repository root, because a `../skills/` climb read
from an inner root lands back inside the repository. That makes the two sibling-workspace climbs
"outside" too. Both resolve today, so nothing is lost yet. If either target were deleted, its
reference would be skipped instead of reported.

## Fix Applied

None for the gap; discovery only. The repository root is forced by the `../skills/` specs in
`scripts/check-findings-frontmatter.test.ts`.

## Proposed Standard

`TEMPLATE.md` rule 6 gains one sentence: a frontmatter path never climbs to reach a file this
repository carries. Write `packages/compile/src/config-source.ts`, not `../compile/src/config-source.ts`,
so that `../` means only "outside this repository", which is the one reading the scan can act on.

A cheap guard would hold it: the scan reports a climbing reference that lands on an existing file
inside the repository when read from an inner root. That is a misspelt in-repository path. It
leaves `../skills/` alone, because `packages/skills/` does not exist. This was cross-checked against
`CLAUDE.md` and does not conflict. Its absolute-path ban is about machine paths, and these paths are
relative.
