---
type: anti-pattern
severity: high
affected_files:
  - src/cli/lib/installation/local-installer.ts
standards_docs:
  - .ai-docs/reference/config/config-writer.md
  - .ai-docs/reference/features/configuration.md
date: 2026-04-20
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: 0.141.0 — both `writeScopedConfigs` and `propagateGlobalChangesToProjects` now route project config-types through `regenerateConfigTypes` (see `src/cli/lib/installation/local-installer.ts` `regenerateConfigTypes` call site), restoring the import-from-global branch.
---

## What Was Wrong

`writeScopedConfigs` and `propagateGlobalChangesToProjects` in
`src/cli/lib/installation/local-installer.ts` both called
`writeStandaloneConfigTypes` for the PROJECT `config-types.ts` write path. This
bypassed the global-aware branch in `regenerateConfigTypes`
(`config-types-writer.ts`) that emits

```ts
import type {
  SkillId as GlobalSkillId,
  AgentName as GlobalAgentName,
  Domain as GlobalDomain,
  Category as GlobalCategory,
} from "../../.claude-src/config-types";

export type SkillId = GlobalSkillId | "project-only-skill-1";
```

Instead every project got a standalone `config-types.ts` with fully inlined
unions of BOTH global and project items — duplicating the global unions and
diverging from the "project imports from global" architecture that
`generateProjectConfigTypesSource` already implemented (D-76 / D-80, commit
`e0cc321`, 2026-03-10).

Concretely this produced two symptom clusters:

1. **D-216 Regression #1** — `cc init` / `cc edit` in a project dir generated
   project types as standalone. Global skill IDs were duplicated in every
   project's types file instead of being imported from the global types.
2. **D-228** — `cc init` / `cc edit` at HOME with registered projects
   re-wrote every project's `config-types.ts` via
   `propagateGlobalChangesToProjects` using the same standalone path —
   overwriting any correct import-form output from a prior project-scope run.

The generator side (`generateProjectConfigTypesSource`) had been fully working
and tested for months (`config-types-writer.test.ts:817` onward). Only the
write-site call was wrong.

## Fix Applied

Replaced both `writeStandaloneConfigTypes` invocations that target project
config-types paths with `regenerateConfigTypes(projectDir, Promise.resolve(data), extras)`:

- `writeScopedConfigs`: project branch (was at line 869)
- `propagateGlobalChangesToProjects`: per-project propagation loop (was at line 715)

The global-root and global-config write paths (line 787 in the global-root
branch, line 836 when the project install adds global items) still use
`writeStandaloneConfigTypes` — those are legitimately global types files that
must inline their own unions.

Added two helpers kept near `writeScopedConfigs` for orchestrator-local reuse:

- `buildConfigTypesBackgroundData(matrix, agents)` — wraps the already-loaded
  matrix and agents into the `ConfigTypesBackgroundData` shape that
  `regenerateConfigTypes` expects (no re-load required).
- `buildProjectTypesExtras(finalConfig, matrix)` — derives project-only
  `extraSkillIds`, `extraAgentNames`, `extraCategories`, and `extraDomains`
  from project-scoped entries in the config. Categories and domains are
  looked up through the matrix so a project skill that introduces a new
  category/domain is included in the project's union extension.

Added three unit tests in `local-installer.test.ts`:

1. `writeScopedConfigs — project config-types imports from global` (3 tests)
   covering: global exists → import form emitted; no project items → aliases
   to global directly; no global install → falls back to standalone.
2. `propagateGlobalChangesToProjects — project config-types imports from
global` (1 test) covering the analog for the propagation write site.

Added `vi.mock("../../consts", ...)` at file top to pin `GLOBAL_INSTALL_ROOT`
to a non-existent path so the dev machine's real `~/.claude-src/` never
affects tests. The new describes override it via `Object.defineProperty` to
point at a test-controlled fake home.

Extended `e2e/lifecycle/project-tracking-propagation.e2e.test.ts` to assert
the new contract end-to-end: after global init → project init, the project's
`config-types.ts` must import `GlobalSkillId` / `GlobalAgentName` /
`GlobalDomain` / `GlobalCategory` and must NOT inline any global skill IDs.
The old assertion (`toContain("web-framework-react")`) was the wrong contract —
it encoded the pre-fix standalone behavior. Preserved the value-side global
types assertion (globals still inline in the GLOBAL types file).

## Proposed Standard

Add to `.ai-docs/reference/config/config-writer.md` and
`.ai-docs/reference/features/configuration.md` the following rule:

> **Writer selection rule.** When writing a PROJECT `config-types.ts`
> (`<projectDir>/.claude-src/config-types.ts` where `projectDir` is not the
> global install root), always call `regenerateConfigTypes`. When writing a
> GLOBAL `config-types.ts` (`~/.claude-src/config-types.ts`), call
> `writeStandaloneConfigTypes` / `generateConfigTypesSource` directly. Never
> call `writeStandaloneConfigTypes` for a project path — it bypasses the
> import-from-global branch and produces duplicated standalone unions.

A matching check could live in code review: grep for
`writeStandaloneConfigTypes(` in `src/cli/lib/installation/` and confirm each
call targets the global path (first arg ends in `~/.claude-src/config.ts` or
a global config write).
