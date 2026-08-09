---
type: architectural-drift
severity: medium
affected_files:
  - src/cli/lib/loading/loader.ts
  - src/cli/lib/skills/local-skill-loader.ts
  - e2e/fixtures/project-builder.ts
  - src/cli/lib/__tests__/content-generators.ts
standards_docs:
  - .ai-docs/standards/e2e/test-data.md
date: 2026-08-08
reporting_agent: cli-developer
category: testing
domain: cli
root_cause: scope-discipline-deferred
status: resolved
resolved_by: "CLI-446. readSkillMetadata now validates against localRawMetadataSchema as part of the same judgment, so compile refuses, local-skill discovery skips and doctor reports the SAME file — the refusal names the skill, the file and the missing fields in plain words (describeMetadataSchemaFailure). The fixture program landed with it: renderMetadataYaml fills the four required fields by default (82 of 100 call sites healed untouched), renderIncompleteMetadataYaml is the only way to write a broken one, and create-test-source/disk-writers stopped dropping fields their TestSkill already carried."
---

## What Was Wrong

CLI-445 made an UNREADABLE `metadata.yaml` a hard error under `compile`, and both passes now refuse
the same set of files. A `metadata.yaml` that PARSES but is missing required fields is still split
between them, and the owner's ruling — "no pass loads what another skips" — covers it in words.

Reproduced by hand against the 0.152.1 build, after CLI-445, on a project whose one local skill
carries `displayName`, `slug`, `author`, `cliDescription`, `usageGuidance` and `contentHash` but no
`category` and no `domain`:

```
    Loaded skill: web-testing-vitest
Discovered 1 local skills
...
  Skipping local skill 'web-testing-vitest': invalid metadata.yaml — category: Invalid input:
  expected string, received undefined; domain: Invalid input: expected string, received undefined
  Discovered 0 local skills from /…/.claude/skills
✓ Project compile complete!            (exit 0)
```

That is the same run printing both lines about the same file — the state CLI-445 closed for
unparseable files, one strictness level up. `compile`'s discovery reads the file only far enough to
know it can be read; the config-types pass validates it against `localRawMetadataSchema`, which
requires `displayName`, `slug`, `category` and `domain`.

## Why It Was Not Closed With CLI-445

Because the strictness that closes it is not compile's to choose alone — it decides what a valid
installed skill IS, and the e2e fixture layer currently writes skills that are not one.

Measured before choosing (a script over every `renderMetadataYaml(` call site in `e2e/`):

| Count | What                                                                                                            |
| ----- | --------------------------------------------------------------------------------------------------------------- |
| 99    | `renderMetadataYaml(` call sites in `e2e/`                                                                      |
| 81    | of them omit at least one field `localRawMetadataSchema` requires                                               |
| 34    | files carrying those 81                                                                                         |
| 2     | `ProjectBuilder` factories among them — `minimal()` (no `category`, no `domain`) and `editable()` (no `domain`) |

`ProjectBuilder.minimal()` is the fixture behind the compile suite, and `editable()` is behind the
edit/lifecycle suites, so refusing what the config-types pass refuses reddens most of `e2e/` until
the fixtures are repaired. The repair is not mechanical either: `category` decides wizard grouping,
category exclusivity and the generated `Category` union, so adding one to a fixture changes what
several wizard and config-types specs assert.

Note which side is wrong. The CLI's own generator (`generateMetadataYaml` in
`src/cli/commands/new/skill.ts`) writes `custom`, `domain`, `category`, `author`, `displayName`,
`slug`, `cliDescription`, `usageGuidance` and `contentHash`; an ejected skill is copied whole from a
source that carries the same. **No product path produces the metadata 81 of these fixtures write.**
The fixtures are the drift, not the schema.

## Fix Applied

Both decisions below were taken (owner ruling 2026-08-08: "incomplete metadata must fail and say
which skill failed why") and implemented as CLI-446.

**The judgment.** `readSkillMetadata` now runs `localRawMetadataSchema` after the parse and returns
`{ usable: true; metadata }` or `{ usable: false; reason }`. Both ways of describing nothing —
unparseable, and parseable without the required fields — are refused in one place, so `compile`
refuses, local-skill discovery skips and `doctor` reports the same set of files. `doctor` layers its
stricter published-skill checks on the fields that judgment returns rather than beside it, and
`local-skill-loader` no longer runs the schema itself. The refusal says which fields are missing in
plain words (`describeMetadataSchemaFailure` in `schemas.ts`) — Zod's own "expected string, received
undefined" describes the type system rather than the file.

The refused class widened, so the names did: `UnreadableSkillMetadata` → `UnusableSkillMetadata`,
`skillMetadataUnreadable{Detail,Error}` → `skillMetadataUnusable{Detail,Error}`, and the refusal
opens `The metadata.yaml of 'x' does not describe that skill` rather than `could not be read`.

**The fixture program.** `renderMetadataYaml` fills `displayName`, `slug`, `category` and `domain`
when a fixture does not name them — `local` for the category (the pseudo-category the schema accepts
and the generated unions exclude) and the category's own `<domain>-` prefix for the domain, so a
fixture that names a category gets the domain that category belongs to. 82 of the 100 call sites
healed without being touched. `renderIncompleteMetadataYaml(fields, omitted)` is the only way to
write a broken one, so incompleteness has to be asked for by name. Two fixture writers that dropped
fields their own `TestSkill` already carried were repaired: `create-test-source.ts` (local skills,
`category` + `slug`) and `disk-writers.ts` (`displayName`).

**What the churn actually was.** Six specs across four files, all one cause: they made a skill
"unresolvable" by installing it with metadata no product path produces. Once the metadata described
the skill, the wizard resolved it from the local install and nothing changed. Repaired at the
fixture layer with `unresolvableSkills` on `ProjectBuilder.editable`/`pluginProject` — config
entries with no files, which is how a project genuinely reaches that state. No product behaviour was
changed to make a spec pass; the `it.fails` KNOWN GAP in `edit-wizard-local.e2e.test.ts` is still
red for its own documented reason.

## Proposed Standard

Two decisions for the owner, in this order:

1. **A ruling on incomplete-but-parseable `metadata.yaml`.** Either it is refused (matching
   "no pass loads what another skips", and requiring the fixture program below), or the two passes
   are allowed to differ here on purpose — in which case say so in
   `.ai-docs/reference/features/` beside the loaders, because the next reader will find the same
   two lines in one run and file the same finding.

2. **If refused: a fixture program, tracked as its own row.** `renderMetadataYaml` in
   `src/cli/lib/__tests__/content-generators.ts` should require the four fields a real
   `metadata.yaml` carries rather than emitting whatever it is handed, so the type checker finds
   the 81 sites instead of a test run finding them one at a time. The rule belongs in
   [test-data.md](../standards/e2e/test-data.md): a fixture writes content the product could
   have written — one that no product path produces cannot fail for a reason the product has.
