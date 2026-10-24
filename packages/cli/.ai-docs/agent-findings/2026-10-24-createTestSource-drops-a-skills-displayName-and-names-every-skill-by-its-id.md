---
type: anti-pattern
severity: low
affected_files:
  - packages/cli/src/cli/lib/__tests__/fixtures/create-test-source.ts
  - packages/cli/src/cli/lib/__tests__/helpers/disk-writers.ts
  - packages/cli/src/cli/lib/__tests__/commands/uninstall.test.ts
standards_docs:
  - packages/cli/CLAUDE.md
date: 2026-10-24
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  The field is honoured: `createTestSource` (source and local skills) and `writeSourceSkill` write
  the skill's own display name. Measured first: 23 specs in four files failed, each pinning the id
  where the product prints the name (panel rows, Changes lines, a sub-agent's gains and loses line,
  search's Name column, the name `init --from` records). Each now expects the real name, none
  loosened, and each reddens under an id-for-name product mutant that left its old copy green. The
  uninstall spec's helper that rewrote the folder's metadata.yaml is deleted, as are three comments
  saying the fixture names skills by id. `grep -rnE "displayName: (skill|config)\.id" src e2e`
  returns nothing. Uncommitted on 2026-10-24.
---

## What Was Wrong

`TestSkill` (`fixtures/create-test-source.ts`) declares a `displayName`, and `createTestSkill`
always fills it: from the slug, or from an override. But the builders that write a skill to disk
ignore it and write the skill's id in its place:

- `createTestSource`, for source skills and for `localSkills`;
- `writeSourceSkill` in `helpers/disk-writers.ts`.

A spec that passes a skill with a name therefore gets a folder that names the skill by its id, and
nothing reports this. The only trace is a docblock in `commands/search.test.ts`, which already
works around it.

The census, run with `git grep` from `packages/cli`, so it covers tracked files only:

- `git grep -nE "displayName: (skill|config)\.id" -- src/cli/lib/__tests__` returned three sites:
  `create-test-source.ts` twice (source skills, local skills) and `disk-writers.ts` once.
- `git grep -n "displayName: deriveDisplayName" -- src/cli/lib/__tests__/factories/skill-factories.ts`
  returned three: `createTestSkill`, `createMockSkill` and `createMockExtractedSkill`. The first
  builds a `TestSkill`, so every `TestSkill` carries a name the writers then drop.
- `git grep -lE "createTestSource\(|writeSourceSkill\(" -- 'src/*.ts' 'src/*.tsx' 'e2e/*.ts' 'scripts/*.ts' | wc -l`
  returned 39 files that call either writer. That counts callers. It does not count specs that
  depend on a skill being named by its id, which I did not measure.

It came up while pinning `uninstall`'s catalogue put-back. That spec needs a marketplace folder that
names its plugin by something other than the plugin's id. Otherwise the plugin row reads the same
whether or not the folder was read, and the spec cannot show that the folder read happened.

## Fix Applied

None to the fixture. In `commands/uninstall.test.ts`, the spec's local helper
`marketplaceFolderOffering` calls `createTestSource` and then writes that one skill's metadata.yaml
again through `renderMetadataYaml`, using the skill's own `displayName`.

## Proposed Standard

Either fix the builders, or make the type stop promising the field:

- **Honour the field.** `createTestSource` and `writeSourceSkill` write `skill.displayName`, as
  `writeTestSkill` already does for an installed copy. The helper in `uninstall.test.ts` can then
  go. Any spec that pins a source skill's name as its id would turn red. I did not measure how many,
  so run the full unit and e2e suites before choosing this.
- **Or drop the field from the type.** `TestSkill` stops carrying `displayName` for these writers,
  so the type no longer promises what they ignore.

This extends a rule in `packages/cli/CLAUDE.md`: "NEVER let a shared assertion helper's signature
overstate what it checks". That rule names assertion helpers. This is the same failure in a fixture
builder, whose type overstates what it writes. Nothing in CLAUDE.md conflicts with either option.
