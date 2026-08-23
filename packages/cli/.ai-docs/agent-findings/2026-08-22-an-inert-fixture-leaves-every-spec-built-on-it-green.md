---
type: anti-pattern
severity: high
affected_files:
  - e2e/fixtures/project-builder.ts
  - src/cli/lib/__tests__/content-generators.ts
  - src/cli/lib/skills/local-skill-loader.ts
  - src/cli/lib/compiler.ts
  - src/cli/lib/compiler.test.ts
  - src/cli/lib/__tests__/fixtures/agents/_templates/agent.liquid
standards_docs:
  - .ai-docs/standards/e2e/test-data.md
date: 2026-08-22
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: missing-rule
status: resolved
resolved_by: >-
  Both instances were repaired and each was given an assertion that reddens if it recurs.
  `ProjectBuilder.minimal()` now reads its skill's identity from `metadataFieldsFor`, and a new
  spec in `e2e/commands/compile.e2e.test.ts` holds the generated `Category` union against the
  category the fixture states. The dead template copy moved out of `createProjectFromFixtures`
  into `installProjectTemplateOverride`, called by the one spec whose subject is the override,
  and the vacuous `typeof engine.renderFile` spec was replaced by a rendering pair.
---

# An inert fixture leaves every spec built on it green

## What Was Wrong

Two fixtures in this tree produced artefacts nothing consumed. Neither failed. Both made the specs
standing on them look like coverage of something the specs never reached.

**Content the loader refuses.** `ProjectBuilder.minimal()` wrote its one local skill's
`metadata.yaml` through `renderMetadataYaml` without naming a `category`. `completeMetadata` in
`src/cli/lib/__tests__/content-generators.ts` fills the omission with `LOCAL_PSEUDO_CATEGORY`, and
`extractLocalSkill` in `src/cli/lib/skills/local-skill-loader.ts` refuses that value
unconditionally — the pseudo-category belongs to no domain, so the skill joins no matrix category
and no sub-agent can be given it. Every spec compiling that project compiled a sub-agent from an
installation whose only skill was invisible to the matrix, and printed the refusal in its own
output the whole time:

```
Warning: Skipping local skill '<id>': category 'local' is a placeholder, not a real category,
so no sub-agent can be given this skill.
```

The generated `config-types.ts` recorded the consequence plainly — `export type Domain = never;`
and `export type Category = never;` beside a `SkillId` union grouped under `// Custom` — and no
assertion read either.

**A path no resolver reads.** `createProjectFromFixtures` in `src/cli/lib/compiler.test.ts` copied
a fixture `agent.liquid` to `<temp>/src/agents/_templates/`. `createLiquidEngine(projectDir)` in
`src/cli/lib/compiler.ts` builds its root list from `<projectDir>/.claude-src/agents/_templates`,
`<projectDir>/.claude/templates` and `<CLI_ROOT>/src/agents/_templates` — the last of those is the
SHIPPED root under the CLI's own tree, not under the project. `<projectDir>/src/agents/_templates`
is no root at all, so nothing ever rendered the fixture. The spec that looked like it covered the
feature, `it("checks for local template overrides when projectDir provided")`, asserted only
`typeof engine.renderFile === "function"` — true of an engine with no roots at all.

The two halves are one class seen from either end: a fixture is inert when its CONTENT is
something no product path accepts, and equally when its LOCATION is somewhere no product path
looks. In both cases the fixture writes successfully, the spec passes, and the artefact under test
is not the artefact the product would have.

## Fix Applied

`ProjectBuilder.minimal()` spreads `metadataFieldsFor(MINIMAL_PROJECT_SKILL_ID)`, which is the
same table three other sites in that file already read; the skill now carries its real category,
slug and display name. A spec beside the existing compile specs asserts what the fixture change
buys: the compile output carries no placeholder refusal, and `readGeneratedUnionMembers(types,
"Category")` equals the category the fixture states. It fails against the old fixture on both
halves.

The template copy left `createProjectFromFixtures` for `installProjectTemplateOverride`, which
writes to `<projectDir>/.claude-src/agents/_templates/agent.liquid` — the first root
`createLiquidEngine` resolves and where `eject templates` writes. Two specs replaced the vacuous
one: a project with the override renders the fixture's marker and none of the shipped template's
unconditional frontmatter, and a project without one renders the shipped template and no marker.
Writing the override back to the old `<projectDir>/src/agents/_templates/` reddens the first,
which is the evidence that the old location was dead.

## Proposed Standard

A rule for `.ai-docs/standards/e2e/test-data.md`, in the section on fixtures:

> **A fixture asserts on the artefact it wrote at least once.** Writing a file is not evidence
> that any product path reads it. Where a fixture writes something a loader can refuse — a
> metadata field, a category, an id — one spec holds the artefact the product DERIVED from it
> against a named expectation, so a refusal is a failure rather than a warning in the output.
> Where a fixture writes to a path a resolver has to find, the spec that exercises the resolver
> installs it, rather than a shared builder writing it for everybody.

Two notes on scope, both learned here. This is not the existing "never construct test data inline"
rule from another angle: both fixtures used the sanctioned generators and the sanctioned helpers,
and the defect is downstream of construction. And the default that produced the first instance is
in the generator rather than in the fixture — `completeMetadata` filling an omitted `category`
with the one value `local-skill-loader.ts` refuses. Changing that default is a separate decision
with its own call sites (`renderIncompleteMetadataYaml` builds on it) and is deliberately not
proposed here. Every call site is listed by the command below, and each block that names no
`category` of its own is one still taking the default:

```
grep -rn -A6 -F 'renderMetadataYaml({' e2e src --include='*.ts' --include='*.tsx'
```
