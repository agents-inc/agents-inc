---
type: architectural-drift
severity: medium
affected_files:
  - src/cli/lib/skills/skill-plugin-compiler.ts
  - src/cli/types/plugins.ts
  - src/cli/lib/marketplace-generator.ts
  - src/cli/commands/build/marketplace.ts
  - e2e/commands/plugin-build-versioning.e2e.test.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-08-06
reporting_agent: cli-tester
category: architecture
domain: cli
root_cause: convention-undocumented
status: open
---

## What Was Wrong

A skill's `category` is present at the start of the plugin build and absent at the end of it. Nothing
drops it deliberately; it is simply never carried across, and the loss is silent because the only
surface that reads the field back tolerates its absence.

The chain, verified end to end:

1. **The category exists on the skill.** `metadataValidationSchema` in `src/cli/lib/schemas.ts`
   requires `category` as a `Category` enum member, and `customMetadataValidationSchema` requires it
   as any kebab-case string. Every `metadata.yaml` carries one.
2. **The compiler reads that file for one field.** `compileSkillPlugin`
   (`src/cli/lib/skills/skill-plugin-compiler.ts`) calls `readSkillMetadata(skillPath)` and then
   uses the result in exactly one place — `author: metadata?.author` in the
   `generateSkillPluginManifest` call. The parsed category is discarded on the next line.
3. **The manifest type has nowhere to put it.** `PluginManifest` (`src/cli/types/plugins.ts`)
   declares `name`, `version`, `description`, `author`, `keywords`, `commands`, `agents`, `skills`
   and `hooks`. There is no `category`.
4. **The marketplace converter never sets one.** `convertManifestToMarketplacePlugin` in
   `src/cli/lib/marketplace-generator.ts` returns name, source, description, version, author and
   keywords — nothing else. `MarketplacePlugin.category?` exists on the type and is never populated
   by any production path.
5. **The command prints the consequence and reads as normal.** `getMarketplaceStats` groups with
   `countBy(marketplace.plugins, (p) => p.category ?? "uncategorized")`, and
   `MarketplaceBuild.printStats` (`src/cli/commands/build/marketplace.ts`) logs a
   `Category breakdown:` header followed by one line per group. Because every plugin hits the
   `?? "uncategorized"` fallback, every marketplace this CLI generates prints a single row naming
   its whole plugin count as uncategorized.

The shape worth naming is step 5. A `?? "uncategorized"` fallback written for genuinely
category-less external plugins turns a total data loss into a well-formatted report. The breakdown
looks like a feature working on data that happens to be uniform, rather than a field that never
arrived — so a summary designed to make the marketplace legible is the thing hiding that it is not.

The optional `category?` on `MarketplacePlugin` compounds it: the type says the field is expected,
so a reader auditing the type rather than the writers concludes the pipeline supports categories.

Pinned by an `it.fails` spec in `e2e/commands/plugin-build-versioning.e2e.test.ts` —
`it.fails("carries a category on every plugin entry")`, asserting
`marketplace.plugins.map((p) => p.category)` contains no `undefined`. It flips to a failure the day
the field starts arriving, which is the intended signal.

Tracked as CLI-367 in `todo/cli.md`. **Note for whoever picks it up: `CLI-367` is currently used by
two rows in that tracker** — the `agent.liquid` snake_case row and this one. The ID needs splitting
before either row is worked.

## Fix Applied

None — discovery only. No product code changed.

## Proposed Standard

Two rules, both for `.ai-docs/standards/clean-code-standards.md`.

1. **A `??` fallback over a field another layer is responsible for populating must not be the only
   thing that observes it.** Where a default exists to absorb genuinely absent external data, a
   pipeline that produces the data itself needs a separate assertion that it arrived — otherwise
   the fallback converts a systematic loss into indistinguishable normal output. Under "Data
   Integrity" alongside the existing orphan-config rule, which is the same shape: a tolerant reader
   masking a writer that never wrote.

2. **A field declared optional on a type must have at least one production writer, or say in place
   that it is externally supplied only.** `MarketplacePlugin.category?` reads as pipeline-supported
   and is not. A one-clause comment naming who is expected to set it costs nothing and is the only
   thing that distinguishes "optional because external data varies" from "optional because we never
   fill it in".
