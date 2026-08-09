---
type: standard-gap
severity: medium
affected_files:
  - e2e/commands/compile.e2e.test.ts
  - e2e/commands/compile-edge-cases.e2e.test.ts
  - src/cli/lib/loading/source-loader.ts
standards_docs:
  - .ai-docs/standards/e2e/assertions.md
  - .ai-docs/standards/e2e/user-journeys.md
date: 2026-08-08
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: convention-undocumented
status: resolved
resolved_by: >-
  Both rulings landed 2026-08-08. Row 2 (the "Compiling global agents" banner over a
  collapsed HOME) was ruled correct as-is, so its 8 sites pin intended behaviour. Row 1 was
  ruled a hard error and implemented as CLI-445: `readSkillMetadata` in
  src/cli/lib/loading/loader.ts is now the one judgment of whether a metadata.yaml can be
  read, shared by compile's skill discovery, the local-skill discovery behind config-types
  generation, and doctor's content layer; compile refuses the run over any file it refuses,
  naming the skill, the file and the parse reason. The compile-edge-cases spec was rewritten
  to the ruling and e2e/commands/compile-malformed-skill-metadata.e2e.test.ts added. One half
  of the divergence is deliberately NOT closed and is filed separately — see
  2026-08-08-parseable-but-incomplete-skill-metadata-still-splits-the-two-compile-passes.md.
---

## What Was Wrong

Two `compile` specs assert behaviour that no ruling, finding or standard establishes. Both were
found by the CLI-444 strictness audit and both were deliberately left untouched during its
remediation: rewriting them requires deciding what the product should do, which is an owner call,
not a test call.

**1. `compile-edge-cases` → "should skip skill with completely malformed metadata.yaml".**

The spec's name says the skill is skipped. Its body comment says the opposite — "the
broken-metadata skill should still be loaded via SKILL.md frontmatter (metadata.yaml is separate
from skill loading in `loadSkillsFromDir`)" — and its only output assertion is
`toMatch(/Discovered \d+ local skills/)`, which matches any count and therefore both readings at
once. The name and the assertions disagree and neither cites a ruling.

The product itself is not consistent about it either. A `compile --verbose` run against a project
whose local skill has metadata missing `category` and `domain` prints both of these in one run:

```
    Loaded skill: web-testing-vitest
    Found 1 local skills from .claude/skills/
...
  Skipping local skill 'web-testing-vitest': invalid metadata.yaml — category: …; domain: …
  Discovered 0 local skills from /…/.claude/skills
```

The compile pass loads it; the `config-types.ts` regeneration pass skips it. Whichever is right,
the two disagree, and the spec's `\d+` is green against either.

**Ruling needed:** is a local skill with unparseable or incomplete `metadata.yaml` loaded from its
`SKILL.md` frontmatter, or skipped? And must both passes agree?

**2. `compile` → the `Compiling global agents` banner over an all-`project` config (8 assertion
sites across `compile.e2e.test.ts`).**

`ProjectBuilder.minimal()` writes a config whose skills and agents are all `scope: "project"`, and
`CLI.run` defaults `HOME` to the project directory. The run therefore reports `Compiling global
agents` and the specs pin that string. No ruling says a home-context compile should claim the
global pass over project-scoped agents — the expectation was read off the output.

The journey is covered from scratch elsewhere (`lifecycle/init-edit-compile-roundtrip`,
`commands/compile-project-scope-containment`), so this is not a coverage hole; it is an
un-derived expectation that would keep the suite green through a change in the banner's meaning.

**Ruling needed:** when `HOME` and the project directory are the same path and every config entry
is `scope: "project"`, which pass does `compile` announce — and is the current answer intended or
an artefact of the collapsed roots?

## Fix Applied

Discovery only at the time of writing. Both questions were ruled on the same day and row 1 was
implemented as CLI-445; what landed is recorded in `resolved_by` above and in
[todo/plans/CLI-444-e2e-strictness-audit.md](../../../../todo/plans/CLI-444-e2e-strictness-audit.md)
under "Owner rulings (2026-08-08)".

What the hard error covers is the file the reproduction above opens with: a `metadata.yaml` that
cannot be READ — unparseable YAML, or a file that parses to something other than a mapping of
fields (empty, comments-only, a list, a scalar). Both passes now refuse exactly that set, and
`compile` exits `EXIT_CODES.ERROR` over it.

What it does NOT cover is the SECOND file in the reproduction: a `metadata.yaml` that parses but is
missing `category` and `domain`. There, `compile` still loads the skill from `SKILL.md` while the
config-types pass still skips it — the same one-loads-one-skips shape, one strictness level up.
Closing that means refusing whatever `localRawMetadataSchema` refuses, which 81 of the 99
`renderMetadataYaml` fixtures across 34 e2e files fail, `ProjectBuilder.minimal()` and
`.editable()` among them. That is a fixture program and a second owner call, not compile's
contract, and it is filed as its own finding rather than done under this one.

The original note stands for the record: the CLI-444 remediation explicitly excluded inventing
rulings, so these rows were reported rather than rewritten.

Four sibling rows from the same audit class WERE repaired in the same pass, because each had an
expected value derivable from a fixture or a definition without a new ruling:

| Spec                                                    | Was                                         | Now                                                                                    |
| ------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------- |
| `compile` → agents with content after frontmatter       | `contains: ["#"]`                           | `toHaveAgentDynamicSkills` (frontmatter stripped) + a body-after-terminator regex      |
| `compile` → custom skill in frontmatter                 | `contains` over the whole file              | `toHaveAgentFrontmatter({ exactSkills })`                                              |
| `interactive/init-wizard-ui` → skills grouped by domain | `READY_TO_INSTALL` only                     | scope heading, stack name, marketplace row, the added skills, a negated unselected one |
| `lifecycle/config-scope-integrity` → Domain type        | `expect(match?.[0] ?? "").not.toContain(x)` | structural `loadConfigOrFail` + a negated undeclared domain                            |

Each of the four was mutation-checked: the product was broken, the spec was watched go red for the
reason its name claims, and the product was restored.

## Proposed Standard

`.ai-docs/standards/e2e/assertions.md` should carry a short rule under its expected-value section:

> **An expected value is derived, never observed.** Every expected value comes from a ruling, a
> definition file, or the test's own input fixture. If you cannot name where a value came from,
> you read it off the output, and the assertion pins whatever the product happened to do — including
> the defect. When no ruling exists and one is needed, the spec is a question for the owner: record
> it as a finding and leave the spec alone rather than inventing an answer in an assertion.

The corollary belongs in the same section: **a spec whose name and whose body comment disagree is a
defect report, not a test.** One of them is wrong, and until it is settled the spec cannot fail for
the reason it claims.
