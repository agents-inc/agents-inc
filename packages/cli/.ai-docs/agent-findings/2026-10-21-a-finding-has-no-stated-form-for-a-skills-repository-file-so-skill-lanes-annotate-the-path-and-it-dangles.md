---
type: missing-standard
severity: low
affected_files:
  - .ai-docs/agent-findings/TEMPLATE.md
  - scripts/check-findings-frontmatter.ts
  - .ai-docs/agent-findings/2026-10-20-a-skill-claim-about-library-runtime-behaviour-can-hold-only-in-the-librarys-development-build.md
  - .ai-docs/agent-findings/2026-10-20-a-skill-example-can-pass-a-value-its-librarys-types-reject-and-nothing-compiles-it-against-the-library.md
  - .ai-docs/agent-findings/2026-10-20-a-skill-example-typed-by-hook-type-arguments-rides-an-overload-the-library-deprecated-and-useMutation-turns-it-into-a-compile-error.md
  - .ai-docs/agent-findings/2026-10-20-a-skill-major-version-fix-scoped-to-import-paths-leaves-the-majors-shape-changes-behind.md
  - .ai-docs/agent-findings/2026-10-20-a-skill-typecheck-stubbed-the-block-it-imported-and-hid-that-the-library-had-retyped-it.md
standards_docs:
  - .ai-docs/agent-findings/TEMPLATE.md
date: 2026-10-21
reporting_agent: skill-summoner
category: testing
domain: infra
root_cause: convention-undocumented
status: open
---

## What Was Wrong

`TEMPLATE.md` rule 6 says what `affected_files:` lists, not how to name a file in the
`agents-inc/skills` checkout beside this repository. Skill lanes write the repository after the
path: `src/skills/<skill>/SKILL.md (agents-inc/skills)`. `referencesIn` in
`scripts/check-findings-frontmatter.ts` judges every list member as a path, whitespace included, so
such an entry resolves under no root, is not outside the repository, and is reported dangling.
`this repository › holds its dangling frontmatter references to the ones already reported`, in
`scripts/check-findings-frontmatter-against-this-repository.test.ts`, goes red.

The form the scan skips is `../skills/<path>`. It resolves from the repository root where the
checkout exists, and `isCarriedByRepository` drops it as outside the repository where it does not.

Census on 2026-10-21, from `packages/cli`: 17 entries in the five findings listed in
`affected_files`, and every target exists in the skills checkout. The skills README catalogue
finding was repaired to `../skills/` on 2026-10-20, when one other finding carried the annotated
form. Re-run:

```
grep -rnE '^\s+- .*\(agents-inc/skills\)$' .ai-docs/agent-findings/
```

All 17 were rewritten to `../skills/` later on 2026-10-21, so the re-run prints nothing.

The 2026-10-14 finding on climbing references proposed the converse rule (never climb to reach a
file this repository carries). It was pruned in `551c9164`, and its INDEX row remains.

## Fix Applied

None, discovery only. The five findings and `TEMPLATE.md` belong to other lanes.

## Proposed Standard

`TEMPLATE.md` rule 6 gains one sentence: a file in the `agents-inc/skills` checkout is written
`../skills/<path in that repository>`, climbing from the repository root, with nothing after the
path. A guard is cheap: the scan refuses a list member containing whitespace. No tracked path in
either repository contains whitespace (`git ls-files | grep -c ' '` answers 0 in both, a census).
Cross-checked against `CLAUDE.md`: its ban on machine-specific absolute paths does not reach a
relative climb.
