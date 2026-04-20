---
type: convention-drift
severity: low
affected_files:
  - e2e/lifecycle/preloaded-preservation.e2e.test.ts
  - e2e/lifecycle/stack-per-agent-curation.e2e.test.ts
  - e2e/lifecycle/re-edit-cycles.e2e.test.ts
  - e2e/lifecycle/dual-scope-edit-integrity.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/README.md
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-04-17
reporting_agent: cli-tester
category: dry
domain: e2e
root_cause: convention-undocumented
---

## What Was Wrong

Multiple E2E lifecycle tests hand-roll their own helpers to parse the
CLI-written `config.ts` back into a structured value. Each one implements a
regex-or-brace-matching extractor that is subtly different from the others:

- `preloaded-preservation.e2e.test.ts` has `extractStack(configContent)` — finds
  `const stack`, brace-matches, `JSON.parse`s.
- `stack-per-agent-curation.e2e.test.ts` (this change) replicates the exact
  same function plus a small `findAssignment` helper.
- `re-edit-cycles.e2e.test.ts` has `parseConfigArrays(configContent)` — a regex
  pass that extracts top-level `skills[]`, `agents[]`, `domains[]` ids/names
  using a two-strategy fallback.
- `dual-scope-edit-integrity.e2e.test.ts` inline-extracts a `const stack`
  regex match and a bespoke `extractAgentKeys` regex.

All four target the same file format produced by `generateConfigSource` in
`src/cli/lib/configuration/config-writer.ts`. The format is well-defined
(typed named variables + `export default` preamble). A shared reader would
replace ~60 LOC of near-duplicate parsing and give every new D-series red test
a ready-made seam.

## Fix Applied

None — discovery only. The duplication was NOT introduced by this change;
`stack-per-agent-curation.e2e.test.ts` deliberately replicates the
`preloaded-preservation` extractor to keep diff scope minimal and avoid
touching a passing test. The finding is recorded so the CLAUDE.md test-data
factory pattern (helpers.ts / fixtures) can be extended to E2E parsing.

## Proposed Standard

Extract a single parser helper — `e2e/helpers/config-parser.ts` —
exporting:

- `parseConfigStack(configContent: string): Partial<Record<AgentName, StackAgentConfig>>`
- `parseConfigSkills(configContent: string): SkillConfig[]`
- `parseConfigAgents(configContent: string): AgentScopeConfig[]`
- `parseConfigDomains(configContent: string): Domain[]`
- (optionally) `parseFullConfig(configContent: string): ProjectConfig`

A simpler alternative: re-use the existing `loadProjectConfig` from
`src/cli/lib/configuration/config-loader.ts`. It already loads a `.ts` config
via jiti and returns a typed `ProjectConfig`. Tests could call it directly,
eliminating all hand-rolled regex.

Add to `.ai-docs/standards/e2e/test-data.md`:

> **Never hand-roll config.ts parsers in E2E tests.** Use
> `parseConfigStack` / `parseConfigSkills` / ... from
> `e2e/helpers/config-parser.ts`, or call `loadProjectConfig` directly from
> `src/cli/lib/configuration/config-loader.ts`. Regex / brace-matching
> extractors drift across tests and break silently when `config-writer.ts`
> tweaks its output shape.
