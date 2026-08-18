---
type: anti-pattern
severity: high
affected_files:
  - src/cli/lib/matrix/matrix-loader.ts
  - src/cli/lib/matrix/skill-resolution.ts
  - src/cli/lib/matrix/matrix-loader.test.ts
  - src/cli/lib/matrix/skill-resolution.test.ts
  - src/cli/lib/__tests__/content-generators.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
  - .ai-docs/reference/features/skills-and-matrix.md
date: 2026-08-16
reporting_agent: cli-tester
category: architecture
domain: cli
root_cause: rule-not-visible
status: resolved
resolved_by: >-
  Both defects fixed red-first in one pass. `extractAllSkills` now wraps `parseYaml`
  and warns per file naming the absolute path plus the parser's own reason, matching
  `readSkillMetadata`'s judgment and `extractLocalSkill`'s response; `mergeMatrixWithSkills`
  now guards duplicate ids in the same shape `buildSlugMap` guards duplicate slugs,
  extracted into `buildResolvedSkillMap` so the two identity axes are structurally
  symmetric. Seven tests, five of which were red first. Hand-run against a marketplace
  carrying both defects confirms both warnings and a matrix that still loads.
---

## What Was Wrong

Two defects in the marketplace matrix pipeline, both the same shape: **the loader was
silent where it should have been loud**, and in both cases a guard sitting right next to
the unguarded code made the code read as already handled.

**A parse boundary immediately followed by a `safeParse` reads as guarded when it is not.**
`extractAllSkills` had:

```ts
const rawMetadata: unknown = parseYaml(metadataContent);
const metadataResult = matrixRawMetadataSchema.safeParse(rawMetadata);
```

The `safeParse` on line two catches a SCHEMA failure and warns-and-continues. It cannot
catch a PARSE failure on line one — a different failure class, thrown rather than
returned. The visual adjacency of "parse, then safely parse" is what made this survive:
a reader scanning for error handling finds a `safeParse` and a `warn` and stops looking.
The consequence was that one unparseable `metadata.yaml` anywhere under a marketplace's
`skills/` threw out of `extractAllSkills` and killed the entire matrix load — and the
thrown error named no file, so it was unattributable. That failure lands hardest on the
audience least able to diagnose it: a marketplace author who has just edited the starter
skill a scaffold handed them, for whom a YAML typo is the single likeliest first-run
failure.

**One file guarded duplicate slugs and not duplicate ids.** In `skill-resolution.ts`,
`buildSlugMap` already warned on a duplicate slug and kept the first. Twenty lines below,
`mergeMatrixWithSkills` wrote `resolvedSkills[skill.id] = resolved` — a bare assignment in
a loop. Two skills declaring the same id resolved in glob order and the loser left no
trace. The file was internally inconsistent: it guarded one identity axis carefully and
the other not at all, which is harder to spot than no guard at all, because the presence
of the slug guard reads as evidence that identity collisions were considered.

Both are live independent of the skill-id namespace work landing in parallel: prefixing
prevents CROSS-marketplace collisions, but two skills WITHIN one marketplace carry the
same prefix and one would still silently win.

## Fix Applied

**Judgement made, and the precedent it followed.** Warn-and-skip naming the file, not a
hard error. The ruling from CLI-445/CLI-446 (`reference/commands/index.md`, "An unusable
`metadata.yaml` refuses the whole run") is that the JUDGMENT is single and shared —
`readSkillMetadata` refuses a parse failure and a schema failure identically — while the
RESPONSE is per-caller: "discovery skips the skill, `doctor` reports it, `compile`
refuses." `extractAllSkills` is a discovery pass, and the response it had already chosen
for unusable metadata (the `safeParse` branch) was warn-and-skip. So the defect was never
the response; it was that a parse failure escaped the response entirely. Two in-repo
precedents fix the shape: `extractLocalSkill` (`lib/skills/local-skill-loader.ts`), whose
comment states the rule verbatim — "One file that describes no skill must skip its own
skill, not abort discovery for every command that loads the catalog" — and
`loadAgentsFromDir` (`lib/loading/loader.ts`), which warns per file naming the full path.
`warn()` is the user-visible channel, so this is loud per file; it is `verbose()` that
would have been a silent skip.

The `let` + `try`/`catch` form is copied from `readSkillMetadata`'s own parse boundary
rather than invented, and a comment now states what the `safeParse` below it does and does
not catch — the whole reason the bug survived review.

The duplicate-id guard mirrors the slug guard's wording and first-one-wins semantics, and
names both locations (`existing.path`, `skill.path`) since the id is what the two files
share. The loop moved into `buildResolvedSkillMap`, so the orchestrator now reads as two
symmetric named calls and the two identity guards live in structurally identical
functions — the asymmetry that hid the defect is gone at the level it existed.

**Tests.** Five red first: three pinning that an unparseable `metadata.yaml` does not
abort the scan, names its absolute path, and carries the parser's own reason; two pinning
that a duplicate id keeps the first skill and is reported. The duplicate-id red is the
finding in one line — the only warning emitted was `Duplicate slug 'react': already mapped
to 'web-framework-react', ignoring 'web-framework-react'`, one axis guarded and the other
not. Two further tests pin the existing correct behaviour either side of the change (the
slug guard still warns; two distinct ids both resolve with no warning at all).

`renderUnparseableMetadataYaml()` was added to `content-generators.ts` beside
`renderIncompleteMetadataYaml()`, whose doc comment already establishes the rule that an
error-path fixture asks for brokenness by name. The two are the same refusal class that
`readSkillMetadata` describes — a file nothing parses out of, and a file that parses
without the required fields — and only one of them had a renderer, so three specs and one
e2e helper had each hand-rolled their own broken YAML string.

## Proposed Standard

**`standards/clean-code-standards.md` — a rule for parse boundaries.** A `try`-less
`parseYaml`/`JSON.parse` sitting directly above a `safeParse` is an anti-pattern
independent of whether the throw is wanted, because the pair reads as one guarded
operation. Either wrap the parse or state in a comment that the throw is deliberate and
who catches it. This is worth a named rule precisely because it is invisible: the
codebase's own `readSkillMetadata` has the correct form, and the defect still shipped
twice within two modules of it.

**`standards/clean-code-standards.md` — identity guards come in complete sets.** When a
type has more than one identity axis (here `id` and `slug`), a guard on one and not the
other is worse than no guard, because the present guard is read as evidence the class was
considered. A module that dedupes on any axis should either dedupe on all of them or say
in a comment which axis is deliberately unguarded and why.

**`reference/features/skills-and-matrix.md`** should record that `extractAllSkills` refuses
per file rather than per scan, and that `mergeMatrixWithSkills` returns first-wins on both
identity axes — the same way `reference/commands/index.md` records the compile-side
refusal. The doc currently describes neither, which is the `rule-not-visible` half of the
root cause.

**Known adjacent gap, deliberately not fixed here.** The two warnings in `extractAllSkills`
now name the offending file two different ways — the pre-existing schema warning names the
glob-relative `metadataFile`, the new parse warning names the absolute `metadataPath`.
The new one follows the two per-file precedents (`extractLocalSkill`, `loadAgentsFromDir`),
both of which print the full path, and the brief required the path be nameable. Aligning
the older line is a one-word change to a passing assertion and belongs to whoever takes
D-214 item 11 (deduplicating the two `metadata.yaml` loader schemas), which will likely
route both through `readSkillMetadata` and settle the wording once.
