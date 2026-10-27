---
type: convention-drift
severity: low
affected_files:
  - src/cli/lib/matrix/matrix-loader.ts
  - src/cli/lib/matrix/matrix-loader.test.ts
  - src/cli/lib/skills/local-skill-loader.ts
standards_docs:
  - CLAUDE.md
date: 2026-10-26
reporting_agent: cli-tester
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  The marketplace loader now warns a metadata.yaml with no SKILL.md, naming the file and the
  reason (CLI-934). The local loader's two silent skips are still open.
---

## What Was Wrong

`packages/cli/CLAUDE.md` says `warn()` is for user issues and `verbose()` for diagnostics. It does
not say which side a skipped skill falls on, so the two loaders answer differently.

The marketplace loader (`extractAllSkills` in `lib/matrix/matrix-loader.ts`) warns for every skip
but one: a `metadata.yaml` with no `SKILL.md` beside it was said only under `--verbose`. A spec
pinned that as correct. It was named "…and warns about nothing" and asserted
`expect(warn).not.toHaveBeenCalled()`, an absence pin of the gap that CLAUDE.md's Test Assertions
rule forbids. CLI-934 is the row for it.

The local loader (`extractLocalSkill` in `lib/skills/local-skill-loader.ts`) still skips two cases
through `verbose` only, from this census:

```
grep -rn 'verbose(`Skipping' src/cli --include='*.ts' | grep -v test
```

That returned three lines in `local-skill-loader.ts` and one in `matrix-loader.ts` on 2026-10-26.
Of the local three, a folder with no `metadata.yaml` may belong to another tool, since
`.claude/skills/` is shared, so `verbose` is defensible there. The other two are a folder whose
`metadata.yaml` is present but has no `SKILL.md`, and a `SKILL.md` whose frontmatter does not read
as YAML. `parseFrontmatter` returns `null` without warning for the second. Both skip a skill the
CLI's own metadata describes, and nobody is told why without `--verbose`.

## Fix Applied

In `matrix-loader.test.ts` the absence pin became a spec requiring a `warn` naming
`'<dir>/metadata.yaml'` and `No SKILL.md found`, with a healthy skill beside it that still loads.
CLI-934 then made `extractSkill` warn that skip. `local-skill-loader.ts` was outside that lane and
is unchanged.

## Proposed Standard

One sentence under Code Conventions → Logging in `packages/cli/CLAUDE.md`: _a skill skipped at
load is warned with its file and reason whenever the CLI's own metadata describes it; `verbose`
is for a folder nothing of ours claims._ Then the two local cases above become a tracker row.
This does not conflict with any NEVER/ALWAYS rule. It narrows the existing Logging line.
