---
type: standard-gap
severity: medium
affected_files:
  - packages/cli/src/cli/lib/__tests__/commands/uninstall.test.ts
  - packages/cli/src/cli/commands/uninstall.tsx
  - packages/cli/src/cli/components/common/skill-agent-summary.tsx
standards_docs:
  - packages/cli/.ai-docs/standards/e2e/README.md
date: 2026-10-22
reporting_agent: cli-developer
category: testing
domain: cli
root_cause: rule-not-visible
status: resolved
resolved_by: >-
  uninstall.test.ts gained "names each copy it removes as that copy's metadata.yaml records it",
  whose copy records a name the built-in catalogue does not hold for its id, and
  e2e/commands/uninstall.e2e.test.ts gained a spec over copies `init --from` wrote, whose fixture
  ids no built-in catalogue holds. Both were red before uninstall read each copy's name.
---

## What Was Wrong

`what uninstall says` in `uninstall.test.ts` pinned `- React ⏏` in uninstall's panel while a real
uninstall drew the raw id of every copy the built-in catalogue does not know. The review read the
pass as coming from the spec's `beforeEach`, which seeds a matrix with `initializeMatrix`. It does
not: `runCliCommand` runs the command from `dist/`, which bundles its own `matrix-provider` and
starts it as `BUILT_IN_MATRIX`, so the seeded matrix lives in a module instance the command never
reads. The name came from the built-in catalogue, which holds `web-framework-react` as `React`.

Checks, run here:

- `grep -l "Skill not found: " dist/*.js` names the bundle chunks carrying their own provider, and
  the first of them holds `web-framework-react` (`grep -c` answered 144).
- `grep -n '"web-framework-react"' -A8 src/cli/types/generated/matrix.ts | grep displayName`
  answers `displayName: "React"`.
- A copy recording `displayName: "Acme React"` drew `- React ⏏` under `Marketplace Agents Inc`
  before the fix, so the command read the built-in catalogue and never the copy.

The seeding is still needed: `writeTestSkill` reads the test process's own matrix to write the
copy's metadata.yaml. It just cannot reach the command.

## Fix Applied

uninstall reads each copy's `displayName` in the same metadata.yaml read that finds `forkedFrom`,
and hands the names to the panel (`skillNames` on `SkillAgentSummaryProps`), where a name read off
a copy stands over the catalogue's. The fixture writer `createCLISkill` stopped overriding the
copy's `displayName` with its id, so its copies carry the source's name as an install writes it.
The discriminating spec gives a copy a name the built-in catalogue does not hold for its id.

## Proposed Standard

In `standards/e2e/README.md`, or the unit-spec section of the testing standards: a command spec
that pins a skill's display name proves the command read that name only when the id is one the
built-in catalogue lacks, or the name is one it does not hold. A catalogue id with its catalogue
name passes on `BUILT_IN_MATRIX` whatever the command loaded, because `dist/` carries that
catalogue. Fixture-marketplace ids (`testMarketplaceSkillId`, `e2eSkillId`) are the ready way to
meet this. No conflict with CLAUDE.md found; it sits beside the rule that a rendering assertion
keeps its literal.
