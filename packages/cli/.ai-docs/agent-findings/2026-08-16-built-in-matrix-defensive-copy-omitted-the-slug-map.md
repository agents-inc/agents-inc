---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/lib/loading/source-loader.ts
  - src/cli/lib/matrix/skill-resolution.ts
standards_docs:
  - .ai-docs/reference/features/skills-and-matrix.md
date: 2026-08-16
reporting_agent: cli-tester
category: architecture
domain: cli
root_cause: convention-undocumented
status: resolved
resolved_by: >-
  D-214 item 3. `resolveBaseResult`'s inline literal became `copyOfBuiltInMatrix()`, which now
  copies `slugMap.slugToId` and `slugMap.idToSlug` alongside the three collections it already
  copied. Pinned by "source-loader local skill slugs > leaves the built-in matrix's own slug map
  alone" in `src/cli/lib/loading/source-loader.test.ts`, which asserts the merged matrix maps the
  local skill's slug AND that `BUILT_IN_MATRIX.slugMap.slugToId` does not.
---

## What Was Wrong

The default-source branch of `resolveBaseResult` (`src/cli/lib/loading/source-loader.ts`) handed
the caller a matrix built by spreading the module constant `BUILT_IN_MATRIX` and copying three of
its collections:

```ts
matrix: {
  ...BUILT_IN_MATRIX,
  skills: { ...BUILT_IN_MATRIX.skills },
  categories: { ...BUILT_IN_MATRIX.categories },
  suggestedStacks: [...BUILT_IN_MATRIX.suggestedStacks],
},
```

`slugMap` was not among them, so every default-source load shared ONE `slugToId` / `idToSlug` pair
with the shipped catalogue for the life of the process.

Nothing had written into it yet, which is why the omission was invisible: `mergeLocalSkillsIntoMatrix`
wrote `matrix.skills` and `matrix.categories` — both copied — and left the slug map alone. That
absence was itself the D-214 item-3 defect (`getSkillBySlug` threw for a user's own skill), so the
first correct fix for item 3 is also the first writer into the shared map. Written naively it would
have merged one project's local skill into `BUILT_IN_MATRIX` itself, where every later load in the
same process — `doctor`'s validate-then-check-health pass runs two — would read it.

The copy list was a per-field decision with no stated rule, so "which fields must be copied" was
answerable only by knowing what today's callers happen to mutate. That is a rule about the future
encoded as a snapshot of the present.

## Fix Applied

Extracted the literal to `copyOfBuiltInMatrix()` with the invariant stated in its JSDoc — every
collection the local-skill merge writes into is copied, because `BUILT_IN_MATRIX` is a module
constant — and added `slugMap` to the list.

The write itself goes through one exported helper, `claimSlug` in
`src/cli/lib/matrix/skill-resolution.ts`, used by both writers of the map (`buildSlugMap` during the
merge, `mergeLocalSkillsIntoMatrix` after it), so the collision rule cannot differ between them.

## Proposed Standard

`.ai-docs/reference/features/skills-and-matrix.md`, under "Data Flow" step 7 (the combined
pipeline), should state the rule the copy encodes rather than leaving it to be re-derived:

> **The default-source branch returns a COPY of `BUILT_IN_MATRIX`, and the copy is total over its
> mutable collections** — `skills`, `categories`, `suggestedStacks` and `slugMap`'s two records.
> `BUILT_IN_MATRIX` is a module constant that outlives any one load, so a field left shared is a
> field the next writer edits globally. Adding a mutable collection to `MergedSkillsMatrix` means
> adding it to `copyOfBuiltInMatrix()` in the same change; a partial copy fails only for the second
> caller in a process, which no single-command run reaches.
