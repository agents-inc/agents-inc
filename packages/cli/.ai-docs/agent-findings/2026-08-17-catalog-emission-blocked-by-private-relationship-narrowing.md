---
type: architectural-drift
severity: medium
affected_files:
  - packages/cli/src/cli/lib/loading/source-loader.ts
  - packages/cli/src/cli/commands/build/marketplace.ts
  - packages/cli/scripts/generate-source-types.ts
  - packages/matrix/src/matrix-schema.ts
  - packages/matrix/src/built-in-matrix.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-08-17
reporting_agent: cli-tester
category: architecture
domain: cli
root_cause: convention-undocumented
status: partial
partial_note: >-
  The blocker this finding is named for is GONE, and the section below headed "catalog.json
  emission was NOT implemented" has been corrected in place rather than left standing — it was
  the load-bearing claim and it is now false. `loadMarketplaceMatrix(marketplaceDir)` is exported
  from `src/cli/lib/loading/source-loader.ts` and re-exported through `lib/loading/index.ts`;
  `build marketplace`'s `writeCatalog` calls it and writes `catalog.json` beside the manifest,
  unconditionally, pinned by `src/cli/lib/__tests__/commands/build/marketplace-catalog.test.ts`
  against `matrixSchema`. So the narrowing is reachable without duplication and without the
  local-skill merge. What remains open is everything the finding proposed BEYOND that one caller,
  and none of it has moved. The three-caller consolidation has not happened: `generatePhase2` in
  `scripts/generate-source-types.ts` still passes `defaultRules.relationships` unnarrowed
  straight to `mergeMatrixWithSkills`; the third candidate, `loadAndMergeSkillsMatrix` in
  `lib/matrix/matrix-loader.ts`, was DELETED on 2026-08-19 along with its barrel export, so the
  consolidation now has two callers to unify and a function to write rather than one to widen. The
  rule "`mergeMatrixWithSkills` is a resolution primitive, not an entry point" is not written into
  `reference/features/skills-and-matrix.md`. The second observation still holds — `/home/vince/dev/skills`
  has no `config/` directory, so its stacks reach a build only through `defaultStacks` and only
  under `isDefaultSource`, and `built-in-catalogue.md` documents that mechanism without stating
  the consequence for an artefact built from a checkout. The third is CLOSED: the rule it asked for
  is `standards/typescript-types-bible.md` § 12b, and on 2026-08-19 the file it named was renamed
  `built-in-matrix.ts` with every schema in it camelCased — `builtInMatrixSchema` is the export the
  owner's ruling named, anchored to `BUILT_IN_MATRIX`, the one constant it validates — so the
  package runs one convention and the case-only twin it warned about is gone.
---

## What Was Wrong

Three call sites want "a `MergedSkillsMatrix` built from a marketplace on disk", and there is no
shared function that answers. Each reaches for `mergeMatrixWithSkills` and assembles its own inputs:

| Caller                                                                                                           | Categories                            | Relationships                                                    | Stacks                                                  |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------- |
| `generatePhase2` (`scripts/generate-source-types.ts`)                                                            | `defaultCategories`                   | `defaultRules.relationships`, **unnarrowed**                     | `defaultStacks.map(resolveStack)`                       |
| `loadAndMergeFromBasePath` (`source-loader.ts`, private, reachable through the exported `loadMarketplaceMatrix`) | `{ ...defaultCategories, ...source }` | `relationshipsForSource` — source rules + **narrowed** built-ins | `resolveOfferedStacks` -> `convertStackToResolvedStack` |
| `loadAndMergeSkillsMatrix` (`matrix/matrix-loader.ts`) — **deleted 2026-08-19**                                  | source only, both files mandatory     | source only                                                      | none                                                    |

The third had **no callers at all** — it was exported through `lib/matrix/index.ts` and reached by
nothing, so the barrel advertised a matrix builder that no production path used. It was deleted on
2026-08-19; the row stays because it is the third arrangement of the same inputs and the reason the
consolidation is worth doing at all.

The consequence is that the one orchestration which is actually correct for a marketplace is
private to `source-loader.ts`, and the difference is not cosmetic. Measured against a freshly
scaffolded marketplace (`agents-inc new marketplace acme`, one skill):

| Route                                                  | `unresolvedSlugs` in the matrix | warnings printed |
| ------------------------------------------------------ | ------------------------------- | ---------------- |
| via `source-loader`'s private `relationshipsForSource` | 0                               | 0                |
| via `mergeMatrixWithSkills` + `defaultRules` directly  | **176**                         | **250**          |

`narrowToShippedSlugs` is what makes the difference, and it is unexported and untestable from
outside its file. So any new caller that needs a marketplace's matrix — `build marketplace` emitting
`catalog.json` for EDITOR-30 is the live one — must either duplicate ~45 lines of narrowing, or
call the public `loadSkillsMatrixFromSource`, which unconditionally merges the invoking machine's
`~/.claude/skills` into the result (`mergeDiscoveredLocalSkills(matrix, homeDir, "global")`). For an
author-time artefact that ships to consumers, the second is worse than the first: it bakes the
author's private local skills into a published catalogue.

That third route now exists and is neither of those two: `loadMarketplaceMatrix` wraps the private
orchestration and exports it under a name that says which load it is, so `build marketplace` gets
the narrowing without the local merge and without a copy. The measurement above is why the wrapper
had to exist rather than the command reaching for `loadSkillsMatrixFromSource`. It settles the
`build marketplace` caller only — see the `partial_note` for what the finding still asks for.

A second, quieter finding sits beside it. **The public catalogue repository ships no
`config/stacks.ts`.** `/home/vince/dev/skills` has no `config/` directory at all; its 17 stacks live
in the CLI's `defaultStacks`, and `resolveOfferedStacks` hands them over only when
`isDefaultSource(source)` is true — which it is not when the source is the repository's own
absolute path. Loading that repository as a local source therefore yields `suggestedStacks: []`,
while `BUILT_IN_MATRIX` carries 17. Any artefact `build marketplace` emits from inside that
repository inherits the empty list.

Third: `packages/matrix` runs two schema-naming conventions. `schema.ts` uses PascalCase
(`MatrixSchema`, `ResolvedSkillSchema`); `seed.ts` and `skill-index.ts` use camelCase
(`seedPayloadSchema`, `skillIndexSchema`). Nothing records which is current, so a new schema file
has to guess — and a camelCase `matrixSchema` beside a PascalCase `MatrixSchema` differs only in the
first character's case, which is a name collision a reader cannot see.

## Fix Applied

Partial, and deliberately scoped.

`matrixSchema` was added in `packages/matrix/src/matrix-schema.ts` — the vocabulary-free wire
contract for a catalogue, exported both as the `./matrix-schema` subpath and through the package
barrel, following `seedPayloadSchema`. It was put in its own file rather than beside `MatrixSchema`
precisely to avoid the case-only collision described above, and its doc comment states the
distinction: `MatrixSchema` narrows every id to the vendored vocabulary and so rejects every
marketplace but the shipped one; `matrixSchema` describes the shape and accepts any.

`matrixShapeIssues` was added to `scripts/generate-matrix-package.ts` and wired into
`run-generate-matrix-package.ts`, so `generate:matrix` and `generate:matrix:check` both refuse an
artefact that is no longer a matrix. Byte-comparison alone cannot catch a type generator that emits
a differently-shaped catalogue and vendors it faithfully; that failure lands in `packages/matrix` at
import time, a package away from what moved.

**`catalog.json` emission from `build marketplace` was not implemented in the pass that wrote this
finding**, because it cannot be done correctly without exporting or extracting
`loadAndMergeFromBasePath` (or at least `relationshipsForSource`) from `source-loader.ts`, and that
file was out of that task's bounds — another agent held it, with 616 uncommitted lines across it
and `multi-source-loader`. Building it anyway would have meant shipping the duplicated narrowing
this finding is about.

**It has since been implemented, and by exactly the export this paragraph said it needed.**
`source-loader.ts` exports `loadMarketplaceMatrix(marketplaceDir)`, a two-line wrapper that calls
`loadAndMergeFromBasePath(marketplaceDir, marketplaceDir)` — so a marketplace's base path stands
as its own source string — and its doc comment states the distinction this finding drew: it is
deliberately not `loadSkillsMatrixFromSource`, because that one merges the invoking machine's
`~/.claude/skills` and the project's own, "which is right for an install and wrong for anything
published". `BuildMarketplace.writeCatalog` calls it and writes `catalog.json` beside the
manifest with `generatedAt: GENERATED_AT_BUILD`, unconditionally and with no flag, on the stated
grounds that a consumer cannot tell an author who omitted a flag from a marketplace that is
broken. `src/cli/lib/__tests__/commands/build/marketplace-catalog.test.ts` asserts the artefact
against `matrixSchema`. The duplicated narrowing this finding exists to prevent was therefore
never shipped; what the fix did NOT do is the consolidation below.

## Proposed Standard

Extract the marketplace-matrix orchestration into one exported function, and let both remaining
callers reach it. This section originally said to widen `loadAndMergeSkillsMatrix` rather than add a
fourth builder; that function has since been deleted for having no callers, so the shared function
is a new export — optional categories and rules files, a `skillsDir` override, and relationship
narrowing — after which `loadAndMergeFromBasePath` calls it and the private half goes. Nothing is
lost by having deleted the dead one first: the consolidation was always going to rewrite its body
entirely, and keeping a zero-caller export alive as a placeholder for work nobody had scheduled is
what let it read as a maintained entry point for months. Local-skill discovery stays in
`source-loader.ts`, where it belongs: it is an install-time concern and must never reach an artefact
an author publishes.

Record the rule in `.ai-docs/reference/features/skills-and-matrix.md`: **`mergeMatrixWithSkills` is
a resolution primitive, not an entry point.** A caller that wants a marketplace's matrix goes
through the shared loader, because the narrowing, the category merge and the stack fallback are
three separate decisions each caller would otherwise re-derive — and two of the three current
callers already disagree.

Record the naming rule in `.ai-docs/standards/typescript-types-bible.md`: **Zod schema exports are
camelCase, suffixed `Schema`.** Name the older PascalCase exports in `packages/matrix/src/schema.ts`
as the exception pending a rename, so the next author does not have to guess and does not mint a
second case-only twin.

Record in `.ai-docs/reference/features/built-in-catalogue.md` that the public catalogue repository
ships no `config/stacks.ts`, so its stacks are reachable only through `defaultStacks` and only when
the source resolves as the default — an artefact built from a checkout of that repository has no
stacks in it.
