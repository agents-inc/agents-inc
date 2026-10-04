---
type: standard-gap
severity: medium
affected_files:
  - scripts/check-findings-frontmatter.ts
  - scripts/check-findings-frontmatter.test.ts
  - .ai-docs/agent-findings/2026-09-03-the-schema-validating-a-compiled-agent-refuses-two-keys-its-own-template-emits.md
standards_docs:
  - .ai-docs/agent-findings/TEMPLATE.md
date: 2026-10-03
reporting_agent: cli-tester
category: testing
domain: infra
root_cause: enforcement-gap
status: open
---

## What Was Wrong

`resolvesUnder` in `scripts/check-findings-frontmatter.ts` decides whether a frontmatter path
resolves with `existsSync` alone. A path the repository ignores therefore resolves on a machine
that happens to hold the file and dangles everywhere else. The 2026-09-03 finding lists
`e2e/helpers/handrun.gen.mjs` under `affected_files`. That file is the esbuild bundle
`scripts/handrun.mjs` emits, and it is gitignored:

```
git check-ignore -v packages/cli/e2e/helpers/handrun.gen.mjs
```

So `this repository > holds its dangling frontmatter references to the ones already reported` in
`scripts/check-findings-frontmatter.test.ts` passes where someone has run the hand-run, and fails
on any tree without the bundle: a clean clone, CI, or a copied working tree. It was measured failing
in a copied tree, where the received list held exactly one entry more than
`UNRESOLVED_REFERENCES_ON_DISK`, and that entry was this reference.

The file already asks git what it ignores (`gitIgnoresUnder`) for its identifier scan. The
reference scan does not.

## Fix Applied

None. The fix belongs in another lane.

## Proposed Standard

A frontmatter reference names something the repository carries. Two changes would hold that. First,
`resolvesUnder` should treat a path `gitIgnoresUnder` reports as unresolved, wherever it happens to
exist. Second, the 2026-09-03 finding should name the bundle's source (`scripts/handrun.mjs` or
`e2e/handrun-journeys.ts`) instead of the generated file.
