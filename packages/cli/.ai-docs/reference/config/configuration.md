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
  - reference/architecture/overview.md
  - reference/types/core-types.md
last_validated: 2026-08-01
---

# Configuration System

> **Pointer.** The content lives in [`reference/features/configuration.md`](../features/configuration.md). This path is kept because inbound links still use it.

## Where Content Lives

| Topic                                                                                                   | Destination                                                                                          |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Config file locations, `ProjectConfig` / `SkillConfig` / `AgentScopeConfig` shapes, source resolution   | [../features/configuration.md](../features/configuration.md)                                         |
| `ConfigLoadError` — missing vs blank vs unloadable config                                               | [../features/configuration.md](../features/configuration.md)                                         |
| `defaultCategories` definitions, exclusive/required counts, ordering rule                               | [../features/configuration.md](../features/configuration.md)                                         |
| Cross-scope reconciliation (masking, self-heal, mask lifetime)                                          | [../features/configuration.md](../features/configuration.md), [config-writer.md](./config-writer.md) |
| Config writer internals, `generateProjectConfigWithInlinedGlobal`, union emission                       | [config-writer.md](./config-writer.md)                                                               |
| `writeScopedFromWizard` branches, `propagateGlobalChangesToProjects`, the `projects` registry lifecycle | [config-writer.md](./config-writer.md)                                                               |
| `config-types.ts` writer selection, `reconcileTypesFromDisk`, the config-gate and its enforcement       | [config-writer.md](./config-writer.md)                                                               |
| Merge semantics: `mergeConfigs`, `mergeGlobalConfigs`, `additiveMergeStack`, `mergeAgentCategories`     | [config-merger.md](./config-merger.md)                                                               |
| Scope partitioning: `splitConfigByScope`, the D-220 delta pipeline                                      | [scope-split.md](./scope-split.md)                                                                   |
| Cross-cutting scope model (project vs global paths, install-path resolution)                            | [../concepts/scope-system.md](../concepts/scope-system.md)                                           |
| Tombstone / derived-mask lifecycle                                                                      | [../concepts/tombstone-pattern.md](../concepts/tombstone-pattern.md)                                 |

## Why This Path Is Kept

Inbound links from `DOCUMENTATION_MAP.md`, the sibling `config/*.md` files' `related:` frontmatter, and agent findings that cite `reference/config/configuration.md` as the config-area entry point.
