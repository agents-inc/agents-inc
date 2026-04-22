---
scope: reference
area: testing
keywords: [test-infrastructure, pointer, split]
related:
  - reference/testing/infrastructure.md
  - reference/testing/factories.md
  - reference/testing/mock-data.md
  - reference/testing/e2e-infrastructure.md
last_validated: 2026-04-21
---

# Test Infrastructure (Pointer)

**Last Updated:** 2026-04-21
**Last Validated:** 2026-04-21

> This file was **split** into domain-scoped children under `testing/`. The previous body had drifted (2026-04-13) against the split children (2026-04-21) — notably missing the dual-scope POM, `waitForStableRender`, `BaseStep` primitives, and the `test-fs-utils` / `expected-values` extractions. This pointer exists because inbound links (CLAUDE.md, older docs, agent findings) still reference `reference/test-infrastructure.md` — do NOT delete without sweeping those references first.

## Where the content lives now

| Topic                                                                                        | File                                                             |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Vitest projects, config, directory structure, code patterns, constants, anti-patterns        | [testing/infrastructure.md](./testing/infrastructure.md)         |
| Factories (`createMockSkill`, `buildProjectConfig`, `createMockMatrix`), helpers, assertions | [testing/factories.md](./testing/factories.md)                   |
| `SKILLS`, `AGENT_DEFS`, mock matrices, mock stacks, canonical test fixtures                  | [testing/mock-data.md](./testing/mock-data.md)                   |
| E2E POM, dual-scope, `waitForStableRender`, BaseStep contract, matchers, fixtures            | [testing/e2e-infrastructure.md](./testing/e2e-infrastructure.md) |
