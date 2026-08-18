---
type: standard-gap
severity: low
affected_files:
  - e2e/commands/compile-edge-cases.e2e.test.ts
  - src/cli/lib/__tests__/content-generators.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-07-20
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: rule-not-specific-enough
status: open
---

<!--
Read beside the field-set gap — `contentHash` is typed required on `SkillMetadataFields`, so
`renderMetadataYaml()` always emits it and no fixture can ask for its absence. That gap is
fixable by making the field optional; the invalid-by-design gap recorded here is not. Neither
subsumes the other, and this one stays open until the single carve-out note lands.
-->

## What Was Wrong

CLAUDE.md bans hand-written metadata/frontmatter template strings in tests ("NEVER write
inline SKILL.md frontmatter or agent YAML template strings — use `renderSkillMd()`,
`renderAgentYaml()` from `content-generators.ts`"). `renderMetadataYaml()` is that family's
`metadata.yaml` renderer, and the Pass 8 Cluster G sweep converted inline `metadata:`
strings to it across the e2e tree.

One class of exception is already known: a fixture whose _field set_ the renderer cannot
express, because `contentHash` is typed required on `SkillMetadataFields` and always
emitted. That one is fixable — making the field optional would remove the exception.

There is a second class that is **permanently** unfixable, and it was not documented.
`e2e/commands/compile-edge-cases.e2e.test.ts` — test "should skip skill with completely
malformed metadata.yaml" — writes:

```ts
await writeFile(
  path.join(badMetadataSkillDir, FILES.METADATA_YAML),
  `{{{ this is not: valid: yaml: "at all`,
);
```

The fixture's entire purpose is that the bytes are **not parseable YAML**. A renderer whose
contract is "emit well-formed YAML" can never produce this by construction, no matter which
fields become optional. The same file has a sibling case one test earlier: a `SKILL.md` written
with deliberately unbalanced quotes in its frontmatter, which `renderSkillMd()` likewise cannot
emit.

The risk is concrete and repeating. Both sites match the grep a metadata/frontmatter sweep
runs (`writeFile(..., FILES.METADATA_YAML, ...)` / a backtick template written to `SKILL.md`),
so each sweep re-proposes them, and a sweep that reads the CLAUDE.md rule as absolute would
"fix" them into valid YAML — silently deleting the only thing the tests assert, with no
assertion changing to signal it.

## Fix Applied

None to those two sites — deliberately left as raw templates; this pass was strictly
behaviour-preserving. Every other inline metadata string in the five owned files
(`compile.e2e.test.ts`, `compile-edge-cases.e2e.test.ts`, `compile-scope-filtering.e2e.test.ts`,
`dual-scope.e2e.test.ts`, `list.e2e.test.ts`) was converted to `renderMetadataYaml()` — 19
sites, each proven byte-identical against its original literal by a scratchpad vitest run
before the swap, including one 5-field site
(`custom` / `author` / `displayName` / `category` / `contentHash`) whose hand-written order
already matched the renderer's fixed field order.

## Proposed Standard

Add to `.ai-docs/standards/e2e/anti-patterns.md`, in the test-data/fixtures section, a single
carve-out note covering both classes:

> **The no-inline-metadata rule applies only where the renderer is expressive enough.**
> `renderSkillMd()` / `renderMetadataYaml()` are mandatory for every fixture whose content
> they can emit field-for-field. Two kinds of fixture are sanctioned exceptions and must stay
> as raw template strings:
>
> 1. **Field-set gaps** — the fixture must omit a field the renderer always emits
>    (`author`, `contentHash`). Known instance: `outdatedForkMetadata` in
>    `e2e/interactive/update.e2e.test.ts`.
> 2. **Invalid-by-design fixtures** — the fixture must be unparseable, because _being_
>    unparseable is what the test asserts on. A well-formed-output renderer can never
>    express these. Known instances: the malformed `metadata.yaml` and the unbalanced-quote
>    `SKILL.md` frontmatter in `e2e/commands/compile-edge-cases.e2e.test.ts`
>    ("broken YAML in skill metadata" describe block).
>
> Name these sites here the same way the "documented raw-text survivors" are named
> elsewhere, so a sweep can confirm an exception is known rather than re-deriving it.

Class 2 is permanent and should be stated as such — unlike class 1, no change to
`SkillMetadataFields` can retire it.
