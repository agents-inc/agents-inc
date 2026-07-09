---
date: 2026-04-13
proposer: codex-keeper
status: absorbed
resolution_date: 2026-04-21
resolution_note: |
  Phase 1 (frontmatter) — done: all reference/ docs carry scope/area/keywords/related/last_validated.
  Phase 2 (subdirectory reorganization) — done: architecture/, commands/, concepts/,
  wizard/, types/, testing/, config/, features/ subdirs exist and hold split content
  (e.g. concepts/scope-system.md, concepts/tombstone-pattern.md, concepts/guard-pattern.md;
  wizard/{flow,state-transitions,store-map,component-patterns}.md; types/{core-types,operations-types,zod-schemas}.md;
  testing/{infrastructure,factories,mock-data,e2e-infrastructure}.md).
  Phase 3 (pointer stubs at root) — done: type-system.md, test-infrastructure.md,
  state-transitions.md (now 25 lines, canonical at wizard/state-transitions.md), and
  commands.md (now 23 lines, canonical at commands/index.md) are all thin pointer stubs.
  No dual-home drift risk remains. Proposal fully absorbed.
---

# Documentation Restructure Proposal

## Current State

The `.ai-docs/reference/` directory has 18 documentation files with two organizational layers:

```
reference/
  architecture-overview.md    # 295 lines
  boundary-map.md
  commands.md                 # 492 lines
  component-patterns.md       # 370 lines
  dependency-graph.md
  findings-impact-report.md
  state-transitions.md        # 434 lines
  store-map.md                # 245 lines
  test-infrastructure.md      # 774 lines
  type-system.md              # 449 lines
  features/
    agent-system.md
    compilation-pipeline.md
    configuration.md           # 302 lines
    operations-layer.md
    plugin-system.md
    skills-and-matrix.md
    wizard-flow.md             # 312 lines
```

## Problems Identified

### 1. Monolithic files with mixed concerns

Several files cover multiple orthogonal topics, making it hard for AI agents to find the specific information they need without reading irrelevant content:

- **`state-transitions.md`** (434 lines) covers: step transitions, action side effects, reset behaviors, initial state, hotkey mappings, derived state, AND domain agents mapping. An agent looking for "what happens when toggleAgent is called" must scan through navigation transitions, reset matrices, etc.

- **`type-system.md`** (449 lines) mixes: generated union types, core data structures, operations layer types, edit command types, Zod schemas, type guards, and typed object helpers. An agent looking for the `ConfigChanges` type must wade through 300+ lines of matrix types first.

- **`test-infrastructure.md`** (774 lines) is the largest doc. It covers: Vitest config, unit test directory structure, E2E directory structure, POM infrastructure, custom matchers, factory functions (48 entries), helper functions (15 entries), assertion helpers (11 entries), mock data constants, and test anti-patterns.

### 2. No cross-cutting concept documentation

Concepts that span multiple files have no dedicated home:

- **Scope system** (project vs global): Documented in `architecture-overview.md` (section 11), `wizard-flow.md` (guards), `state-transitions.md` (scope actions), `configuration.md` (scope-aware splitting), `component-patterns.md` (dual-scope badges). An agent implementing scope-related changes must read 5 documents.

- **Tombstone/excluded pattern**: Spread across `architecture-overview.md` (section 12), `state-transitions.md` (toggle actions), `wizard-flow.md` (guards), `configuration.md` (config writer). No single source of truth for the full lifecycle.

- **Guard pattern**: `wizard-flow.md` documents guards for specific actions but there's no unified view of ALL guards and their conditions.

### 3. Flat taxonomy at root level

Files at the root of `reference/` have no clear relationship to each other. `store-map.md` is related to `state-transitions.md` which is related to `component-patterns.md`, but there's no structural signal of this.

### 4. No machine-readable metadata

Docs lack frontmatter that would help AI agents quickly determine relevance without reading the full content. An agent working on "the edit command's scope migration" has no way to know which docs are relevant without reading all of them.

## Proposed Structure

### Phase 1: Add frontmatter (low risk, high value)

Add YAML frontmatter to every doc with:

```yaml
---
scope: reference
area: wizard | commands | types | config | testing | architecture
keywords: [scope, tombstone, guard, toggle, migration]
related:
  - reference/store-map.md
  - reference/state-transitions.md
last_validated: 2026-04-13
---
```

Benefits:

- AI agents can grep for `keywords: [.*scope.*]` to find relevant docs
- `related:` field creates explicit cross-references
- `area:` enables filtering by subsystem
- Zero risk of breaking existing doc consumers

### Phase 2: Subdirectory reorganization (medium risk)

Reorganize into domain-scoped subdirectories:

```
reference/
  architecture/
    overview.md              # From architecture-overview.md (sections 1-10)
    dependency-graph.md      # From dependency-graph.md
    boundary-map.md          # From boundary-map.md
  concepts/                  # NEW: Cross-cutting concerns
    scope-system.md          # Consolidates scope docs from 5 files
    tombstone-pattern.md     # Consolidates excluded/tombstone lifecycle
    guard-pattern.md         # Unified view of all store guards
  commands/
    index.md                 # From commands.md (command table + shared patterns)
    init.md                  # Detailed init command
    edit.md                  # Detailed edit command (+ ConfigChanges, migration)
  wizard/
    flow.md                  # From wizard-flow.md
    state-transitions.md     # From state-transitions.md (step transitions + reset)
    store-map.md             # From store-map.md
    component-patterns.md    # From component-patterns.md
  types/
    core-types.md            # From type-system.md (generated types, core structures)
    operations-types.md      # From type-system.md (operations layer types)
    zod-schemas.md           # From type-system.md (schema reference)
  config/
    configuration.md         # From features/configuration.md
    config-writer.md         # Split from configuration.md (detailed writer docs)
  features/
    compilation-pipeline.md
    skills-and-matrix.md
    plugin-system.md
    agent-system.md
    operations-layer.md
  testing/
    infrastructure.md        # From test-infrastructure.md (framework config)
    factories.md             # From test-infrastructure.md (factory reference)
    mock-data.md             # From test-infrastructure.md (mock data constants)
    e2e-infrastructure.md    # From test-infrastructure.md (E2E-specific)
  findings-impact-report.md
```

Benefits:

- Related docs grouped physically (wizard/ has flow + store + transitions)
- Cross-cutting concepts have a single authoritative source
- Large monolithic files split into focused documents
- Directory names provide semantic context

Risks:

- DOCUMENTATION_MAP.md needs full rewrite
- All cross-references between docs need updating
- Other agents' cached file paths become stale
- One-time migration effort is substantial

### Phase 3: Split large monolithic files (depends on Phase 2)

Split the 3 largest files:

1. **`test-infrastructure.md` (774 lines) -> 4 files:**
   - `testing/infrastructure.md` -- Vitest config, project setup, directory structure
   - `testing/factories.md` -- All factory function tables
   - `testing/mock-data.md` -- Mock data constant registry
   - `testing/e2e-infrastructure.md` -- E2E POM, matchers, fixtures, timeout infrastructure

2. **`type-system.md` (449 lines) -> 3 files:**
   - `types/core-types.md` -- Generated unions, core data structures, named aliases
   - `types/operations-types.md` -- Operations layer types
   - `types/zod-schemas.md` -- Schema reference tables

3. **`state-transitions.md` (434 lines) -> 2 files:**
   - `wizard/state-transitions.md` -- Step transitions, reset matrix, initial state
   - Inline the hotkey-action mapping and guard tables into `wizard/flow.md`

## Recommendation

**Start with Phase 1 only.** Frontmatter adds immediate value with zero structural risk. Phases 2 and 3 should only be pursued if the team finds that agents regularly struggle to locate relevant docs -- measure the problem first.

Phase 1 implementation estimate: 1 session (add frontmatter to 18 files, update DOCUMENTATION_MAP with keyword index).

## Decision Needed

- Approve Phase 1 (frontmatter)?
- Approve Phase 2 (directory restructure)?
- Defer Phases 2-3 until evidence of agent navigation problems?
