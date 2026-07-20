---
type: standard-gap
severity: medium
affected_files:
  - e2e/fixtures/project-builder.ts
  - src/cli/lib/__tests__/content-generators.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-07-20
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: enforcement-gap
supersedes: 2026-07-20-project-builder-derived-slug-hid-wrong-category.md
---

## What Was Wrong

`e2e/fixtures/project-builder.ts` mapped `web-state-zustand` to the category `web-state`.
No such category exists — the canonical one is `web-client-state` (see `CATEGORIES` in
`src/cli/types/generated/source-types.ts`, and every `web-state-*` assignment in
`src/cli/lib/configuration/default-stacks.ts`).

The value was a leftover from a since-removed `skillId.split("-")` derivation. The prior
finding (`2026-07-20-project-builder-derived-slug-hid-wrong-category.md`) replaced the
derivation with an explicit lookup table but deliberately preserved the wrong value to keep
that pass byte-identical, deferring the correction. This finding closes that deferral.

The deeper issue is not the one bad literal — it is that **nothing could ever have caught
it**. `SkillMetadataFields.category` in `src/cli/lib/__tests__/content-generators.ts` is
typed `string`, not `Category`. So every fixture-authored category is unvalidated: a
fixture can write a metadata.yaml describing a category the product does not have, and
both the type checker and the whole e2e suite stay green.

That `string` typing is **not** itself a defect to fix. It is load-bearing:
`ProjectBuilder.withCustomSkill` intentionally writes `category: "web-custom-e2e"`, a
non-canonical category, precisely to exercise custom-skill handling. Narrowing the field to
`Category` would break that fixture. The gap is therefore a review-discipline gap, not a
type-tightening opportunity — which is exactly why it needs to be written down rather than
enforced by the compiler.

## Fix Applied

Corrected the single entry in `SKILL_CATEGORY_SLUGS`:

```ts
"web-state-zustand": { category: "web-client-state", slug: "zustand" },
```

Replaced the on-site comment, which had documented the wrong value as intentional, with a
forward-looking constraint naming the authoritative source and the specific trap:

```
 * Every `category` here must be a member of `CATEGORIES` in
 * `src/cli/types/generated/source-types.ts` — note that `web-state-*` skills
 * belong to `web-client-state`, not to a `web-state` category.
```

**No test assertion changed.** The prior finding flagged the `it.fails` test
`"should show all skill IDs in output"` in `e2e/commands/list.e2e.test.ts` as the only site
reaching this entry and required it to be re-evaluated. Re-evaluated and verified by
running it: it still fails internally, so it correctly remains `it.fails`.

The reason is structural, not incidental. Under a non-TTY stdout the `list` command returns
early through `formatInstallationDisplay` (`src/cli/lib/plugins/plugin-info.ts`), which
emits only counts and paths — `Skills: <n>`, `Agents: <n>`, `Config: <path>`. It never
emits skill IDs, and it never reads metadata.yaml at all. A fixture's `category` is
therefore invisible to every assertion in that test. Confirmed by grep that this is the
only `ProjectBuilder` call site reaching the zustand entry; the other zustand-bearing specs
go through `e2e/fixtures/plugin-install-state.ts`, which does not use this table.

## Proposed Standard

Add to `.ai-docs/standards/e2e/anti-patterns.md`, adjacent to the "Derived fixture metadata"
entry proposed by the superseded finding:

**Fixture literals that mirror a generated union must be diffed against that union.**
`renderMetadataYaml` accepts `category`, `domain`, and `slug` as `string` on purpose, so
that fixtures can author deliberately invalid values for error-path tests. That means the
type checker will never validate a fixture's category. When adding or editing an entry in a
fixture category/slug table, grep the value against `CATEGORIES` in
`src/cli/types/generated/source-types.ts` and confirm it is a member — or, if it is
intentionally not a member, say so in a comment naming the test that depends on it (as
`withCustomSkill` does). A category literal with neither property is a latent bug that no
gate will report.

Corollary worth stating explicitly: **"no test failed" is not evidence a fixture value is
correct.** Here the wrong category sat in a fixture feeding 91 call sites with the suite
fully green, because no assertion happened to read it. Fixture correctness has to be
established against the product's source of truth, not against the suite's exit code.
