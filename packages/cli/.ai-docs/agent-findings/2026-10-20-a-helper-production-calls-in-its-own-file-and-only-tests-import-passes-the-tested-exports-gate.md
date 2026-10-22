---
type: standard-gap
severity: low
affected_files:
  - packages/cli/src/cli/lib/__tests__/tested-exports-reach-production.test.ts
  - packages/cli/src/cli/lib/resolver.ts
  - packages/cli/src/cli/lib/schemas.ts
  - packages/cli/src/cli/lib/source-validator.ts
  - packages/cli/src/cli/lib/versioning.ts
  - packages/cli/src/cli/lib/agents/agent-plugin-compiler.ts
  - packages/cli/src/cli/lib/plugins/plugin-validator.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-10-20
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: enforcement-gap
status: partial
partial_note: >-
  Fixed for the lib/{agents,plugins,skills} and lib/*.ts lane in the REPO-44 test prune. The census
  over the rest of packages/cli has not been worked.
---

## What Was Wrong

Twelve helpers in `packages/cli/src/cli/lib` were exported only so a test could call them. This
is a census of the lane's modules, not of the package. Each one has a production caller inside its
own file:

- `resolver.ts`: `resolveSkillReference`, `resolveAgentSkillRefs`
- `schemas.ts`: `categoryPathSchema`, `isCustomMetadata`
- `source-validator.ts`: `isSnakeCase`, `checkSnakeCaseKeys`, `checkDirNameMatchesSkillId`,
  `validateSkillFilePairs`
- `versioning.ts`: `parseMajorVersion`, `bumpMajorVersion`
- `agents/agent-plugin-compiler.ts`: `compileAgentPlugin`
- `plugins/plugin-validator.ts`: `validatePluginStructure`

Their specs reddened on folding a helper into its caller, a refactor that keeps behaviour.

`tested-exports-reach-production.test.ts` cannot see this. It asks whether the package ever
INVOKES an export, and production invokes each of these inside its own module. The finding
`2026-10-20-a-test-of-a-package-private-export-is-its-only-reader-and-knip-counts-it-as-one` says
that gate "covers this class for `packages/cli` alone". It covers the never-invoked half only.

## Fix Applied

Each spec was rewritten through the module's public entry (`resolveAgents`, `validateSkillMetadata`,
`validateSource`, `determinePluginVersion`, `compileAllAgentPlugins`, `validatePlugin`) or
deleted where one already covered it. The twelve lost their `export`.

`resolveSkillReferences` and `validatePluginManifest` stay exported, because tests in other lanes
import them: `__tests__/agent-protocol-carries-stated-usage-guidance.test.ts` and
`__tests__/kebab-name-judges-agree.test.ts`.

## Proposed Standard

Use the census the matrix finding proposes in `packages/cli` too:
`npx knip --workspace packages/cli --production --include exports,types`. Every name it prints is
an export that only a test, a script or a re-export reads. Each one is either intended (a test
utility, a re-export a gate pins) or a helper whose spec should go through its caller. This stays a
census rather than a gate, as the repository rules knip is not a gate. Nothing in `CLAUDE.md`
conflicts with it.
