---
scope: reference
area: config
keywords:
  [
    config,
    source-resolution,
    ProjectConfig,
    SkillConfig,
    config-writer,
    config-generator,
    scope-splitting,
    branding,
  ]
related:
  - reference/config/config-writer.md
  - reference/config/config-merger.md
  - reference/config/scope-split.md
  - reference/concepts/scope-system.md
  - reference/architecture-overview.md
  - reference/types/core-types.md
last_validated: 2026-08-18
---

# Configuration System

> **Pointer.** The content lives in [`reference/features/configuration.md`](../features/configuration.md). This path is kept because inbound links still use it.

**This file is a stub, not a second writable copy — confirmed 2026-08-18.** Every row below is a
redirect; nothing here states a fact about the CLI that its destination does not own, so the
`config/configuration.md` ÷ `features/configuration.md` pair is not the "two writable copies of one
list" condition `standards/documentation-bible.md` § "A Count Lives in Exactly One Document"
forbids. It was checked precisely because a same-named pair across two directories is what that
condition usually looks like. **Keep it that way:** a fact added here rather than at the
destination is the defect, and the redirect table is the only content this file may hold.

## Where Content Lives

| Topic                                                                                                                       | Destination                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Config file locations, `ProjectConfig` / `SkillConfig` / `AgentScopeConfig` shapes, source resolution                       | [../features/configuration.md](../features/configuration.md)                                         |
| `ConfigLoadError` — missing vs blank vs unloadable config                                                                   | [../features/configuration.md](../features/configuration.md)                                         |
| `loadConfig`'s five outcomes, `ConfigSchemaError` / `ConfigDefaultExportError`, and `loadSourceConfig`'s selective re-raise | [../features/configuration.md](../features/configuration.md)                                         |
| Marketplace resolution: `--marketplace`, `CC_MARKETPLACE`, the `marketplace` / `marketplaceName` split                      | [../features/configuration.md](../features/configuration.md)                                         |
| `resolveEffectiveGlobalConfig`'s two resolutions (`addSessionToGlobal` / `matchGlobalToSession`)                            | [config-merger.md](./config-merger.md)                                                               |
| Emitted `config-types.ts` aliases and the four custom-vs-marketplace predicates                                             | [config-writer.md](./config-writer.md)                                                               |
| `defaultCategories` definitions, exclusive/required counts, ordering rule                                                   | [../features/configuration.md](../features/configuration.md)                                         |
| Cross-scope reconciliation (masking, self-heal, mask lifetime)                                                              | [../features/configuration.md](../features/configuration.md), [config-writer.md](./config-writer.md) |
| Config writer internals, `generateProjectConfigWithInlinedGlobal`, union emission                                           | [config-writer.md](./config-writer.md)                                                               |
| `writeScopedFromWizard` branches, `propagateGlobalChangesToProjects`, the `projects` registry lifecycle                     | [config-writer.md](./config-writer.md)                                                               |
| `config-types.ts` writer selection, `reconcileTypesFromDisk`, the config-gate and its enforcement                           | [config-writer.md](./config-writer.md)                                                               |
| Merge semantics: `mergeConfigs`, `mergeGlobalConfigs`, `additiveMergeStack`, `mergeAgentCategories`                         | [config-merger.md](./config-merger.md)                                                               |
| Scope partitioning: `splitConfigByScope`, the per-agent curation delta pipeline                                             | [scope-split.md](./scope-split.md)                                                                   |
| Cross-cutting scope model (project vs global paths, install-path resolution)                                                | [../concepts/scope-system.md](../concepts/scope-system.md)                                           |
| Tombstone / derived-mask lifecycle                                                                                          | [../concepts/tombstone-pattern.md](../concepts/tombstone-pattern.md)                                 |

## Why This Path Is Kept

Inbound links from `DOCUMENTATION_MAP.md`, the sibling `config/*.md` files' `related:` frontmatter, and agent findings that cite `reference/config/configuration.md` as the config-area entry point.
