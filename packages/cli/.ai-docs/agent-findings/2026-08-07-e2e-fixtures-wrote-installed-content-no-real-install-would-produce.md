---
type: anti-pattern
severity: medium
affected_files:
  - e2e/helpers/test-utils.ts
  - e2e/commands/doctor-diagnostics.e2e.test.ts
  - e2e/commands/uninstall-global-propagation.e2e.test.ts
  - e2e/lifecycle/doctor-global-scope-blind-spots.e2e.test.ts
  - e2e/lifecycle/doctor-dual-scope.e2e.test.ts
  - src/cli/lib/__tests__/commands/doctor.test.ts
standards_docs:
  - .ai-docs/standards/e2e/README.md
date: 2026-08-07
reporting_agent: cli-developer
category: testing
domain: e2e
root_cause: enforcement-gap
status: partial
partial_note: the code-side fixes landed with D-210 (nine fixtures corrected, `writeAgentFile`'s frontmatter option made schema-valid); the standard naming "fixtures must satisfy the schema the product writes" is not written into `.ai-docs/standards/e2e/README.md` yet
---

## What Was Wrong

Merging `validate` into `doctor` (D-210) made `doctor` validate every installed
`SKILL.md`, `metadata.yaml` and compiled agent `.md` against the strict schemas. Nine
existing fixtures then failed — not because the new code was wrong, but because they had
been writing installed content **no real install could produce**, and nothing had ever
looked:

| Fixture                                                            | What it wrote                                                           | Why a real install never would                                                                |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `writeAgentFile(dir, name)` default                                | `# <name>` with no frontmatter                                          | every compiled agent carries `name` + `description`                                           |
| `writeAgentFile(dir, name, { frontmatter: true })`                 | frontmatter with `name` only                                            | `agentFrontmatterValidationSchema` also requires `description`                                |
| `FORKED_FROM_METADATA`                                             | `author` + `contentHash` + `forkedFrom` only, `contentHash: "e2e-hash"` | a fork copies the origin's full descriptive field set, and `contentHash` is `/^[a-f0-9]{7}$/` |
| `renderMetadataYaml({ displayName, category, slug, contentHash })` | no `cliDescription` / `usageGuidance`                                   | both are required by the strict metadata schema                                               |
| `renderMetadataYaml({ contentHash: "hash-project-vitest" })`       | a non-hex content hash                                                  | same pattern rule                                                                             |

The helper's own docstring recorded the assumption that let this stand: "a bare
`# <agentName>` heading with no frontmatter, **which is all `doctor` and `list` need to see
an agent as present**". True at the time, and precisely the kind of coupling that rots — the
fixture was shaped to the weakest reader rather than to the writer it was standing in for.

Two tests had also **encoded the gap as an invariant**: `doctor-diagnostics`' "orphaned skill
dirs" and `doctor-dual-scope`'s "detects orphaned skill directory" both asserted that a skill
directory with no `metadata.yaml` produces no finding at all, with a comment explaining that
doctor only checks orphaned agent files. That was a description of what the code happened not
to do, promoted to a guarantee.

## Fix Applied

Fixtures corrected to the shape the product writes: `writeAgentFile`'s `frontmatter: true`
now emits `name` + `description`; `FORKED_FROM_METADATA` carries the full descriptive field
set and a hex `contentHash`; the five incomplete `renderMetadataYaml` call sites in
doctor-touching tests were completed. The two tests asserting the absence of a finding now
assert the finding — a skill directory missing `metadata.yaml` is reported with its path,
whether or not any config references it.

`src/cli/lib/__tests__/commands/doctor.test.ts` had the same two shapes (a bare-heading agent
`.md`, an ejected skill with `SKILL.md` and no `metadata.yaml`) and was corrected the same way.

## Proposed Standard

Add to `.ai-docs/standards/e2e/README.md`, under fixture construction:

> **A fixture that stands in for CLI-written content must satisfy the schema the CLI writes
> against.** An agent `.md` needs `name` and `description`; an installed skill needs both
> `SKILL.md` and a `metadata.yaml` that passes `metadataValidationSchema`, `contentHash`
> included. Do not shape a fixture to the weakest command that reads it — the next command to
> read it more carefully will fail, and the failure will look like a product bug.

The mechanical half is cheaper than the prose half: the writers in
`src/cli/lib/__tests__/content-generators.ts` could validate their own output against the
same schemas and throw, which would have caught all nine at the moment they were written
rather than at the moment a command grew teeth.
